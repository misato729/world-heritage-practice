import test from 'node:test'
import assert from 'node:assert/strict'
import { EXAM_CONFIG } from '../shared/examConfig.ts'
import { CANCELLATION_STEPS, CANCELLATION_DEADLINE, CANCELLATION_EFFECT, CANCELLATION_REFUND, subscriptionCheckoutMessage } from '../shared/subscriptionTerms.ts'

test('Checkout displays complete cancellation terms and configured free ranges within the provider limit', () => {
 const message = subscriptionCheckoutMessage(EXAM_CONFIG,'https://example.invalid')
 for (const text of [...CANCELLATION_STEPS,CANCELLATION_DEADLINE,CANCELLATION_EFFECT,CANCELLATION_REFUND]) assert.ok(message.includes(text))
 for (const text of ['月額500円（税込）','2級は模試1〜3が無料','準1級は模試1〜2が無料','1級は模試1が無料','https://example.invalid/account#subscription-management']) assert.ok(message.includes(text))
 assert.ok(message.length<=1200)
 assert.doesNotMatch(message,/準備中|全級共通で模試4/)
})
