import assert from 'node:assert/strict'
import { createHmac, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'

const source = readFileSync(new URL('../automation/password-reset/Code.gs', import.meta.url), 'utf8')
const manifest = JSON.parse(readFileSync(new URL('../automation/password-reset/appsscript.json', import.meta.url), 'utf8'))
const secret = 'a'.repeat(64), origin = 'https://example.invalid'
function harness() {
  const properties = new Map<string, string>([['PASSWORD_RESET_GAS_SECRET', secret], ['FRONTEND_URL', origin]])
  const sent: any[] = []
  let now = Date.now(), quota = 100, fail = false, locked = false, available = true, lockDelay = 0
  const store = { getProperty: (key: string) => properties.get(key) ?? null, getProperties: () => Object.fromEntries(properties), setProperty: (key: string, value: string) => properties.set(key, value), deleteProperty: (key: string) => properties.delete(key) }
  const context: Record<string, any> = {
    Date: class extends Date { static now() { return now } },
    PropertiesService: { getScriptProperties: () => store },
    MailApp: { getRemainingDailyQuota: () => quota, sendEmail: (mail: unknown) => { if (fail) throw new Error('private provider detail'); sent.push(mail) } },
    Utilities: { Charset: { UTF_8: 'UTF-8' }, computeHmacSha256Signature: (payload: string, key: string) => [...createHmac('sha256', key).update(payload).digest()].map(b => b > 127 ? b - 256 : b) },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (!available || locked) return false; locked = true; now += lockDelay; return true }, releaseLock: () => { locked = false } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text: string) => ({ text, setMimeType() { return this } }) },
    console: { log: () => assert.fail('No logging'), error: () => assert.fail('No logging') }, Logger: { log: () => assert.fail('No logging') },
  }
  vm.runInNewContext(source, context)
  const envelope = (override = {}) => {
    const payload = JSON.stringify({ version: 1, request_id: randomBytes(16).toString('hex'), issued_at: now, to: 'member@example.invalid', token: 'B'.repeat(24), origin, ...override })
    return { payload, signature: createHmac('sha256', secret).update(payload).digest('hex') }
  }
  return { properties, sent, envelope, post: (body: unknown) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(body) } }).text), raw: (raw: string) => JSON.parse(context.doPost({ postData: { contents: raw } }).text), context, state: (next: { now?: number, quota?: number, fail?: boolean, available?: boolean, lockDelay?: number }) => { now = next.now ?? now; quota = next.quota ?? quota; fail = next.fail ?? fail; available = next.available ?? available; lockDelay = next.lockDelay ?? lockDelay } }
}

test('GAS requires only send-mail scope; valid signatures send a fixed reset email once with no persisted secret link', () => {
  assert.deepEqual(manifest.oauthScopes, ['https://www.googleapis.com/auth/script.send_mail'])
  const h = harness(), envelope = h.envelope()
  assert.equal(h.post(envelope).ok, true)
  assert.equal(h.post(envelope).ok, true)
  assert.equal(h.sent.length, 1)
  assert.equal(h.sent[0].to, 'member@example.invalid')
  assert.equal(h.sent[0].name, '演習サービス')
  assert.equal(h.sent[0].body.includes(origin + '/reset-password#token=' + 'B'.repeat(24)), true)
  assert.match(h.sent[0].body, /30分以内/)
  assert.match(h.sent[0].body, /パスワードは変更されません/)
  for (const [key, value] of h.properties) if (key.startsWith('reset')) {
    assert.equal(value.includes('B'.repeat(24)), false)
    assert.equal(value.includes('member@example.invalid'), false)
  }
})

test('GAS rejects forged, stale, malformed, cross-origin and multiple-recipient requests before mail or delivery state writes', () => {
  const h = harness()
  for (const override of [{ version: 2 }, { issued_at: Date.now() - 301000 }, { issued_at: Date.now() + 301000 }, { issued_at: 'now' }, { request_id: 'bad' }, { to: 'a@example.invalid,b@example.invalid' }, { to: 'a@example.invalid\r\nBcc: b@example.invalid' }, { to: ['member@example.invalid'] }, { token: 'bad' }, { origin: 'https://evil.invalid' }]) assert.equal(h.post(h.envelope(override)).ok, false)
  const wrong = h.envelope(); wrong.signature = '0'.repeat(64)
  assert.equal(h.post(wrong).ok, false)
  const tampered = h.envelope(); tampered.payload += ' '
  assert.equal(h.post(tampered).ok, false)
  for (const raw of ['not json', '{}', '[]', 'x'.repeat(2049)]) assert.equal(h.raw(raw).ok, false)
  assert.equal(h.sent.length, 0)
  assert.equal([...h.properties.keys()].some(k => k.startsWith('reset')), false)
})

test('GAS holds a script lock, caps daily attempts and checks remaining recipient quota', () => {
  const h = harness()
  h.state({ available: false }); assert.equal(h.post(h.envelope()).ok, false)
  h.state({ available: true, quota: 0 }); assert.equal(h.post(h.envelope()).ok, false)
  h.state({ quota: 100 })
  for (let i = 0; i < 20; i++) assert.equal(h.post(h.envelope()).ok, true)
  assert.equal(h.post(h.envelope()).ok, false)
  assert.equal(h.sent.length, 20)
})

test('GAS never repeats uncertain sends and prunes only its old delivery records', () => {
  const h = harness(), envelope = h.envelope()
  h.state({ fail: true }); assert.equal(h.post(envelope).ok, false)
  h.state({ fail: false }); assert.equal(h.post(envelope).ok, false)
  assert.equal(h.sent.length, 0)
  assert.equal(h.properties.get('resetMailCount'), '1')
  h.properties.set('unrelatedSetting', 'keep')
  h.state({ now: Date.now() + 11 * 60 * 1000 })
  assert.equal(h.post(h.envelope()).ok, true)
  assert.equal(h.properties.get('unrelatedSetting'), 'keep')
  assert.equal([...h.properties.keys()].filter(k => k.startsWith('resetDelivery_')).length, 1)
})

test('GAS rechecks freshness after the lock, signs UTF-8 and resets the cap only at the UTC day boundary', () => {
  const h = harness(), now = Date.now()
  h.state({ now, lockDelay: 5000 })
  assert.equal(h.post(h.envelope({ issued_at: now - 299000 })).ok, false)
  assert.equal(h.sent.length, 0)
  const dayEnd = Date.UTC(2026, 10, 2, 23, 59, 59)
  h.state({ now: dayEnd, lockDelay: 0 })
  for (let i = 0; i < 20; i++) assert.equal(h.post(h.envelope({ to: '利用者@example.invalid' })).ok, true)
  assert.equal(h.post(h.envelope()).ok, false)
  h.state({ now: dayEnd + 2000 })
  assert.equal(h.post(h.envelope()).ok, true)
  assert.equal(h.properties.get('resetMailCount'), '1')
  assert.equal(h.properties.get('resetMailDay'), '2026-11-03')
})
