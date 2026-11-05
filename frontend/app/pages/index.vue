<script setup lang="ts">
const { label: gradeLabel, EXAM_CATALOG, FREE_EXAM_MAX, QUESTIONS_PER_EXAM } = useGrade()
import { MAX_REVIEW_POSITIONS } from '~/utils/reviewPositions'
import {
  createPracticeSeed,
  createPracticeSequence,
  shufflePracticeSequence,
  type PracticeOrder,
} from '~/utils/practiceSequence'

type LauncherMode = 'exam' | 'conditions' | 'incorrect'

const title = SITE.name
const description = SITE.description

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
})

const questionNumbers = Object.freeze(Array.from({ length: QUESTIONS_PER_EXAM }, (_, index) => index + 1))

const { user, sessionVersion } = useAuth()
const { $api: api } = useNuxtApp()
const startingPractice = ref(false)
const startError = ref('')
let active = true
onScopeDispose(() => { active = false })
const launcherMode = ref<LauncherMode>('exam')

const hasFullAccess = computed(() => (
  hasFullExamAccess(user.value)
))
const freeExams = computed(() => EXAM_CATALOG.filter(exam => exam.exam_number <= FREE_EXAM_MAX))
const availableExams = computed(() => (
  hasFullAccess.value ? EXAM_CATALOG : freeExams.value
))
const availableExamNumbers = computed(() => availableExams.value.map(exam => exam.exam_number))
const selectedExamNumbers = ref<number[]>([...availableExamNumbers.value])
const selectedQuestionNumbers = ref<number[]>([...questionNumbers])

const allExamsSelected = computed({
  get: () => (
    availableExamNumbers.value.length > 0
    && selectedExamNumbers.value.length === availableExamNumbers.value.length
    && availableExamNumbers.value.every(examNumber => selectedExamNumbers.value.includes(examNumber))
  ),
  set: (selected: boolean) => {
    selectedExamNumbers.value = selected ? [...availableExamNumbers.value] : []
  },
})
const someExamsSelected = computed(() => (
  selectedExamNumbers.value.length > 0 && !allExamsSelected.value
))
const allQuestionsSelected = computed({
  get: () => (
    selectedQuestionNumbers.value.length === questionNumbers.length
    && questionNumbers.every(questionNumber => selectedQuestionNumbers.value.includes(questionNumber))
  ),
  set: (selected: boolean) => {
    selectedQuestionNumbers.value = selected ? [...questionNumbers] : []
  },
})
const someQuestionsSelected = computed(() => (
  selectedQuestionNumbers.value.length > 0 && !allQuestionsSelected.value
))
const sortedSelectedExamNumbers = computed(() => (
  [...selectedExamNumbers.value].sort((left, right) => left - right)
))
const sortedSelectedQuestionNumbers = computed(() => (
  [...selectedQuestionNumbers.value].sort((left, right) => left - right)
))
const selectedQuestionCount = computed(() => (
  sortedSelectedExamNumbers.value.length * sortedSelectedQuestionNumbers.value.length
))
const conditionSequence = computed(() => createPracticeSequence(
  sortedSelectedExamNumbers.value,
  sortedSelectedQuestionNumbers.value,
))
const hasConditionSelection = computed(() => conditionSequence.value.length > 0)

const examIsLocked = (examNumber: number) => examNumber > FREE_EXAM_MAX && !hasFullAccess.value
const examTarget = (examNumber: number) => (
  examIsLocked(examNumber) ? '/premium' : `/practice/${examNumber}/1`
)
// Fetch publication metadata only after an explicit start, never for rendering navigation.
const startConditionalPractice = async (order: PracticeOrder) => {
  if (!hasConditionSelection.value || startingPractice.value) return
  startingPractice.value = true
  startError.value = ''
  const owner = user.value
  const version = sessionVersion.value
  const selection = JSON.stringify([sortedSelectedExamNumbers.value, sortedSelectedQuestionNumbers.value])
  const positions = conditionSequence.value
  const isCurrentStart = () => active && owner === user.value && version === sessionVersion.value
    && launcherMode.value === 'conditions'
    && selection === JSON.stringify([sortedSelectedExamNumbers.value, sortedSelectedQuestionNumbers.value])
  try {
    const response = await api<{ data: { exam_number: number, question_numbers: number[], access?: string }[] }>('/api/v1/exams')
    if (!isCurrentStart()) return
    const published = new Set(response.data.filter(exam => exam.access !== 'paid_membership_required')
      .flatMap(exam => exam.question_numbers.map(number => `${exam.exam_number}.${number}`)))
    let sequence = positions.filter(position => published.has(`${position.examNumber}.${position.questionNumber}`))
    if (!sequence.length) { startError.value = '選択した条件に公開中の問題はありません。'; return }
    if (sequence.length > MAX_REVIEW_POSITIONS) { startError.value = `対象が${MAX_REVIEW_POSITIONS}問を超えています。条件を絞ってください。`; return }
    const query: Record<string, string> = {
      exams: sortedSelectedExamNumbers.value.join(','),
      questions: sortedSelectedQuestionNumbers.value.join(','),
      review: sequence.map(position => `${position.examNumber}.${position.questionNumber}`).join(','),
    }
    if (order === 'random') {
      const seed = createPracticeSeed()
      sequence = shufflePracticeSequence(sequence, seed)
      query.order = order
      query.seed = String(seed)
    }
    const firstPosition = sequence[0]!
    await navigateTo({ path: `/practice/${firstPosition.examNumber}/${firstPosition.questionNumber}`, query })
  } catch {
    if (isCurrentStart()) startError.value = '公開中の問題を確認できませんでした。もう一度お試しください。'
  } finally { startingPractice.value = false }
}

watch(availableExamNumbers, (examNumbers, previousExamNumbers) => {
  const previouslySelectedAll = (
    previousExamNumbers.length > 0
    && previousExamNumbers.every(examNumber => selectedExamNumbers.value.includes(examNumber))
  )
  selectedExamNumbers.value = previouslySelectedAll
    ? [...examNumbers]
    : selectedExamNumbers.value.filter(examNumber => examNumbers.includes(examNumber))
})

</script>

<template>
  <div class="home-main">
    <section class="overview-section">
      <div class="overview-copy">
        <p v-if="gradeLabel !== '2級'" role="status">{{ gradeLabel }}の教材は準備中です。現在は2級の模試1〜5を収録しています。</p>
        <p class="heritage-eyebrow">{{ gradeLabel }}｜世界遺産検定 1級・準1級・2級の学習サイト</p>
        <h1 class="section-heading">
          <span>{{ SITE.tagline }}</span>
        </h1>
        <p>
          {{ SITE.description }}
        </p>
        <div class="overview-actions">
          <GradeLink class="secondary-link" to="/exam-overview">試験概要を見る</GradeLink>
        </div>
        <ul class="heritage-highlights" aria-label="学習のテーマ">
          <li><UIcon name="i-lucide-landmark" />歴史と文化</li>
          <li><UIcon name="i-lucide-leaf" />自然と生態系</li>
          <li><UIcon name="i-lucide-globe" />世界とのつながり</li>
        </ul>
      </div>
    </section>

    <section v-if="SITE.notice" class="preparation-notice" aria-labelledby="preparation-title">
      <UIcon name="i-lucide-book-open" aria-hidden="true" />
      <div><h2 id="preparation-title">問題の公開準備中</h2><p>{{ SITE.notice }}</p></div>
    </section>

    <section id="practice-launcher" class="practice-launcher" aria-labelledby="practice-launcher-title">
      <div class="launcher-heading">
        <div>
          <h2 id="practice-launcher-title" class="section-heading">
            <span>問題演習を始める</span>
          </h2>
        </div>
        <p>模試を1回分解くか、取り組みたい模試と問題番号を自由に組み合わせて始められます。</p>
      </div>

      <div class="launcher-tabs" role="tablist" aria-label="問題演習の開始方法">
        <button
          id="exam-mode-tab"
          type="button"
          role="tab"
          :aria-selected="launcherMode === 'exam'"
          aria-controls="exam-mode-panel"
          :class="{ active: launcherMode === 'exam' }"
          @click="launcherMode = 'exam'"
        >
          <UIcon name="i-lucide-files" />
          模試を選ぶ
        </button>
        <button
          id="conditions-mode-tab"
          type="button"
          role="tab"
          :aria-selected="launcherMode === 'conditions'"
          aria-controls="conditions-mode-panel"
          :class="{ active: launcherMode === 'conditions' }"
          @click="launcherMode = 'conditions'"
        >
          <UIcon name="i-lucide-list-filter" />
          条件を指定
        </button>
        <button id="incorrect-mode-tab" type="button" role="tab" :aria-selected="launcherMode === 'incorrect'" aria-controls="incorrect-mode-panel" :class="{ active: launcherMode === 'incorrect' }" @click="launcherMode = 'incorrect'"><UIcon name="i-lucide-list-restart" />間違えた問題</button>
      </div>

      <div
        v-if="launcherMode === 'exam'"
        id="exam-mode-panel"
        class="launcher-panel"
        role="tabpanel"
        aria-labelledby="exam-mode-tab"
      >
        <div class="exam-grid-heading">
          <p><strong>全{{ EXAM_CATALOG.length }}回の構成</strong><span>各{{ QUESTIONS_PER_EXAM }}問</span></p>
          <GradeLink v-if="!hasFullAccess" class="premium-info-link" to="/premium">
            <UIcon name="i-lucide-lock-keyhole" />
            模擬試験{{ FREE_EXAM_MAX + 1 }}以降はプレミアム会員向けです
          </GradeLink>
        </div>
        <div class="exam-grid">
          <GradeLink
            v-for="exam in EXAM_CATALOG"
            :key="exam.exam_number"
            class="exam-card"
            :to="examTarget(exam.exam_number)"
            :aria-label="examIsLocked(exam.exam_number) ? `模擬試験${exam.exam_number}はプレミアム会員向けです` : `模擬試験${exam.exam_number}を始める`"
          >
            <strong>{{ exam.exam_number }}</strong>
            <UIcon v-if="examIsLocked(exam.exam_number)" name="i-lucide-lock-keyhole" aria-hidden="true" />
          </GradeLink>
        </div>
      </div>

      <div
        v-else-if="launcherMode === 'conditions'"
        id="conditions-mode-panel"
        class="launcher-panel"
        role="tabpanel"
        aria-labelledby="conditions-mode-tab"
      >
        <form class="condition-form" @submit.prevent="startConditionalPractice('sequential')">
          <div class="condition-fields">
            <fieldset class="condition-fieldset">
              <legend>対象模試</legend>
              <div class="condition-field-heading">
                <p>複数選択できます</p>
                <label class="all-selector">
                  <input
                    v-model="allExamsSelected"
                    type="checkbox"
                    :indeterminate="someExamsSelected"
                  >
                  <span>全選択</span>
                </label>
              </div>
              <div class="number-checkbox-grid exam-number-grid">
                <label
                  v-for="exam in availableExams"
                  :key="exam.exam_number"
                  :class="{ selected: selectedExamNumbers.includes(exam.exam_number) }"
                >
                  <input
                    v-model="selectedExamNumbers"
                    type="checkbox"
                    name="exam-numbers"
                    :value="exam.exam_number"
                  >
                  <span>{{ exam.exam_number }}</span>
                </label>
              </div>
            </fieldset>

            <fieldset class="condition-fieldset">
              <legend>出題範囲</legend>
              <div class="condition-field-heading">
                <p>問題番号を選択してください</p>
                <label class="all-selector">
                  <input
                    v-model="allQuestionsSelected"
                    type="checkbox"
                    :indeterminate="someQuestionsSelected"
                  >
                  <span>全選択</span>
                </label>
              </div>
              <div class="number-checkbox-grid question-number-grid">
                <label
                  v-for="questionNumber in questionNumbers"
                  :key="questionNumber"
                  :class="{ selected: selectedQuestionNumbers.includes(questionNumber) }"
                >
                  <input
                    v-model="selectedQuestionNumbers"
                    type="checkbox"
                    name="question-numbers"
                    :value="questionNumber"
                  >
                  <span>問{{ questionNumber }}</span>
                </label>
              </div>
            </fieldset>
          </div>

          <div class="condition-submit">
            <p v-if="hasConditionSelection">
              <span>選択中</span>
              {{ sortedSelectedExamNumbers.length }}模試・各{{ sortedSelectedQuestionNumbers.length }}問
              <strong>最大{{ selectedQuestionCount }}問</strong>
            </p>
            <p v-else class="selection-required">
              <span>選択内容を確認してください</span>
              対象模試と問題番号を1つ以上選択してください
            </p>
            <div class="condition-actions">
              <button class="primary-link" type="submit" :disabled="!hasConditionSelection || startingPractice">
                <UIcon name="i-lucide-list-ordered" />
                問題番号順に始める
              </button>
              <button
                class="secondary-link"
                type="button"
                :disabled="!hasConditionSelection || startingPractice"
                @click="startConditionalPractice('random')"
              >
                <UIcon name="i-lucide-shuffle" />
                ランダムに始める
              </button>
            </div>
          </div>
          <p v-if="startError" class="condition-error" role="alert">{{ startError }}</p>
        </form>
      </div>
      <div v-if="launcherMode === 'incorrect'" id="incorrect-mode-panel" class="launcher-panel" role="tabpanel" aria-labelledby="incorrect-mode-tab"><IncorrectReviewPanel /></div>
    </section>

    <section id="usage-guide" class="home-section policy-section" aria-labelledby="usage-guide-title">
      <div class="section-title">
        <h2 id="usage-guide-title" class="section-heading">
          <span>利用にあたって</span>
        </h2>
      </div>
      <dl class="usage-details">
        <div class="usage-row">
          <dt>{{ PAYMENTS_ENABLED ? (FREE_EXAM_MAX > 0 ? `模擬試験1〜${FREE_EXAM_MAX}は無料` : '会員資格に応じて演習') : 'すべての公開問題を無料で演習' }}</dt>
          <dd>
            <p>{{ PAYMENTS_ENABLED && FREE_EXAM_MAX === 0 ? '問題の演習にはプレミアム会員資格が必要です。' : '無料の公開問題はログインなしで利用できます。' }}解答履歴の保存にはログインが必要です。</p>
          </dd>
        </div>
        <div v-if="PAYMENTS_ENABLED" class="usage-row">
          <dt>{{ PRICE_LABEL }}（税込）／月</dt>
          <dd>
            <p>プレミアム会員は模擬試験{{ FREE_EXAM_MAX + 1 }}以降も利用できます。毎月自動更新されます。契約管理から解約できます。</p>
            <GradeLink class="usage-premium-link" to="/premium">
              <span>プレミアム会員について</span>
              <UIcon name="i-lucide-arrow-right" aria-hidden="true" />
            </GradeLink>
          </dd>
        </div>
        <div class="usage-row">
          <dt>根拠資料も確認</dt>
          <dd>
            <p>各問題の解説と、出題の根拠となる資料を確認できます。</p>
          </dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.heritage-eyebrow { margin: 0 0 14px; color: var(--teal-dark); font-size: 13px; font-weight: 800; letter-spacing: .08em; }
.heritage-highlights { display: flex; flex-wrap: wrap; gap: 12px 22px; padding: 0; margin: 26px 0 0; list-style: none; color: var(--teal-dark); font-size: 13px; font-weight: 700; }
.heritage-highlights li { display: inline-flex; align-items: center; gap: 7px; }
.preparation-notice { display: flex; align-items: flex-start; gap: 14px; margin: 0 clamp(18px, 6vw, 86px) 34px; padding: 22px; border: 1px solid #d4dfcf; border-radius: 8px; background: #f2f5e9; }
.preparation-notice > :deep(svg) { flex-shrink: 0; width: 24px; height: 24px; color: var(--teal-dark); }
.preparation-notice h2 { margin: 0 0 7px; font-size: 17px; }
.preparation-notice p { margin: 0; color: var(--muted); line-height: 1.8; }
.home-main { min-width: 0; background: #f8faf9; }
.practice-launcher {
  scroll-margin-top: calc(var(--site-navigation-height, var(--header-height)) + 20px);
  padding: 52px clamp(28px, 6vw, 86px) 58px;
  border-top: 1px solid #d4dfde;
  background: #eef4f3;
}
.launcher-heading { display: flex; align-items: end; justify-content: space-between; gap: 28px; }
.launcher-heading h2 { margin: 0; font-size: 30px; line-height: 1.3; }
.launcher-heading > p { max-width: 480px; margin: 0; color: var(--muted); line-height: 1.8; }
.section-heading { display: flex; align-items: center; gap: 10px; }
.section-heading::before { content: ''; flex: 0 0 4px; width: 4px; height: 26px; background: var(--teal-dark); }
.section-heading > span { min-width: 0; }
.launcher-tabs {
  width: min(600px, 100%);
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 30px;
  border-bottom: 1px solid #bfcfd0;
}
.launcher-tabs button {
  white-space: normal;
  overflow-wrap: anywhere;
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-bottom: 3px solid transparent;
  background: transparent;
  color: #52656c;
  font-weight: 800;
  cursor: pointer;
}
.launcher-tabs button.active { border-color: var(--teal); color: var(--teal-dark); }
.launcher-tabs :deep(svg) { width: 19px; height: 19px; }
.launcher-panel { padding-top: 28px; }
.exam-grid-heading {
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 14px;
}
.exam-grid-heading p { display: flex; align-items: baseline; gap: 10px; margin: 0; }
.exam-grid-heading strong { font-size: 16px; }
.exam-grid-heading span { color: var(--muted); font-size: 13px; font-weight: 700; }
.exam-grid { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 8px; }
.exam-card {
  position: relative;
  height: 68px;
  display: grid;
  place-items: center;
  padding: 8px;
  border: 1px solid #bdccce;
  border-radius: 6px;
  background: #fff;
  color: var(--ink);
  text-decoration: none;
  transition: border-color .15s, background .15s, transform .15s;
}
.exam-card:hover { border-color: var(--teal); background: #f9ffff; transform: translateY(-1px); }
.exam-card strong { color: var(--teal-dark); font-size: 20px; line-height: 1; transform: translateY(-1px); }
.exam-card :deep(.iconify) { position: absolute; top: 7px; right: 7px; width: 13px; height: 13px; color: #677b81; }
.premium-info-link { display: inline-flex; align-items: center; gap: 5px; color: var(--teal-dark); font-size: 13px; font-weight: 800; }
.condition-error { margin: 0; padding: 16px 26px; color: #a23b2a; }
.condition-form { border: 1px solid #c7d4d5; border-radius: 8px; background: #fff; }
.condition-fields { display: grid; gap: 28px; padding: 28px; }
.condition-fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
.condition-fieldset + .condition-fieldset { padding-top: 26px; border-top: 1px solid #dce4e4; }
.condition-fieldset legend { padding: 0; color: #253d45; font-size: 17px; font-weight: 900; }
.condition-field-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 7px 0 13px;
}
.condition-field-heading p { margin: 0; color: var(--muted); font-size: 13px; }
.all-selector {
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid #bdcbcd;
  border-radius: 5px;
  background: #f8faf9;
  color: #344951;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}
.all-selector input { width: 17px; height: 17px; margin: 0; accent-color: var(--teal); }
.number-checkbox-grid { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 8px; }
.number-checkbox-grid label {
  min-width: 0;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 6px;
  border: 1px solid #c5d1d3;
  border-radius: 5px;
  background: #fff;
  color: #3a5057;
  font-weight: 900;
  cursor: pointer;
  transition: border-color .15s, background .15s;
}
.number-checkbox-grid label:hover { border-color: var(--teal); }
.number-checkbox-grid label.selected { border-color: var(--teal); background: #eaf6f5; color: var(--teal-dark); }
.number-checkbox-grid input { width: 16px; height: 16px; flex: 0 0 16px; margin: 0; accent-color: var(--teal); }
.question-number-grid label { gap: 4px; padding-inline: 4px; }
.question-number-grid label span { white-space: nowrap; }
.condition-submit {
  min-height: 82px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 26px;
  border-top: 1px solid #d8e1e2;
  background: #f4f7f6;
}
.condition-submit p { margin: 0; color: #40545b; font-weight: 800; }
.condition-submit p span { display: block; margin-bottom: 3px; color: var(--muted); font-size: 11px; }
.condition-submit p strong { margin-left: 8px; color: var(--teal-dark); }
.condition-submit .selection-required { color: #a23b2a; }
.condition-actions { display: flex; flex: 0 0 auto; gap: 10px; }
.condition-actions button { white-space: nowrap; }
.condition-actions button:disabled { opacity: .45; cursor: not-allowed; }
.subject-label { white-space: nowrap; }
.overview-section {
  min-height: 280px;
  padding: 52px clamp(28px, 6vw, 86px);
  display: flex;
  align-items: center;
  background: #fff;
}
.overview-copy { max-width: 680px; }
.overview-copy h1 { margin: 0; font-size: 30px; line-height: 1.3; }
.overview-copy > p { margin: 22px 0 0; color: var(--muted); font-size: 16px; line-height: 1.9; }
.overview-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 30px; }
.home-section { padding: 62px clamp(28px, 6vw, 86px); }
.section-title { display: flex; align-items: baseline; gap: 14px; margin-bottom: 26px; }
.section-title h2 { margin: 0; font-size: 30px; }
.updates-section { background: #f1f5f4; }
.update-list { border-top: 1px solid #cbd7d9; }
.update-list article { min-height: 68px; display: grid; grid-template-columns: 120px 1fr; align-items: center; gap: 18px; border-bottom: 1px solid #cbd7d9; }
.update-list time { color: var(--teal-dark); font-weight: 800; }
.update-list p { margin: 0; color: #4f6169; }
.policy-section {
  scroll-margin-top: calc(var(--site-navigation-height, var(--header-height)) + 20px);
  background: #fff;
}
.usage-details { margin: 0; border-top: 1px solid #dce4e4; }
.usage-row {
  display: grid;
  grid-template-columns: minmax(180px, .3fr) minmax(0, 1fr);
  gap: 32px;
  padding: 26px 0;
  border-bottom: 1px solid #dce4e4;
}
.usage-row dt { color: var(--ink); font-size: 16px; font-weight: 700; line-height: 1.9; }
.usage-row dd { min-width: 0; margin: 0; color: #51636c; font-size: 15px; line-height: 1.9; }
.usage-row p { margin: 0; }
.usage-premium-link {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  color: var(--teal-dark);
  font-size: 14px;
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: #a3c3c4;
  text-underline-offset: 4px;
}
.usage-premium-link:hover { text-decoration-color: currentColor; }
.usage-premium-link:focus-visible { outline: 2px solid var(--teal-dark); outline-offset: 4px; }
.usage-premium-link :deep(.iconify) { flex: 0 0 16px; width: 16px; height: 16px; }

@media (max-width: 1100px) {
  .exam-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
}

@media (max-width: 1200px) {
  .question-number-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
}

@media (max-width: 960px) {
  .number-checkbox-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .usage-row { grid-template-columns: minmax(0, 1fr); gap: 8px; }
}

@media (max-width: 640px) {
  .practice-launcher { padding: 32px 20px 38px; }
  .launcher-heading { align-items: flex-start; flex-direction: column; gap: 12px; }
  .launcher-heading h2 { font-size: 27px; }
  .launcher-heading > p { font-size: 14px; }
  .launcher-tabs { width: 100%; margin-top: 24px; }
  .exam-grid-heading { align-items: flex-start; flex-direction: column; gap: 8px; }
  .exam-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 7px; }
  .exam-card { height: 68px; }
  .condition-fields { padding: 20px; }
  .condition-field-heading { align-items: flex-end; }
  .number-checkbox-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 7px; }
  .number-checkbox-grid label { min-height: 46px; flex-direction: column; gap: 3px; padding: 5px 2px; }
  .number-checkbox-grid input { width: 15px; height: 15px; flex-basis: 15px; }
  .condition-submit { align-items: stretch; flex-direction: column; padding: 18px 20px 20px; }
  .condition-actions { width: 100%; flex-direction: column; }
  .condition-actions button { width: 100%; }
  .overview-section { min-height: auto; padding: 36px 20px; }
  .overview-actions { align-items: stretch; flex-direction: column; }
  .home-section { padding: 44px 20px; }
  .update-list article { grid-template-columns: 1fr; gap: 5px; padding: 15px 0; }
  .usage-row { padding: 22px 0; }
}
@media (max-width: 640px) { .launcher-tabs button { flex-direction: column; gap: 4px; padding: 8px 2px; font-size: .8125rem; line-height: 1.4; } }
</style>
