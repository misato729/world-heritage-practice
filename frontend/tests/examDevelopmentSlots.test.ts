import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { computed, effectScope, ref, watch, reactive } from 'vue'
import { EXAM_CONFIG, parseExamConfig } from '../app/utils/examConfig.ts'
import { EXAM_CATALOG, FREE_EXAM_MAX } from '../app/utils/examCatalog.ts'

const read = (path: string) => readFileSync(new URL(`../app/${path}`, import.meta.url), 'utf8')
const component = read('components/ExamSidebar.vue')
const script = component.split('<script setup lang="ts">')[1]!.split('</script>')[0]!
const template = component.split('<template>')[1]!

test('the per-grade number of selectable mocks is optional and is a whole number of zero or more', () => {
  const grade2 = EXAM_CONFIG.grades.find(g => g.code === '2')!
  assert.equal(grade2.available_exam_count, 10)
  const valid = structuredClone(EXAM_CONFIG); valid.grades[1]!.available_exam_count = 0
  assert.equal(parseExamConfig(valid).grades[1]!.available_exam_count, 0)
  const invalid = structuredClone(EXAM_CONFIG); invalid.grades[0]!.available_exam_count = -1
  assert.throws(() => parseExamConfig(invalid))
  const fraction = structuredClone(EXAM_CONFIG); fraction.grades[0]!.available_exam_count = 1.5
  assert.throws(() => parseExamConfig(fraction))
  assert.equal(EXAM_CONFIG.grades.find(g => g.code === 'pre1')!.available_exam_count, 10)
  assert.equal(EXAM_CONFIG.grades.find(g => g.code === '1')!.available_exam_count, 15)
})

test('slots after the selectable number are labelled 開発中 and have no link, toggle or question list', () => {
  assert.match(template, /v-if="isExamInDevelopment\(exam\)"[\s\S]*?<span class="exam-link exam-link-disabled" aria-disabled="true">模擬試験 \{\{ exam\.exam_number \}\}（開発中）<\/span>/)
  const development = template.split('v-if="isExamInDevelopment(exam)"')[1]!.split('v-else')[0]!
  assert.doesNotMatch(development, /GradeLink|<button|@click/)
  assert.match(template, /v-if="openExam === exam\.exam_number && !isExamInDevelopment\(exam\)"/)
})

test('development status follows the grade setting and leaves earlier slots unchanged', () => {
  const evaluate = (available: number | undefined) => {
    const code = ts.transpileModule(script.replace(/^import[^\n]*\n/gm, ''), { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText
    const auth = { user: ref(null) }
    const scope = effectScope()
    const result = scope.run(() => new Function('computed', 'ref', 'watch', 'defineProps', 'defineEmits', 'useRoute', 'useAuth', 'useFavorites', 'useGrade', 'hasFullExamAccess',
      code + '\nreturn { isExamInDevelopment, examTarget, exams }')(computed, ref, watch, () => ({ collapsed: false }), () => () => {},
      () => reactive({ path: '/', fullPath: '/' }), () => auth, () => ({ isFavoriteAt: () => false }),
      () => ({ EXAM_CATALOG, FREE_EXAM_MAX, AVAILABLE_EXAM_MAX: available }), () => false))
    scope.stop()
    return result as { isExamInDevelopment: (e: unknown) => boolean, examTarget: (e: unknown) => string, exams: { value: typeof EXAM_CATALOG } }
  }
  const s = evaluate(5)
  const status = s.exams.value.map(e => s.isExamInDevelopment(e))
  assert.deepEqual(status.slice(0, 5), [false, false, false, false, false])
  assert.ok(status.slice(5).every(Boolean))
  assert.equal(s.examTarget(s.exams.value[0]), '/practice/1/1')
  assert.equal(s.examTarget(s.exams.value[3]), '/premium')
  const all = evaluate(undefined)
  assert.ok(all.exams.value.every(e => !all.isExamInDevelopment(e)))
})

test('the home exam grid shows later slots as 開発中 cards without links and keeps them out of the condition selector', () => {
  const home = read('pages/index.vue')
  assert.match(home, /const examInDevelopment = \(examNumber: number\) => AVAILABLE_EXAM_MAX !== undefined && examNumber > AVAILABLE_EXAM_MAX/)
  assert.match(home, /\(hasFullAccess\.value \? EXAM_CATALOG : freeExams\.value\)\.filter\(exam => !examInDevelopment\(exam\.exam_number\)\)/)
  const grid = home.split('<div class="exam-grid">')[1]!.split('</template>')[0]!
  const development = grid.split('v-if="examInDevelopment(exam.exam_number)"')[1]!.split('</span>')[0]!
  assert.match(development, /aria-disabled="true"/)
  assert.match(development, /<small>開発中<\/small>/)
  assert.doesNotMatch(development, /GradeLink|:to=|@click/)
  assert.match(grid, /<GradeLink\s+v-else\s+class="exam-card"/)
})
