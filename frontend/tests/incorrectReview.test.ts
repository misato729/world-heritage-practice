import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { computed, effectScope, ref, watch, onScopeDispose } from 'vue'
import { useIncorrectReview } from '../app/composables/useIncorrectReview.ts'
import { stableRandomizePracticeSequence } from '../app/utils/practiceSequence.ts'
const globals = globalThis as any
Object.assign(globals, { computed, ref, watch, onScopeDispose })
const flush = () => new Promise<void>(resolve => setImmediate(resolve))
function harness(t: TestContext) {
  const user = ref<any>({ id: 1, paid_content_access: false })
  const session = ref<any>(1)
  const states = new Map<string, any>()
  const requests: { resolve: (data: any) => void; reject: (e: any) => void }[] = []
  const navigations: any[] = []
  const attempts: any[] = []
  const app = { $api: () => new Promise((resolve, reject) => requests.push({ resolve, reject })) }
  globals.useNuxtApp = () => app
  globals.useAuth = () => ({ user, sessionVersion: session, isLoggedIn: computed(() => user.value !== null), authHeaders: computed(() => ({})), ensureCurrentUser: async () => user.value })
  globals.usePracticeAttempt = () => ({ start: async (p: unknown) => { attempts.push(p); return { id: 'synthetic-round' } } })
  globals.useState = (key: string, init: () => unknown) => { if (!states.has(key)) states.set(key, ref(init())); return states.get(key) }
  globals.navigateTo = async (target: unknown) => { navigations.push(target) }
  const scope = effectScope()
  const review = scope.run(useIncorrectReview)!
  t.after(() => scope.stop())
  const answer = (index: number, pairs: number[][]) => requests[index]!.resolve({ data: pairs.map(([question_id, exam_number, question_number]) => ({ question_id, exam_number, question_number })), meta: { total_count: pairs.length } })
  return { review, user, session, requests, navigations, attempts, answer, scope }
}
test('stable random ranking preserves sparse pairs and the order of remaining targets', () => {
  const pairs = [{ examNumber: 1, questionNumber: 3 }, { examNumber: 2, questionNumber: 4 }, { examNumber: 6, questionNumber: 9 }]
  const sorted = stableRandomizePracticeSequence(pairs, 7)
  assert.deepEqual(stableRandomizePracticeSequence(pairs.slice(1), 7), sorted.filter(p => p.examNumber !== 1))
  assert.equal(new Set(sorted.map(p => p.examNumber + '.' + p.questionNumber)).size, 3)
  assert.equal(pairs[0]!.questionNumber, 3)
})
test('targets are cached/deduplicated, and one round survives answer cache invalidation', async t => {
  const h = harness(t), loaded = h.review.load()
  h.answer(0, [[1, 1, 3], [2, 2, 4], [2, 2, 4]])
  assert.equal((await loaded).length, 2)
  const pendingRound = h.review.prepareRound(1)
  h.answer(1, [[1, 1, 3], [2, 2, 4]])
  const round = await pendingRound
  h.review.invalidate()
  assert.equal(h.review.loaded.value, false)
  assert.deepEqual(await h.review.prepareRound(1), round)
  const refreshed = h.review.load(); h.answer(2, [[2, 2, 4]])
  assert.deepEqual(await refreshed, [{ examNumber: 2, questionNumber: 4 }])
  assert.deepEqual(await h.review.prepareRound(1), round)
})
test('old user/session/entitlement requests cannot repopulate state or start navigation', async t => {
  const h = harness(t), previous = h.review.start()
  await flush(); assert.equal(h.requests.length, 1)
  h.user.value = { id: 2, paid_content_access: true }; h.session.value++
  h.answer(0, [[6, 6, 9]])
  assert.equal(await previous, false); assert.deepEqual(h.navigations, [])
  const current = h.review.load(); h.answer(1, [[2, 2, 4]]); await current
  h.user.value.paid_content_access = false
  assert.equal(h.review.loaded.value, false); assert.deepEqual(h.review.positions.value, [])
  const expired = h.review.load(); h.session.value++; h.answer(2, [[6, 6, 9]]); await expired
  assert.deepEqual(h.review.positions.value, [])
})
test('start is single-flight, refreshes latest targets, and navigates exact positions', async t => {
  const h = harness(t), first = h.review.start()
  assert.equal(await h.review.start(), false)
  await flush(); h.answer(0, [[1, 1, 3], [2, 2, 4]])
  assert.equal(await first, true); assert.equal(h.navigations.length, 1)
  assert.match(h.navigations[0].path, /^\/practice\/(1\/3|2\/4)$/)
  assert.equal(h.navigations[0].query.review, 'incorrect')
  assert.equal(h.navigations[0].query.order, 'random'); assert.match(h.navigations[0].query.seed, /^\d+$/)
  const again = h.review.start(); await flush(); h.answer(1, [])
  assert.equal(await again, false); assert.equal(h.review.totalCount.value, 0)
})
test('failed/expired requests show an error, retry works, and unmounted starts do not navigate', async t => {
  const h = harness(t), failed = h.review.load()
  h.requests[0]!.reject({ statusCode: 401 }); await failed
  assert.match(h.review.error.value, /ログイン/)
  const retry = h.review.start(); await flush(); h.answer(1, [[1, 1, 3]])
  assert.equal(await retry, true)
  const stopped = h.review.start(); await flush(); h.scope.stop(); h.answer(2, [[2, 2, 4]])
  assert.equal(await stopped, false); assert.equal(h.navigations.length, 1)
})

test('anonymous review stays local and does not call the review API', async t => {
  const h = harness(t)
  h.user.value = null
  assert.deepEqual(await h.review.load(), [])
  assert.equal(await h.review.start(), false)
  assert.equal(h.requests.length, 0)
  assert.deepEqual(h.navigations, [])
})
