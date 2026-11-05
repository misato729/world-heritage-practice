import { createHmac, randomBytes } from 'node:crypto'
import { environment, authBaseURL } from '../core/config.ts'
import { validFrontendOrigin } from './payment-settings.ts'

export function passwordResetMailSettings(env: NodeJS.ProcessEnv = process.env, runtimeEnvironment = environment()) {
  const url = env.PASSWORD_RESET_GAS_URL || ''
  const secret = env.PASSWORD_RESET_GAS_SECRET || ''
  const origin = env.FRONTEND_URL || ''
  let endpoint: URL
  try { endpoint = new URL(url) } catch { throw new Error('Password reset mail is not configured') }
  const official = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)
  const localTest = runtimeEnvironment === 'test' && endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1' && endpoint.pathname === '/exec' && !endpoint.search && !endpoint.hash && !endpoint.username && !endpoint.password
  if (env.PASSWORD_RESET_ENABLED !== 'true' || (!official && !localTest)
    || !/^[a-f0-9]{64}$/.test(secret) || !validFrontendOrigin(origin, runtimeEnvironment) || new URL(origin).origin !== authBaseURL()) {
    throw new Error('Password reset mail is not configured')
  }
  return { url, secret, origin: new URL(origin).origin }
}
export type ResetMailSettings = ReturnType<typeof passwordResetMailSettings>

export async function sendPasswordResetMail(settings: ResetMailSettings, email: string, token: string, request = fetch) {
  const requestId = randomBytes(16).toString('hex')
  const payload = JSON.stringify({ version: 1, request_id: requestId, issued_at: Date.now(), to: email, token, origin: settings.origin })
  const signature = createHmac('sha256', settings.secret).update(payload).digest('hex')
  const signal = AbortSignal.timeout(15000)
  let response = await request(settings.url, {
    method: 'POST', redirect: 'manual', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, signature }),
  })
  // GAS ContentService returns its result via a one-time Google URL. Follow
  // only that documented redirect, with GET and without the signed body.
  if ([302, 303].includes(response.status)) {
    const location = response.headers.get('location') || ''
    const destination = new URL(location)
    if (destination.protocol !== 'https:' || destination.hostname !== 'script.googleusercontent.com'
      || destination.port || destination.username || destination.password || destination.hash || destination.pathname !== '/macros/echo') throw new Error('Mail relay rejected')
    await response.body?.cancel()
    response = await request(destination.href, { method: 'GET', redirect: 'error', signal })
  }
  if (!response.ok) { await response.body?.cancel(); throw new Error('Mail relay rejected') }
  const result = await response.json() as { ok?: boolean, request_id?: string }
  if (result.ok !== true || result.request_id !== requestId) throw new Error('Mail relay rejected')
}
