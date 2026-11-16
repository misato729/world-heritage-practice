import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue'
import { EXAM_CATALOG, FREE_EXAM_MAX } from '../app/utils/examCatalog.ts'
import { EXAM_CONFIG, hasFullExamAccess, canUseFavoriteFeature, PAYMENTS_ENABLED } from '../app/utils/examConfig.ts'
import type { AuthUser } from '../shared/types/auth.ts'

const read = (path: string) => readFileSync(new URL(`../app/${path}`, import.meta.url), 'utf8')
const factory = (source: string, dependencies: Record<string, unknown>, result: string) => {
  const code = ts.transpileModule(source.replace(/^import[^\n]*\n/gm, '').replace('export const', 'const'), {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  }).outputText
  return new Function(...Object.keys(dependencies), code + `\nreturn ${result}`)(...Object.values(dependencies))
}
const sidebar = read('components/ExamSidebar.vue').split('<script setup lang="ts">')[1]!.split('</script>')[0]!
const staticRoutes = (readdirSync(new URL('../app/pages/', import.meta.url), { recursive: true }) as string[])
  .filter(path => path.endsWith('.vue') && !path.includes('[') && path !== 'index.vue' && !/^(practice|admin)\//.test(path))
  .map(path => '/' + path.replace(/(?:\/index)?\.vue$/, ''))
const member = (kind: string): AuthUser | null => kind === 'anonymous' ? null : ({
  id: 1, name: 'Synthetic', email: 'synthetic@example.invalid', role: kind === 'admin' ? 'admin' : 'user',
  paid_content_access: kind !== 'free', favorite_questions: [],
  membership: { status: kind === 'premium' ? 'active' : 'free', purchased_at: null, expires_at: null },
})
const flush = async () => { await nextTick(); await new Promise<void>(done => setImmediate(done)); await nextTick() }
function harness(path: string, kind = 'anonymous', resolved = kind !== 'anonymous', paid = false, freeMax = 1) {
  const config = { ...EXAM_CONFIG, payments: { ...EXAM_CONFIG.payments, enabled: paid, free_exam_count: paid ? freeMax : EXAM_CONFIG.payments.free_exam_count } }
  const route = reactive({ path, fullPath: path })
  const user = ref(member(kind)), authResolved = ref(resolved)
  let checks = 0
  const requests: string[] = []
  const auth = { user, authResolved, isLoggedIn: computed(() => user.value !== null), sessionVersion: ref(0), authHeaders: computed(() => ({})),
    ensureCurrentUser: async () => { checks++; return null } }
  const useNuxtApp = () => ({ $api: (url: string) => { requests.push(url); throw new Error('Sidebar must not fetch question data') } })
  const useFavorites = factory(read('composables/useFavorites.ts'), { computed, useAuth: () => auth, useNuxtApp, canUseFavoriteFeature: (logged: boolean, user: Parameters<typeof hasFullExamAccess>[0]) => canUseFavoriteFeature(logged, user, config), PAYMENTS_ENABLED: paid }, 'useFavorites')
  const scope = effectScope()
  const instance = scope.run(() => factory(sidebar, {
    computed, ref, watch, defineProps: () => ({ collapsed: false }), defineEmits: () => () => {}, useRoute: () => route,
    useAuth: () => auth, useFavorites, useGrade: () => ({ EXAM_CATALOG, FREE_EXAM_MAX: paid ? freeMax : FREE_EXAM_MAX }),
    hasFullExamAccess: (user: Parameters<typeof hasFullExamAccess>[0]) => hasFullExamAccess(user, config),
  }, '{ exams, examTarget, openExam, toggleExam, isExamLocked }'))!
  return { instance, user, authResolved, requests, checks: () => checks,
    go: (path: string) => { route.path = path; route.fullPath = path }, dispose: () => scope.stop() }
}
function assertStatic(h: ReturnType<typeof harness>) {
  assert.equal(h.instance.exams.value, EXAM_CATALOG)
  assert.deepEqual(h.requests, [])
  assert.equal(h.checks(), 0)
}

for (const kind of ['anonymous', 'free', 'premium', 'admin', 'verification']) {
  test(`all routes keep the configured sidebar without qualification requests for ${kind}`, async () => {
    assert.ok(staticRoutes.includes('/privacy-policy') && staticRoutes.includes('/premium/complete'))
    for (const path of ['/', '/practice/1/1', '/practice', ...staticRoutes, '/future-static-page', '/practice-guide']) {
      const h = harness(path, kind)
      try {
        await flush(); assertStatic(h)
        const exam = h.instance.exams.value[0]
        assert.equal(h.instance.examTarget(exam), `/practice/${exam.exam_number}/${exam.question_numbers[0]}`)
        h.instance.toggleExam(exam.exam_number)
        assert.equal(h.instance.openExam.value, exam.exam_number)
        assertStatic(h)
      } finally { h.dispose() }
    }
  })
}

test('pending or failed global authentication never removes navigation on home, practice or static routes', async () => {
  const h = harness('/')
  try {
    for (const path of ['/', '/practice/1/1', '/privacy-policy', '/']) {
      h.go(path); h.authResolved.value = false; await flush(); assertStatic(h)
      h.authResolved.value = true; await flush(); assertStatic(h)
    }
    assert.doesNotMatch(sidebar, /ensureCurrentUser|sidebar-loading|resolveAccess/)
  } finally { h.dispose() }
})

test('enabled payments keep locked static slots and child links without question API calls', async () => {
  const h = harness('/privacy-policy', 'free', true, true)
  try {
    await flush(); assertStatic(h)
    const paid = h.instance.exams.value[1]
    assert.equal(h.instance.isExamLocked(paid), true)
    assert.equal(h.instance.examTarget(paid), '/premium')
    for (const question of paid.question_numbers) assert.equal(h.instance.examTarget(paid, question), '/premium')
    h.instance.toggleExam(paid.exam_number)
    assert.equal(h.instance.openExam.value, paid.exam_number)
    h.user.value = member('premium'); await flush()
    assert.equal(h.instance.examTarget(paid, 2), '/practice/2/2')
    h.user.value = member('free'); await flush()
    assert.equal(h.instance.examTarget(paid, 2), '/premium')
    assert.equal(h.instance.openExam.value, paid.exam_number)
    h.user.value = null; await flush()
    assert.equal(h.instance.examTarget(paid, 2), '/premium')
    assert.deepEqual(h.requests, []); assert.equal(h.checks(), 0)
  } finally { h.dispose() }
})


test('configured navigation keeps all question links and locks through premium/free/logout transitions', async () => {
  assert.equal(EXAM_CATALOG.length, EXAM_CONFIG.exam.set_count)
  assert.equal(FREE_EXAM_MAX, EXAM_CONFIG.payments.free_exam_count)
  const expectedQuestions = Array.from({ length: EXAM_CONFIG.exam.questions_per_exam }, (_, index) => index + 1)
  for (const exam of EXAM_CATALOG) assert.deepEqual(exam.question_numbers, expectedQuestions)
  for (const path of ['/', '/privacy-policy', '/practice/1/1']) {
    const h = harness(path, 'free', true, PAYMENTS_ENABLED, FREE_EXAM_MAX)
    try {
      await flush()
      for (const exam of EXAM_CATALOG) {
        const locked = exam.exam_number > FREE_EXAM_MAX
        assert.equal(h.instance.isExamLocked(exam), locked)
        h.instance.toggleExam(exam.exam_number)
        for (const question of exam.question_numbers) assert.equal(h.instance.examTarget(exam, question), locked ? '/premium' : `/practice/${exam.exam_number}/${question}`)
      }
      const exam = EXAM_CATALOG.at(-1)!
      const lastQuestion = expectedQuestions.at(-1)!
      h.user.value = member('premium'); await flush()
      assert.equal(h.instance.examTarget(exam, lastQuestion), `/practice/${exam.exam_number}/${lastQuestion}`)
      h.user.value = member('free'); await flush()
      assert.equal(h.instance.examTarget(exam, lastQuestion), '/premium')
      h.user.value = null; await flush()
      assert.equal(h.instance.examTarget(exam, lastQuestion), '/premium')
      assert.equal(h.instance.openExam.value, exam.exam_number)
      assert.deepEqual(h.requests, [])
    } finally { h.dispose() }
  }
})
