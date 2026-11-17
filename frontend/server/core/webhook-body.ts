import { getHeader, type H3Event } from 'h3'
import { fail } from './errors.ts'

export const WEBHOOK_BODY_LIMIT = 1024 * 1024

/** Keep original signature bytes; enforce the limit while receiving chunked bodies too. */
export async function readWebhookBody(event: H3Event): Promise<Buffer> {
  const tooLarge = (): never => fail(413, 'payload_too_large', '送信データが大きすぎます')
  const length = getHeader(event, 'content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > WEBHOOK_BODY_LIMIT)) return tooLarge()
  return new Promise((resolve, reject) => {
    const request = event.node.req
    const chunks: Buffer[] = []
    let size = 0
    // A disconnected socket may emit an error after rejection/abort. Keep a
    // bounded no-op handler until close while no longer retaining body chunks.
    const discardError = () => {}
    const drain = () => {
      request.on('error', discardError)
      request.once('close', () => request.off('error', discardError))
      request.resume()
    }
    const cleanup = () => {
      request.off('data', data)
      request.off('end', end)
      request.off('error', error)
      request.off('aborted', aborted)
    }
    const error = (cause: Error) => { cleanup(); chunks.length = 0; drain(); reject(cause) }
    const aborted = () => error(new Error('Webhook body interrupted'))
    const data = (chunk: Buffer) => {
      size += chunk.length
      if (size > WEBHOOK_BODY_LIMIT) {
        cleanup()
        chunks.length = 0
        drain()
        try { tooLarge() } catch (cause) { reject(cause) }
        return
      }
      chunks.push(chunk)
    }
    const end = () => { cleanup(); resolve(Buffer.concat(chunks, size)) }
    request.on('data', data).once('end', end).once('error', error).once('aborted', aborted)
  })
}
