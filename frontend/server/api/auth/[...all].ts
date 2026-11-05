import { defineEventHandler, getRequestURL, setHeader, setResponseStatus, toWebRequest, type H3Event } from 'h3'
import { AUTH_BASE_PATH, AUTH_CLIENT_IP_HEADER, createAuth, getAuth } from '../../core/better-auth.ts'
import { ApiError } from '../../core/errors.ts'
import { applyApiHeaders } from '../../core/http.ts'
import { notifyFailure } from '../../core/notifications.ts'
import { changePasswordRequestSchema, requestPasswordResetSchema, resetPasswordRequestSchema } from '../../../shared/schemas/auth.ts'
import { passwordResetMailSettings } from '../../services/password-reset-mail.ts'
import { clientAddress, RateLimiterUnavailableError } from '../../core/rate-limit.ts'

// Expose only these native flows. Other mutations cannot bypass app-level cleanup.
const endpoints: Record<string, readonly string[]> = {
  '/sign-up/email': ['POST'],
  '/sign-in/email': ['POST'],
  '/sign-out': ['POST'],
  '/get-session': ['GET'],
  '/change-password': ['POST'], '/request-password-reset': ['POST'], '/reset-password': ['POST'],
}

export function authRequest(event: H3Event): Request {
  const request = toWebRequest(event)
  const headers = new Headers(request.headers)
  // Never allow the browser to supply the private header or trust arbitrary XFF.
  headers.set(AUTH_CLIENT_IP_HEADER, clientAddress(event))
  return new Request(request, { headers })
}

export function authRateLimitResponse(response: Response): Response {
  if (response.status !== 429) return response
  const headers = new Headers(response.headers)
  const delay = Number(headers.get('Retry-After') || headers.get('X-Retry-After'))
  headers.set('Retry-After', String(Number.isFinite(delay) && delay > 0 ? Math.ceil(delay) : 1))
  headers.set('Cache-Control', 'no-store')
  return Response.json({ code: 'rate_limit_exceeded', message: '操作が集中しています。しばらく待ってからお試しください' }, { status: 429, headers })
}

export async function handleAuth(event: H3Event): Promise<unknown> {
  try {
    if (applyApiHeaders(event)) return ''
    const path = getRequestURL(event).pathname.slice(AUTH_BASE_PATH.length)
    if (!endpoints[path]?.includes(event.method)) {
      setResponseStatus(event, 404)
      return { code: 'NOT_FOUND', message: '対象が見つかりません' }
    }
    let request = authRequest(event)
    const schema = path === '/change-password' ? changePasswordRequestSchema
      : path === '/request-password-reset' ? requestPasswordResetSchema
        : path === '/reset-password' ? resetPasswordRequestSchema : null
    if (schema) {
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ApiError(415, 'unsupported_media_type', 'JSON形式で送信してください')
      let body: unknown
      try { body = await request.json() } catch { throw new ApiError(400, 'validation_error', '入力内容を確認してください') }
      const parsed = schema.safeParse(body)
      if (!parsed.success) throw new ApiError(422, 'validation_error', '入力内容を確認してください')
      if (path === '/request-password-reset') {
        try { passwordResetMailSettings() } catch {
          const unavailable = new ApiError(503, 'password_reset_unavailable', 'メールによる再設定は現在利用できません')
          unavailable.expectedUnavailability = true
          throw unavailable
        }
      }
      // The server fixes session revocation and callback destination, even for direct callers.
      const normalized = path === '/change-password' ? { ...parsed.data, revokeOtherSessions: true }
        : path === '/request-password-reset' ? { ...parsed.data, redirectTo: '/reset-password' } : parsed.data
      request = new Request(request.url.split('?')[0]!, { method: 'POST', headers: request.headers, body: JSON.stringify(normalized) })
    }
    const lifecycle = event as H3Event & { waitUntil?: (promise: Promise<unknown>) => void }
    // Nitro keeps the real delivery alive after responding. Standalone H3 awaits it.
    const auth = path === '/request-password-reset' && lifecycle.waitUntil
      ? createAuth(undefined, undefined, promise => lifecycle.waitUntil!(promise)) : getAuth()
    const response = await auth.handler(request)
    if (response.status < 500) return authRateLimitResponse(response)
    await notifyFailure('auth', response.status, false)
    return Response.json({ code: 'INTERNAL_SERVER_ERROR', message: '処理に失敗しました' }, { status: response.status })
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500
    setResponseStatus(event, status)
    if (error instanceof RateLimiterUnavailableError) setHeader(event, 'Retry-After', 60)
    if (status >= 500) {
      console.error(JSON.stringify({ category: 'authentication', status }))
      await notifyFailure('auth', status, error instanceof ApiError && error.expectedUnavailability)
    }
    return { code: error instanceof ApiError ? error.code : 'INTERNAL_SERVER_ERROR',
      message: error instanceof ApiError ? error.message : '処理に失敗しました' }
  }
}

export default defineEventHandler(handleAuth)
