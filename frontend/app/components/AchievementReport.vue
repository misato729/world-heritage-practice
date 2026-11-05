<script setup lang="ts">
import { achievementLabels } from '../../shared/achievement'
import type { AchievementQuestion, AchievementStatus } from '../../shared/types/achievement'

const emit = defineEmits<{ settled: [] }>()
const { report, loading, error, reload } = useAchievementReport()
watch(loading, (value, previous) => {
  if (previous && !value) emit('settled')
}, { flush: 'post' })
const { sessionVersion: accessToken } = useAuth()
const filter = ref<AchievementStatus | 'all'>('all')
const statuses = Object.keys(achievementLabels).filter(status => status !== 'reference') as AchievementStatus[]
const starting = ref(false)
const startError = ref('')
let active = true
onBeforeUnmount(() => { active = false })
const allQuestions = computed(() => report.value?.exams.flatMap(exam => exam.questions) ?? [])
const selected = computed(() => allQuestions.value.filter(q => filter.value === 'all' || q.status === filter.value))
const columns = computed(() => Math.max(0, ...report.value?.exams.map(exam => exam.questions.length) ?? []))
const percent = computed(() => report.value?.total_count ? report.value.answered_count / report.value.total_count * 100 : 0)
const count = (status: AchievementStatus) => allQuestions.value.filter(q => q.status === status).length
const questionLabel = (q: AchievementQuestion) => `模擬試験${q.exam_number} ${q.group_number !== null ? `大問${q.group_number} 小問${q.group_question_number}` : `問題${q.question_number}`}`
const resultLabel = (q: AchievementQuestion) => q.recent_results.length ? `直近から ${q.recent_results.map(value => value === null ? '参考採点' : value ? '正解' : '不正解').join('、')}` : '解答履歴なし'
const icons: Record<AchievementStatus, string> = { mastered: 'i-lucide-badge-check', correct: 'i-lucide-circle-check', incorrect: 'i-lucide-x', struggling: 'i-lucide-circle-x', unanswered: 'i-lucide-minus', reference: 'i-lucide-notebook-pen' }
const icon = (status: AchievementStatus) => icons[status]
const startReview = async () => {
  if (starting.value || !selected.value.length) return
  const token = accessToken.value
  const selection = filter.value
  const current = () => active && token === accessToken.value && selection === filter.value
  starting.value = true
  startError.value = ''
  try {
    // Refresh both eligibility and statuses before constructing the review list.
    const fresh = await reload()
    if (!fresh || !current()) return
    const questions = fresh.exams.flatMap(exam => exam.questions).filter(q => selection === 'all' || q.status === selection)
    if (!questions.length) { startError.value = '選択した状態の問題はありません。'; return }
    if (questions.length > 500) { startError.value = '一度に復習できるのは500問までです。状態を絞り込んでください。'; return }
    if (!current()) return
    const first = questions[0]!
    await navigateTo({ path: `/practice/${first.exam_number}/${first.question_number}`, query: { exams: [...new Set(questions.map(q => q.exam_number))].join(','), review: questions.map(q => `${q.exam_number}.${q.question_number}`).join(',') } })
  }
  catch (error: unknown) { if (current()) startError.value = '復習を開始できませんでした。もう一度お試しください。' }
  finally { if (active) starting.value = false }
}
</script>

<template>
  <section class="content-panel achievement-report" aria-labelledby="achievement-title">
    <div class="report-heading"><div class="map-brand"><svg class="map-symbol" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M6 30V14l9-5 10 5 9-5v17l-9 5-10-5-9 4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M15 9v17m10-12v17M11 19l5-2 7 5 6-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="29" cy="18" r="3" fill="currentColor"/></svg><div><h2 id="achievement-title">学習マップ</h2><p>解いた問題の手応えを、次の学習につなげましょう。</p></div></div><button class="secondary-link" type="button" :disabled="loading || starting" @click="reload">更新</button></div>
    <p v-if="loading" role="status">学習の記録を読み込んでいます。</p>
    <p v-else-if="error" class="form-error" role="alert">{{ error }} <button type="button" @click="reload">再試行</button></p>
    <template v-else-if="report">
      <div class="report-summary"><p><strong>{{ report.answered_count }}</strong> / {{ report.total_count }}問に挑戦</p><div class="progress-wrap"><progress :value="report.answered_count" :max="report.total_count || 1" aria-label="取り組み率" /><strong>{{ percent.toFixed(1) }}%</strong></div></div>
      <p class="report-note">現在利用できる公開問題への「取り組み率」です。正答率とは異なります。問題の内容更新で履歴がリセットされることがあります。</p>
      <p v-if="!report.full_access" class="report-note">プレミアム会員向けの問題は集計に含みません。<GradeLink to="/premium">プレミアム会員について</GradeLink></p>
      <p v-if="!report.total_count" class="report-empty">現在利用できる公開問題はありません。</p>
      <template v-else>
        <div class="review-controls"><label for="achievement-filter">復習する状態</label><select id="achievement-filter" v-model="filter" :disabled="starting"><option value="all">すべて（{{ allQuestions.length }}問）</option><option v-for="status in statuses" :key="status" :value="status">{{ achievementLabels[status] }}（{{ count(status) }}問）</option></select><button class="primary-link" type="button" :disabled="!selected.length || starting" @click="startReview">{{ starting ? '準備しています' : `選択した${selected.length}問を復習` }}</button></div>
        <p v-if="startError" class="form-error" role="alert">{{ startError }}</p>
        <p id="achievement-table-help" class="report-note">表は模試内の出題順です。各マスから問題を別タブで開けます。スマートフォンでは表を横にスクロールできます。</p>
        <div class="report-table-wrap" role="region" aria-label="問題ごとの達成度一覧" aria-describedby="achievement-table-help" tabindex="0">
          <table class="report-table"><caption class="sr-only">模擬試験ごとの解答状況。列は模試内の出題順。</caption><thead><tr><th scope="col">模擬試験</th><th v-for="n in columns" :key="n" scope="col">{{ n }}</th></tr></thead><tbody><tr v-for="exam in report.exams" :key="exam.exam_number"><th scope="row">模擬試験{{ exam.exam_number }}</th><td v-for="q in exam.questions" :key="q.id" :class="{ dimmed: filter !== 'all' && filter !== q.status }"><GradeLink :to="`/practice/${q.exam_number}/${q.question_number}`" target="_blank" rel="noopener" class="achievement-cell" :class="q.status" :aria-label="`${questionLabel(q)}：${achievementLabels[q.status]}。${resultLabel(q)}。別タブで開く`" :title="`${questionLabel(q)}：${resultLabel(q)}`"><UIcon :name="icon(q.status)" /></GradeLink></td><td v-for="n in columns - exam.questions.length" :key="`empty-${n}`" class="not-present"><span class="sr-only">該当する問題なし</span></td></tr></tbody></table>
        </div>
        <ul class="report-legend" aria-label="達成度の凡例"><li v-for="status in statuses" :key="status" :class="status"><UIcon :name="icon(status)" /><span>{{ achievementLabels[status] }}</span></li></ul>
        <p class="report-note">「安定して正解」は直近2回とも正解、「重点的に復習」は直近2回とも不正解です。ほかは直近1回の結果を示します。「未回答」は解答履歴のない問題です。パスしただけの問題も含みます。未回答のマスも問題を開けます。</p>
      </template>
    </template>
  </section>
</template>

<style scoped>
.achievement-report { min-width: 0; }
.report-heading { display: flex; justify-content: space-between; align-items: start; gap: 16px; margin-bottom: 18px; }
.map-brand { display: flex; gap: 12px; align-items: start; min-width: 0; }.map-symbol { width: 42px; height: 42px; flex-shrink: 0; color: var(--ink); background: #edf4ed; border-radius: 10px; padding: 4px; }
.report-heading h2 { font-size: 1.35rem; margin-bottom: 8px; }
.report-heading p, .report-note { color: var(--muted); font-size: .88rem; line-height: 1.8; }
.report-heading button { flex-shrink: 0; }
.report-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 14px 30px; margin: 12px 0; }
.report-summary p { margin: 0; }.report-summary p strong { margin: 0 4px; font-size: 1.7rem; }
.progress-wrap { display: flex; align-items: center; gap: 14px; flex: 1; min-width: 200px; }.progress-wrap strong { font-size: 1.5rem; }
progress { flex: 1; width: 100%; height: 12px; accent-color: #407658; border: 0; border-radius: 6px; overflow: hidden; }
progress::-webkit-progress-bar { background: #e5eee7; border-radius: 6px; }progress::-webkit-progress-value { background: #407658; border-radius: 6px; }progress::-moz-progress-bar { background: #407658; border-radius: 6px; }
.review-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 22px 0 12px; }
.review-controls label { font-weight: 700; }.review-controls select { padding: 10px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--surface); max-width: 100%; min-height: 44px; }
button { cursor: pointer; }button:disabled { opacity: .5; cursor: not-allowed; }
.report-table-wrap { position: relative; overflow: auto; max-width: 100%; margin-top: 14px; border: 1px solid var(--line); border-radius: 6px; }
.report-table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: .85rem; }
.report-table th, .report-table td { text-align: center; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 0; }
.report-table thead th { padding: 9px 6px; color: var(--muted); background: var(--surface); }
.report-table th:first-child { position: sticky; left: 0; z-index: 1; background: var(--surface); min-width: 112px; padding: 10px; white-space: nowrap; }
.report-table td { min-width: 44px; height: 46px; }.report-table tr:last-child td, .report-table tr:last-child th { border-bottom: 0; }
.achievement-cell { display: grid; place-items: center; width: 44px; min-height: 46px; font-size: 1.5rem; margin: auto; border-radius: 4px; }
.achievement-cell:hover { background: var(--surface-soft, #f3f5f3); }.achievement-cell:focus-visible, .report-table-wrap:focus-visible { outline: 3px solid var(--ink); outline-offset: -3px; }
.mastered { color: #296344; }.correct { color: #287782; }.incorrect { color: #a76131; }.struggling { color: #a14057; }.unanswered { color: #818a94; }.reference { color: #62639b; }
.achievement-cell.mastered { background: #e3f0e4; }.achievement-cell.correct { background: #e6f2f4; }.achievement-cell.incorrect { background: #fbf0e6; }.achievement-cell.struggling { background: #fae8ed; }.achievement-cell.reference { background: #eeeefa; }
.dimmed .achievement-cell { opacity: .25; }.dimmed .achievement-cell:focus-visible, .dimmed .achievement-cell:hover { opacity: 1; }
.not-present { color: var(--muted); }.report-legend { display: flex; flex-wrap: wrap; gap: 12px 22px; list-style: none; padding: 0; margin: 20px 0 10px; }
.report-legend li { display: flex; align-items: center; gap: 7px; font-size: .85rem; }.report-legend .iconify { font-size: 1.375rem; flex-shrink: 0; }.report-legend li > span:last-child { color: var(--ink); }
.report-empty { margin-top: 18px; }
@media (max-width: 520px) { .progress-wrap { flex-basis: 100%; min-width: 0; }.review-controls { align-items: stretch; }.review-controls label { flex-basis: 100%; }.review-controls select, .review-controls button { width: 100%; }.report-table th:first-child { min-width: 96px; padding: 8px; }.report-heading { gap: 8px; }.map-brand { gap: 8px; }.map-symbol { width: 32px; height: 32px; } }
</style>
