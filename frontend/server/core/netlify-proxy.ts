import { isIP } from 'node:net'
import { getHeader, getRequestURL, type H3Event } from 'h3'
import { jwtVerify } from 'jose'
import { ApiError, fail } from './errors.ts'

// Keep the verified address off the request context and out of diagnostic data.
const verifiedAddresses = new WeakMap<H3Event, string>()

function protectedApi(event: H3Event) {
  const path = getRequestURL(event).pathname.replace(/\/$/, '')
  if (!/^\/api(?:\/|$)/.test(path)) return false
  // Fly health checks and Stripe's independently signed webhook arrive directly.
  if (path === '/api/v1/health' && ['GET', 'HEAD'].includes(event.method)) return false
  if (path === '/api/v1/webhooks/stripe' && event.method === 'POST') return false
  return true
}

function proxySettings() {
  const secret = process.env.NETLIFY_PROXY_SECRET || ''
  const siteId = process.env.NETLIFY_SITE_ID?.trim() || ''
  if (!secret && !siteId) return undefined
  const key = new TextEncoder().encode(secret)
  if (key.byteLength < 32 || !siteId) {
    throw new ApiError(503, 'proxy_unavailable', '一時的に操作できません。しばらく待ってからお試しください')
  }
  return { key, siteId }
}

function rejectProxy(): never {
  return fail(403, 'forbidden', 'この接続元は許可されていません')
}

/** Netlify's documented signed proxy JWT is the trust boundary for its IP header. */
export async function verifyNetlifyProxyRequest(event: H3Event) {
  if (!protectedApi(event)) return
  const settings = proxySettings()
  if (!settings) return
  const signature = getHeader(event, 'x-nf-sign')
  if (!signature) return rejectProxy()
  try {
    const { payload } = await jwtVerify(signature, settings.key, {
      algorithms: ['HS256'], issuer: 'netlify', requiredClaims: ['exp', 'netlify_id', 'deploy_context'],
    })
    if (payload.netlify_id !== settings.siteId || payload.deploy_context !== 'production') return rejectProxy()
    const address = getHeader(event, 'x-nf-client-connection-ip') || ''
    if (!isIP(address) || address.includes('%')) return rejectProxy()
    const mapped = address.replace(/^::ffff:/i, '')
    verifiedAddresses.set(event, isIP(mapped) === 4 ? mapped : address)
  } catch {
    // JWT errors can include supplied claims. Never expose or log them.
    return rejectProxy()
  }
}

/** Synchronous callers can use only an address verified by the async middleware. */
export function netlifyClientAddress(event: H3Event): string | undefined {
  const verified = verifiedAddresses.get(event)
  if (verified) return verified
  // Fail closed if this boundary is accidentally omitted by a new API caller.
  if (protectedApi(event) && proxySettings()) return rejectProxy()
}
