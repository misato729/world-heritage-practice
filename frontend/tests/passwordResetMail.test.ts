import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test, { after } from 'node:test'
import { passwordResetMailSettings, sendPasswordResetMail } from '../server/services/password-reset-mail.ts'

const env = { PASSWORD_RESET_ENABLED: 'true', PASSWORD_RESET_GAS_URL: 'https://script.google.com/macros/s/synthetic_deployment/exec', PASSWORD_RESET_GAS_SECRET: 'a'.repeat(64), FRONTEND_URL: 'https://example.invalid' }
const oldAuthBase = process.env.BETTER_AUTH_URL
process.env.BETTER_AUTH_URL = env.FRONTEND_URL
after(() => { if (oldAuthBase === undefined) delete process.env.BETTER_AUTH_URL; else process.env.BETTER_AUTH_URL = oldAuthBase })
const settings = passwordResetMailSettings(env, 'production')

test('GAS settings allow only the official deployment URL and an exact secure frontend origin', () => {
  assert.equal(settings.origin, env.FRONTEND_URL)
  for (const override of [{ PASSWORD_RESET_ENABLED: 'false' }, { PASSWORD_RESET_GAS_URL: '' }, { PASSWORD_RESET_GAS_URL: env.PASSWORD_RESET_GAS_URL + '?secret=bad' }, { PASSWORD_RESET_GAS_URL: env.PASSWORD_RESET_GAS_URL.replace('/exec', '/dev') }, { PASSWORD_RESET_GAS_URL: 'https://script.google.com.evil.invalid/macros/s/id/exec' }, { PASSWORD_RESET_GAS_URL: 'http://127.0.0.1:3000/exec' }, { PASSWORD_RESET_GAS_SECRET: 'short' }, { FRONTEND_URL: 'http://example.invalid' }, { FRONTEND_URL: 'https://user:pass@example.invalid' }, { FRONTEND_URL: 'https://example.invalid/other' }]) {
    assert.throws(() => passwordResetMailSettings({ ...env, ...override }, 'production'))
  }
  const local = { ...env, PASSWORD_RESET_GAS_URL: 'http://127.0.0.1:3000/exec', FRONTEND_URL: 'http://localhost:3300' }
  process.env.BETTER_AUTH_URL = local.FRONTEND_URL
  assert.doesNotThrow(() => passwordResetMailSettings(local, 'test'))
  assert.throws(() => passwordResetMailSettings(local, 'development'))
  process.env.BETTER_AUTH_URL = env.FRONTEND_URL
})

test('relay signs the exact UTF-8 payload, correlates acknowledgement and follows Google content redirect with GET only', async () => {
  let count = 0, id = ''
  const request: typeof fetch = async (url, options) => {
    count++
    if (count === 1) {
      assert.equal(url, settings.url)
      assert.equal(options!.method, 'POST')
      assert.equal(options!.redirect, 'manual')
      const envelope = JSON.parse(String(options!.body))
      assert.equal(envelope.signature === createHmac('sha256', settings.secret).update(envelope.payload).digest('hex'), true)
      const payload = JSON.parse(envelope.payload)
      id = payload.request_id
      assert.equal(payload.token === 'B'.repeat(24), true)
      assert.equal(payload.to, 'member@example.invalid')
      assert.equal(payload.origin, settings.origin)
      assert.ok(Math.abs(Date.now() - payload.issued_at) < 1000)
      return new Response(null, { status: 302, headers: { Location: 'https://script.googleusercontent.com/macros/echo?user_content_key=synthetic' } })
    }
    assert.equal(String(url).startsWith('https://script.googleusercontent.com/macros/echo?'), true)
    assert.equal(options!.method, 'GET')
    assert.equal(options!.body, undefined)
    assert.equal(options!.headers, undefined)
    assert.equal(options!.redirect, 'error')
    return Response.json({ ok: true, request_id: id })
  }
  await sendPasswordResetMail(settings, 'member@example.invalid', 'B'.repeat(24), request)
  assert.equal(count, 2)
})

test('relay rejects unsafe redirects, HTTP errors, HTML, quota failures and mismatched acknowledgements without retrying', async () => {
  for (const response of [
    () => new Response(null, { status: 307, headers: { Location: 'https://evil.invalid/' } }),
    () => new Response(null, { status: 302, headers: { Location: 'https://script.googleusercontent.com.evil.invalid/macros/echo' } }),
    () => new Response(null, { status: 302, headers: { Location: 'https://user:pass@script.googleusercontent.com/macros/echo' } }),
    () => new Response(null, { status: 302, headers: { Location: 'http://script.googleusercontent.com/macros/echo' } }),
    () => new Response(null, { status: 302, headers: { Location: 'https://script.googleusercontent.com/other' } }),
    () => new Response(null, { status: 500 }), () => new Response('<html>Login</html>'),
    () => Response.json({ ok: false }), () => Response.json({ ok: true, request_id: 'wrong' }),
  ]) {
    let count = 0
    await assert.rejects(sendPasswordResetMail(settings, 'member@example.invalid', 'B'.repeat(24), async () => { count++; return response() }))
    assert.equal(count, 1)
  }
})
