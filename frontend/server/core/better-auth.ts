import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { AUTH_PASSWORD_MIN_LENGTH, AUTH_PASSWORD_MAX_LENGTH } from '../../shared/schemas/auth.ts'
import { getDatabase, type Database } from './db.ts'
import { authBaseURL, authSecret, authTrustedOrigins, configuration } from './config.ts'
import { consumeAuthRateLimit, consumeRateLimit, rules } from './rate-limit.ts'
import { deliverPasswordReset } from '../services/password-reset-delivery.ts'

export const SESSION_LIFETIME = 86400
export const AUTH_BASE_PATH = '/api/auth'
// The H3 boundary always replaces this value with the trusted socket/Fly IP.
export const AUTH_CLIENT_IP_HEADER = 'x-template-client-ip'

export function createAuth(database?: Database, resetMailer = deliverPasswordReset, backgroundTaskHandler?: (task: Promise<unknown>) => void) {
  return betterAuth({
    appName: configuration.site.name,
    baseURL: authBaseURL(),
    basePath: AUTH_BASE_PATH,
    secret: authSecret(),
    database: prismaAdapter(database ?? getDatabase(), { provider: 'postgresql', transaction: !database }),
    trustedOrigins: authTrustedOrigins(),
    rateLimit: {
      enabled: true,
      // Better Auth owns path matching and admission before any auth mutation.
      // Its official custom storage hook shares the atomic PostgreSQL store used
      // by application limits and keeps IP addresses out of stored keys.
      customStorage: { consume: consumeAuthRateLimit },
      customRules: {
        '/sign-up/email': { window: rules.signup.period, max: rules.signup.limit },
        '/sign-in/email': { window: rules.login.period, max: rules.login.limit },
        '/change-password': { window: rules.password_change.period, max: rules.password_change.limit },
        '/request-password-reset': { window: rules.password_reset_ip.period, max: rules.password_reset_ip.limit },
        '/reset-password': { window: rules.password_reset_submit.period, max: rules.password_reset_submit.limit },
        '/get-session': false,
        '/sign-out': false,
        '**': false,
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: AUTH_PASSWORD_MIN_LENGTH,
      maxPasswordLength: AUTH_PASSWORD_MAX_LENGTH,
      resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: resetMailer,
    },
    user: {
      modelName: 'user',
      fields: { emailVerified: 'email_verified', createdAt: 'created_at', updatedAt: 'updated_at' },
      additionalFields: { role: { type: ['user', 'admin'], required: false, defaultValue: 'user', input: false } },
      deleteUser: { enabled: false },
      changeEmail: { enabled: false },
    },
    session: {
      modelName: 'authSession',
      fields: { userId: 'user_id', expiresAt: 'expires_at', createdAt: 'created_at', updatedAt: 'updated_at',
        ipAddress: 'ip_address', userAgent: 'user_agent' },
      expiresIn: SESSION_LIFETIME,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    account: {
      modelName: 'authAccount',
      fields: { userId: 'user_id', providerId: 'provider_id', accountId: 'account_id', accessToken: 'access_token',
        refreshToken: 'refresh_token', idToken: 'id_token', accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at', createdAt: 'created_at', updatedAt: 'updated_at' },
      accountLinking: { enabled: false },
    },
    verification: {
      modelName: 'authVerification',
      storeIdentifier: 'hashed',
      fields: { expiresAt: 'expires_at', createdAt: 'created_at', updatedAt: 'updated_at' },
    },
    hooks: { before: createAuthMiddleware(async ctx => {
      if (ctx.path !== '/request-password-reset' || typeof ctx.body?.email !== 'string') return
      // Better Auth admits the IP before running endpoint hooks.
      let result
      try { result = await consumeRateLimit('password_reset_email', ctx.body.email.trim().toLowerCase()) }
      catch { throw new APIError('SERVICE_UNAVAILABLE', { code: 'RATE_LIMITER_UNAVAILABLE', message: '一時的に操作できません' }) }
      if (!result.allowed) {
        ctx.setHeader('Retry-After', String(result.retryAfter))
        throw new APIError('TOO_MANY_REQUESTS', { code: 'RATE_LIMITED', message: '操作が集中しています。しばらく待ってからお試しください' })
      }
    }) },
    advanced: {
      ...(backgroundTaskHandler ? { backgroundTasks: { handler: backgroundTaskHandler } } : {}),
      ipAddress: { ipAddressHeaders: [AUTH_CLIENT_IP_HEADER], ipv6Subnet: 128 },
      database: { generateId: 'serial' },
      cookiePrefix: `${configuration.site.id}-auth`,
      useSecureCookies: authBaseURL().startsWith('https:'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
    },
    databaseHooks: {
      user: {
        create: {
          before: async user => {
            const name = user.name.trim()
            if (!name || Array.from(name).length > 100 || user.email.length > 255) {
              throw new APIError('BAD_REQUEST', { code: 'INVALID_USER_INPUT', message: '名前は1〜100文字、メールアドレスは255文字以内で入力してください' })
            }
            return { data: { ...user, name } }
          },
        },
      },
    },
    // Unsupported mutations and query-token callbacks stay closed. HTTP also uses an allowlist.
    disabledPaths: ['/delete-user', '/delete-user/callback',
      '/reset-password/:token', '/change-email', '/set-password', '/update-user',
      '/send-verification-email', '/verify-email', '/sign-in/social', '/link-social', '/unlink-account'],
    telemetry: { enabled: false },
    logger: {
      level: 'warn',
      // Library errors can contain SQL/user input: keep diagnostic categories only.
      log: level => { console.error(JSON.stringify({ category: 'authentication', level })) },
    },
  })
}

export type TemplateAuth = ReturnType<typeof createAuth>
let instance: TemplateAuth | undefined
export function getAuth(): TemplateAuth { return instance ??= createAuth() }
