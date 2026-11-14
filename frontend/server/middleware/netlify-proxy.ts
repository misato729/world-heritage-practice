import { defineEventHandler, getRequestURL, setHeader, setResponseStatus } from 'h3'
import { ApiError } from '../core/errors.ts'
import { verifyNetlifyProxyRequest } from '../core/netlify-proxy.ts'

export default defineEventHandler(async event => {
  try {
    await verifyNetlifyProxyRequest(event)
  } catch (error) {
    const failure = error instanceof ApiError ? error
      : new ApiError(503, 'proxy_unavailable', '一時的に操作できません。しばらく待ってからお試しください')
    setResponseStatus(event, failure.status)
    setHeader(event, 'Cache-Control', 'no-store')
    setHeader(event, 'X-Content-Type-Options', 'nosniff')
    const body = { code: failure.code, message: failure.message }
    return /^\/api\/auth(?:\/|$)/.test(getRequestURL(event).pathname) ? body : { error: body }
  }
})
