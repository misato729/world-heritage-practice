import { defineNitroPlugin } from 'nitropack/runtime'
import { authBaseURL, authSecret, authTrustedOrigins } from '../core/config.ts'
import { allowedOrigins } from '../core/http.ts'
import { closeDatabase, getDatabase } from '../core/db.ts'
import { closeRateLimitStore } from '../core/rate-limit.ts'

export default defineNitroPlugin(async (nitro) => {
  // Static Netlify generation has no runtime database or authentication secrets.
  // Nitro replaces this flag at build time; the API server keeps every check.
  if (import.meta.prerender) return
  authSecret()
  authBaseURL()
  authTrustedOrigins()
  allowedOrigins()
  await getDatabase().$queryRaw`SELECT 1`
  nitro.hooks.hook('close', async () => { await closeRateLimitStore(); await closeDatabase() })
})
