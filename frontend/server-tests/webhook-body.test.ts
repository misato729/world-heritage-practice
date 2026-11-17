import assert from 'node:assert/strict'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import test from 'node:test'
import { createEvent } from 'h3'
import { readWebhookBody, WEBHOOK_BODY_LIMIT } from '../server/core/webhook-body.ts'

test('webhook reader preserves raw signature bytes and caps declared and chunked bodies', async () => {
  const event = (body: Buffer, declared: boolean) => {
    const req = new IncomingMessage(new Socket())
    req.method = 'POST'
    req.headers = declared ? { 'content-length': String(body.length) } : { 'transfer-encoding': 'chunked' }
    req.push(body); req.push(null)
    return createEvent(req, new ServerResponse(req))
  }
  const raw = Buffer.from('{ "synthetic": "署名" }\n')
  assert.deepEqual(await readWebhookBody(event(raw, true)), raw)
  assert.deepEqual(await readWebhookBody(event(raw, false)), raw)
  assert.equal((await readWebhookBody(event(Buffer.alloc(WEBHOOK_BODY_LIMIT), false))).length, WEBHOOK_BODY_LIMIT)
  for (const declared of [true, false]) {
    await assert.rejects(readWebhookBody(event(Buffer.alloc(WEBHOOK_BODY_LIMIT + 1), declared)), (e: any) => e.status === 413)
  }
})


test('webhook reader releases buffered data on interrupted requests', async () => {
  const req = new IncomingMessage(new Socket())
  req.method = 'POST'; req.headers = { 'transfer-encoding': 'chunked' }
  const pending = readWebhookBody(createEvent(req, new ServerResponse(req)))
  req.push(Buffer.from('partial'))
  req.emit('aborted')
  await assert.rejects(pending, /interrupted/)
  assert.equal(req.listenerCount('data'), 0)
  assert.equal(req.listenerCount('end'), 0)
  req.emit('error', new Error('late socket error'))
  req.emit('close')
  assert.equal(req.listenerCount('error'), 0)
})


test('webhook reader counts the aggregate size across chunks', async () => {
  const req = new IncomingMessage(new Socket())
  req.method = 'POST'; req.headers = { 'transfer-encoding': 'chunked' }
  const pending = readWebhookBody(createEvent(req, new ServerResponse(req)))
  req.emit('data', Buffer.alloc(WEBHOOK_BODY_LIMIT))
  req.emit('data', Buffer.alloc(1))
  await assert.rejects(pending, (e: any) => e.status === 413)
  req.emit('close')
})
