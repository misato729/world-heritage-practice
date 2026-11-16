import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue'

const source = readFileSync(new URL('../app/components/GradeLink.vue', import.meta.url), 'utf8')
  .split('<script setup lang="ts">')[1]!.split('</script>')[0]!.replace(/^import[^\n]*\n/gm, '')
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ESNext } }).outputText
function harness(to: unknown, grade: string | null | undefined, snapshot?: string | null) {
  const route = reactive({ query: { grade } }), mounted: (() => void)[] = []
  const scope = effectScope()
  const target = scope.run(() => new Function('defineProps', 'useRoute', 'useState', 'onMounted', 'watch', 'computed', code + '\nreturn target')(
    () => ({ to }), () => route, (_key: string, init: () => unknown) => ref(snapshot === undefined ? init() : snapshot),
    (callback: () => void) => mounted.push(callback), watch, computed,
  ))!
  return { target, route, mount: () => mounted.forEach(callback => callback()), stop: () => scope.stop() }
}

test('static HTML keeps its initial href then updates the actual browser grade after mount', async () => {
  for (const grade of ['2', 'pre1', '1']) {
    const h = harness('/practice/1/1', grade, null)
    try {
      assert.equal(h.target.value, '/practice/1/1')
      h.mount(); await nextTick()
      assert.equal(h.target.value, `/practice/1/1?grade=${grade}`)
      h.route.query.grade = 'pre1'; await nextTick()
      assert.equal(h.target.value, '/practice/1/1?grade=pre1')
    } finally { h.stop() }
  }
})

test('an explicit empty grade query keeps the default grade 2', async () => {
  const ssr = harness('/privacy-policy', null)
  const staticPage = harness('/privacy-policy', null, null)
  try {
    assert.equal(ssr.target.value, '/privacy-policy?grade=2')
    assert.equal(staticPage.target.value, '/privacy-policy')
    staticPage.mount(); await nextTick()
    assert.equal(staticPage.target.value, '/privacy-policy?grade=2')
  } finally { ssr.stop(); staticPage.stop() }
})

test('SSR grade, explicit destination grade, other query/hash and external destinations are preserved', () => {
  for (const [to, expected] of [
    ['/history?page=2#recent', '/history?page=2&grade=1#recent'],
    ['/practice/1/1?grade=2', '/practice/1/1?grade=2'],
    ['https://example.invalid/', 'https://example.invalid/'],
    ['mailto:example@example.invalid', 'mailto:example@example.invalid'],
    [{ path: '/history', query: { grade: '2', page: '2' } }, { path: '/history', query: { grade: '2', page: '2' } }],
  ] as const) {
    const h = harness(to, '1')
    try { assert.deepEqual(h.target.value, expected) } finally { h.stop() }
  }
})
