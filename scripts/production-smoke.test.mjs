import assert from 'node:assert/strict'
import test from 'node:test'
import { checks, runSmoke } from './production-smoke.mjs'

function healthy(url) {
  const path = new URL(url).pathname
  if (path === '/api/v1/health') return Response.json({ status: 'ok', app: '世界遺産ラボ API' })
  if (path === '/api/v1/me') return Response.json({ error: { code: 'unauthorized' } }, { status: 401 })
  return new Response('<title>世界遺産ラボ</title><div id="__nuxt"></div>', { headers: { 'content-type': 'text/html' } })
}

test('checks every endpoint with anonymous GETs and no redirects', async () => {
  const requests = []
  const results = await runSmoke({
    fetchImpl: async (url, options) => {
      requests.push(url.pathname)
      assert.equal(url.origin, 'https://world-heritage.misato-lab.com')
      assert.equal(options.method, 'GET')
      assert.equal(options.redirect, 'error')
      assert.ok(options.signal instanceof AbortSignal)
      assert.equal(options.headers.cookie, undefined)
      assert.equal(options.headers.authorization, undefined)
      return healthy(url)
    }, report: () => {},
  })
  assert.deepEqual(requests, checks.map(check => check.path))
  assert.ok(results.every(result => result.passed && result.attempts === 1))
})

test('retries a cold-start failure and recovers', async () => {
  let requests = 0
  const waits = []
  const results = await runSmoke({
    fetchImpl: async url => ++requests === 1 ? new Response('', { status: 503 }) : healthy(url),
    wait: async ms => { waits.push(ms) }, report: () => {},
  })
  assert.deepEqual(waits, [3000])
  assert.equal(results[0].attempts, 2)
  assert.ok(results.every(result => result.passed))
})

for (const [name, failure] of [
  ['SPA fallback for API', () => healthy('https://example.invalid/')],
  ['wrong service', () => Response.json({ status: 'ok', app: 'another API' })],
  ['malformed JSON', () => new Response('private-body', { headers: { 'content-type': 'application/json' } })],
  ['network/redirect/timeout failure', () => { throw new Error('private-error') }],
]) {
  test(`fails after three attempts for ${name} and continues checking`, async () => {
    const logs = []
    const results = await runSmoke({
      fetchImpl: async url => url.pathname === '/api/v1/health' ? failure() : healthy(url),
      wait: async () => {}, report: message => logs.push(message),
    })
    assert.equal(results[2].passed, false)
    assert.equal(results[2].attempts, 3)
    assert.equal(results[3].passed, true)
    assert.equal(logs.length, 4)
    assert.ok(!JSON.stringify({ logs, results }).includes('private-'))
  })
}

test('rejects anonymous account access that unexpectedly succeeds', async () => {
  const results = await runSmoke({
    fetchImpl: async url => url.pathname === '/api/v1/me' ? Response.json({ user: {} }) : healthy(url),
    wait: async () => {}, report: () => {},
  })
  assert.equal(results[3].passed, false)
  assert.equal(results[3].reason, 'unexpected HTTP status (200)')
})
