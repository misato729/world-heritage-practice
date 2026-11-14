import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { createApp, defineEventHandler, toNodeListener } from 'h3'
import { SignJWT, type JWTPayload } from 'jose'
import proxyMiddleware from '../server/middleware/netlify-proxy.ts'
import { AUTH_CLIENT_IP_HEADER, createAuth } from '../server/core/better-auth.ts'
import { authRequest } from '../server/api/auth/[...all].ts'
import { clientAddress } from '../server/core/rate-limit.ts'
import { ApiError } from '../server/core/errors.ts'
import type { Database } from '../server/core/db.ts'
import { createApiTestApp } from './helpers/api-app.ts'

const secret = randomBytes(48).toString('base64url')
const key = new TextEncoder().encode(secret)
const siteId = randomUUID()
const origin = 'http://localhost:3100'

async function withEnvironment<T>(values: Record<string, string | undefined>, action: () => Promise<T>): Promise<T> {
  const previous = new Map(Object.keys(values).map(name => [name, process.env[name]]))
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  try { return await action() }
  finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

async function withProxy(action: () => Promise<void>) {
  await withEnvironment({ NETLIFY_PROXY_SECRET: secret, NETLIFY_SITE_ID: siteId, FLY_APP_NAME: 'synthetic-proxy-test',
    APP_ENV: 'test', NODE_ENV: 'test', BETTER_AUTH_URL: origin,
    BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'), CORS_ORIGINS: '' }, action)
}

async function signed(payload: JWTPayload = {}, algorithm = 'HS256', signingKey = key) {
  return new SignJWT({ iss: 'netlify', exp: Math.floor(Date.now() / 1000) + 120,
    netlify_id: siteId, deploy_context: 'production', site_url: 'https://synthetic.netlify.app', ...payload })
    .setProtectedHeader({ alg: algorithm }).sign(signingKey)
}

async function withServer(app: ReturnType<typeof createApp>, action: (base: string) => Promise<void>) {
  const server = createServer(toNodeListener(app))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try { await action(`http://127.0.0.1:${(server.address() as { port: number }).port}`) }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
}

const forbidden = { code: 'forbidden', message: 'この接続元は許可されていません' }
function addressApp() {
  return createApp().use(proxyMiddleware).use(defineEventHandler(event => ({
    address: clientAddress(event), authAddress: authRequest(event).headers.get(AUTH_CLIENT_IP_HEADER),
  })))
}

test('configured APIs reject unsigned requests and forged address headers in their existing JSON envelopes', async () => {
  await withProxy(async () => {
    await withServer(addressApp(), async base => {
      const headers = { 'X-Nf-Client-Connection-Ip': '198.51.100.5', 'X-Forwarded-For': '192.0.2.7',
        'Fly-Client-IP': '203.0.113.9', [AUTH_CLIENT_IP_HEADER]: '192.0.2.8' }
      for (const path of ['/api', '/api/', '/api/v1/exams', '/api/v1/missing', '/api/v1/health/extra']) {
        const response = await fetch(base + path, { headers })
        assert.equal(response.status, 403, path)
        assert.deepEqual(await response.json(), { error: forbidden })
        assert.equal(response.headers.get('cache-control'), 'no-store')
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
      }
      const auth = await fetch(base + '/api/auth/get-session', { headers })
      assert.equal(auth.status, 403)
      assert.deepEqual(await auth.json(), forbidden)
    })
  })
})

test('only a valid Netlify production signature exposes its connection address to both limit boundaries', async () => {
  await withProxy(async () => {
    const signature = await signed()
    await withServer(addressApp(), async base => {
      for (const [address, normalized] of [
        ['198.51.100.10', '198.51.100.10'], ['2001:db8::10', '2001:db8::10'],
        ['::ffff:198.51.100.11', '198.51.100.11'], ['::ffff:c633:640b', '::ffff:c633:640b'],
      ] as const) {
        const response = await fetch(base + '/api/v1/exams', { headers: { 'X-Nf-Sign': signature,
          'X-Nf-Client-Connection-Ip': address, 'Fly-Client-IP': '203.0.113.100', 'X-Forwarded-For': '192.0.2.99',
          [AUTH_CLIENT_IP_HEADER]: '192.0.2.88' } })
        assert.equal(response.status, 200)
        assert.deepEqual(await response.json(), { address: normalized, authAddress: normalized })
      }
    })
  })
})

test('invalid signatures, expired or missing expiry, other sites, issuers and deploy contexts are rejected', async () => {
  await withProxy(async () => {
    const signatures = [
      'invalid',
      await signed({}, 'HS256', new TextEncoder().encode(randomBytes(48).toString('base64url'))),
      await signed({ exp: Math.floor(Date.now() / 1000) - 1 }),
      await signed({ exp: undefined }),
      await signed({ netlify_id: randomUUID() }),
      await signed({ netlify_id: undefined }),
      await signed({ iss: 'other' }),
      await signed({ deploy_context: 'deploy-preview' }),
      await signed({ deploy_context: undefined }),
      await signed({}, 'HS384'),
    ]
    await withServer(addressApp(), async base => {
      for (const signature of signatures) {
        const response = await fetch(base + '/api/v1/exams', { headers: {
          'X-Nf-Sign': signature, 'X-Nf-Client-Connection-Ip': '198.51.100.12',
        } })
        assert.equal(response.status, 403)
        assert.deepEqual(await response.json(), { error: forbidden })
      }
    })
  })
})

test('a signed request still requires one valid Netlify connection IP and never falls back to spoofable headers', async () => {
  await withProxy(async () => {
    const signature = await signed()
    await withServer(addressApp(), async base => {
      for (const address of [undefined, '', 'unknown', '198.51.100.1, 198.51.100.2', '198.51.100.1:80', '999.1.1.1', '2001:db8::1%eth0']) {
        const headers: Record<string, string> = { 'X-Nf-Sign': signature, 'Fly-Client-IP': '203.0.113.100',
          'X-Forwarded-For': '192.0.2.99' }
        if (address !== undefined) headers['X-Nf-Client-Connection-Ip'] = address
        const response = await fetch(base + '/api/auth/get-session', { headers })
        assert.equal(response.status, 403)
        assert.deepEqual(await response.json(), forbidden)
      }
    })
  })
})

test('only health GET/HEAD and independently signed Stripe POST bypass the proxy boundary', async () => {
  await withProxy(async () => {
    const app = createApp().use(proxyMiddleware).use(defineEventHandler(() => ({ reached: true })))
    await withServer(app, async base => {
      for (const path of ['/api/v1/health', '/api/v1/health/']) {
        for (const method of ['GET', 'HEAD']) {
          const response = await fetch(base + path, { method })
          assert.equal(response.status, 200)
          if (method === 'GET') assert.deepEqual(await response.json(), { reached: true })
        }
      }
      for (const path of ['/api/v1/webhooks/stripe', '/api/v1/webhooks/stripe/']) {
        const response = await fetch(base + path, { method: 'POST' })
        assert.equal(response.status, 200, 'the Stripe route remains responsible for checking its own raw-body signature')
      }
      for (const [path, method] of [['/api/v1/health', 'POST'], ['/api/v1/webhooks/stripe', 'GET'],
        ['/api/v1/health//', 'GET'], ['/api/v1/webhooks/stripe/extra', 'POST']]) {
        assert.equal((await fetch(base + path, { method })).status, 403)
      }
      assert.equal((await fetch(base + '/login')).status, 200)
    })
  })
})

test('an incomplete proxy configuration fails closed without exposing its values', async () => {
  await withProxy(async () => {
    await withServer(addressApp(), async base => {
      for (const values of [{ NETLIFY_PROXY_SECRET: undefined }, { NETLIFY_SITE_ID: undefined }, { NETLIFY_PROXY_SECRET: 'short' }]) {
        await withEnvironment(values, async () => {
          const response = await fetch(base + '/api/v1/exams')
          assert.equal(response.status, 503)
          assert.deepEqual(await response.json(), { error: {
            code: 'proxy_unavailable', message: '一時的に操作できません。しばらく待ってからお試しください',
          } })
        })
      }
    })
  })
})

test('without proxy configuration local and Fly addresses retain their existing behavior', async () => {
  await withEnvironment({ NETLIFY_PROXY_SECRET: undefined, NETLIFY_SITE_ID: undefined, FLY_APP_NAME: undefined }, async () => {
    await withServer(addressApp(), async base => {
      const headers = { 'X-Nf-Sign': 'forged', 'X-Nf-Client-Connection-Ip': '198.51.100.20',
        'Fly-Client-IP': '203.0.113.100', 'X-Forwarded-For': '192.0.2.99' }
      const local = await fetch(base + '/api/v1/exams', { headers })
      assert.deepEqual(await local.json(), { address: '127.0.0.1', authAddress: '127.0.0.1' })
      await withEnvironment({ FLY_APP_NAME: 'synthetic-direct-test' }, async () => {
        const fly = await fetch(base + '/api/v1/exams', { headers })
        assert.deepEqual(await fly.json(), { address: '203.0.113.100', authAddress: '203.0.113.100' })
      })
    })
  })
})

test('a caller that omits the middleware cannot obtain a forged trusted address', async () => {
  await withProxy(async () => {
    const app = createApp().use(defineEventHandler(event => {
      assert.throws(() => clientAddress(event), error => error instanceof ApiError && error.status === 403)
      return { checked: true }
    }))
    await withServer(app, async base => {
      const response = await fetch(base + '/api/auth/get-session', { headers: {
        'X-Nf-Sign': await signed(), 'X-Nf-Client-Connection-Ip': '198.51.100.25',
      } })
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { checked: true })
    })
  })
})

test('two clients behind one Fly proxy consume separate native Better Auth rate-limit buckets', async () => {
  await withProxy(async () => {
    // Admission ends with invalid input before any DB operation can be attempted.
    const auth = createAuth({} as Database)
    const calls: string[] = []
    const counts = new Map<string, number>()
    auth.options.rateLimit!.customStorage = { async consume(value) {
      calls.push(value)
      const count = (counts.get(value) || 0) + 1
      counts.set(value, count)
      return { allowed: count === 1, retryAfter: count === 1 ? null : 300 }
    } }
    const app = createApp().use(proxyMiddleware).use(defineEventHandler(event => auth.handler(authRequest(event))))
    const signature = await signed()
    await withServer(app, async base => {
      const post = (address: string) => fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers: {
        'X-Nf-Sign': signature, 'X-Nf-Client-Connection-Ip': address, 'Fly-Client-IP': '203.0.113.100',
        'X-Forwarded-For': '192.0.2.99', [AUTH_CLIENT_IP_HEADER]: '192.0.2.88',
        Origin: origin, 'Content-Type': 'application/json',
      }, body: '{}' })
      assert.equal((await post('198.51.100.30')).status, 400)
      assert.equal((await post('198.51.100.30')).status, 429)
      assert.equal((await post('198.51.100.31')).status, 400)
      assert.deepEqual(calls, [
        '198.51.100.30|/sign-in/email', '198.51.100.30|/sign-in/email', '198.51.100.31|/sign-in/email',
      ])
    })
  })
})

test('the Nitro scanner test app registers the real middleware before API and auth routes', async () => {
  await withProxy(async () => {
    await withServer(await createApiTestApp(), async base => {
      assert.equal((await fetch(base + '/api/v1/health')).status, 200)
      const direct = await fetch(base + '/api/v1/exams')
      assert.equal(direct.status, 403)
      assert.deepEqual(await direct.json(), { error: forbidden })
      const auth = await fetch(base + '/api/auth/get-session')
      assert.equal(auth.status, 403)
      assert.deepEqual(await auth.json(), forbidden)
      await withEnvironment({ STRIPE_WEBHOOK_SECRET: 'whsec_' + randomBytes(24).toString('hex') }, async () => {
        const webhook = await fetch(base + '/api/v1/webhooks/stripe', { method: 'POST', body: '{}' })
        assert.equal(webhook.status, 400)
        assert.equal((await webhook.json()).error.code, 'invalid_webhook')
      })
      const signedMissing = await fetch(base + '/api/v1/not-found', { headers: {
        'X-Nf-Sign': await signed(), 'X-Nf-Client-Connection-Ip': '198.51.100.40',
      } })
      assert.equal(signedMissing.status, 404)
      assert.equal((await signedMissing.json()).error.code, 'not_found')
    })
  })
})
