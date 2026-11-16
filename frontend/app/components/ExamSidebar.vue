<script setup lang="ts">
import type { ExamCatalogEntry } from '~/utils/examCatalog'
const { EXAM_CATALOG, FREE_EXAM_MAX } = useGrade()
import { hasFullExamAccess } from '~/utils/examConfig'

defineProps<{ collapsed: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
const route = useRoute()
const openExam = ref<number | null>(null)
const mobileOpen = ref(false)
const mobileToggle = ref<HTMLButtonElement | null>(null)
const { user } = useAuth()
const { isFavoriteAt } = useFavorites()

const exams = computed(() => EXAM_CATALOG)
const isExamLocked = (exam: ExamCatalogEntry) => exam.exam_number > FREE_EXAM_MAX && !hasFullExamAccess(user.value)

const toggleExam = (exam: number) => {
  openExam.value = openExam.value === exam ? null : exam
}

const closeMobileList = () => { mobileOpen.value = false }
const closeMobileOnEscape = () => {
  if (!mobileOpen.value) return
  closeMobileList()
  mobileToggle.value?.focus()
}

watch(() => route.fullPath, closeMobileList)

const isCurrentQuestion = (exam: number, question: number) => {
  return route.path === `/practice/${exam}/${question}`
}

const examTarget = (exam: ExamCatalogEntry, question?: number) => (
  isExamLocked(exam) ? '/premium' : `/practice/${exam.exam_number}/${question ?? exam.question_numbers[0]}`
)
</script>

<template>
  <aside
    class="exam-sidebar"
    :class="{ 'mobile-open': mobileOpen, 'desktop-collapsed': collapsed }"
    aria-label="模擬試験一覧"
    @keydown.esc="closeMobileOnEscape"
  >
    <div class="sidebar-heading">
      <UIcon v-if="!collapsed" class="sidebar-heading-icon" name="i-lucide-files" />
      <span v-if="!collapsed" class="sidebar-heading-label">試験セット</span>
      <button
        class="desktop-sidebar-toggle"
        type="button"
        :aria-expanded="!collapsed"
        aria-controls="exam-sidebar-content"
        :aria-label="collapsed ? 'サイドバーを開く' : 'サイドバーを閉じる'"
        :title="collapsed ? 'サイドバーを開く' : 'サイドバーを閉じる'"
        @click="emit('toggle')"
      >
        <UIcon :name="collapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-left'" />
      </button>
    </div>

    <button
      ref="mobileToggle"
      class="mobile-exam-toggle"
      type="button"
      :aria-expanded="mobileOpen"
      aria-controls="exam-sidebar-content"
      :title="mobileOpen ? '試験セットを閉じる' : '試験セットを開く'"
      @click="mobileOpen = !mobileOpen"
    >
      <UIcon name="i-lucide-files" />
      <span>試験セット</span>
      <UIcon :name="mobileOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" />
    </button>

    <div id="exam-sidebar-content" class="sidebar-content">
      <div class="exam-groups">
        <section
          v-for="exam in exams"
          :key="exam.exam_number"
          class="exam-group"
        >
          <div
            class="exam-row"
            :class="{ current: route.path.startsWith(`/practice/${exam.exam_number}/`) }"
          >
            <GradeLink class="exam-link" :to="examTarget(exam)" @click="closeMobileList">
              模擬試験 {{ exam.exam_number }}
              <UIcon v-if="isExamLocked(exam)" name="i-lucide-lock-keyhole" aria-label="プレミアム会員向け" />
            </GradeLink>
            <button
              type="button"
              :aria-expanded="openExam === exam.exam_number"
              :aria-controls="`exam-${exam.exam_number}-questions`"
              :title="openExam === exam.exam_number ? `模擬試験${exam.exam_number}を閉じる` : `模擬試験${exam.exam_number}を開く`"
              @click="toggleExam(exam.exam_number)"
            >
              <UIcon
                :name="openExam === exam.exam_number ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              />
              <span class="sr-only">
                {{ openExam === exam.exam_number ? `模擬試験${exam.exam_number}を閉じる` : `模擬試験${exam.exam_number}を開く` }}
              </span>
            </button>
          </div>

          <Transition name="questions">
            <nav
              v-if="openExam === exam.exam_number"
              :id="`exam-${exam.exam_number}-questions`"
              class="question-list"
              :aria-label="`模擬試験${exam.exam_number}の問題一覧`"
            >
              <GradeLink
                v-for="question in exam.question_numbers"
                :key="question"
                :to="examTarget(exam, question)"
                :class="{ active: !isExamLocked(exam) && isCurrentQuestion(exam.exam_number, question), favorite: !isExamLocked(exam) && isFavoriteAt(exam.exam_number, question) }"
                :aria-label="`問${question}${isExamLocked(exam) ? '（プレミアム会員向け）' : isFavoriteAt(exam.exam_number, question) ? '（お気に入り）' : ''}`"
                :title="!isExamLocked(exam) && isFavoriteAt(exam.exam_number, question) ? 'お気に入り' : undefined"
                @click="closeMobileList"
              >
                問{{ question }}
              </GradeLink>
            </nav>
          </Transition>
        </section>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.exam-sidebar {
  width: var(--sidebar-width, 260px);
  min-height: calc(100vh - var(--header-height));
  padding: 22px 16px;
  border-right: 1px solid #cdd9dc;
  background: #e3e9e9;
}

.sidebar-heading {
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 0 10px;
  color: #53676e;
  font-size: 13px;
  font-weight: 800;
}

.sidebar-heading-label { flex: 1; white-space: nowrap; }
.sidebar-heading-icon { flex: 0 0 20px; width: 20px; height: 20px; }
.desktop-sidebar-toggle {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid #c2ced1;
  border-radius: 5px;
  background: #fff;
  color: var(--teal-dark);
  font-size: 20px;
  cursor: pointer;
}
.desktop-sidebar-toggle:hover { background: #c4dddd; }
.desktop-sidebar-toggle:focus-visible { outline: 2px solid var(--teal-dark); outline-offset: 2px; }
.mobile-exam-toggle { display: none; }

.exam-group + .exam-group {
  margin-top: 10px;
}

.exam-row {
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 10px 10px 16px;
  border: 1px solid #c2ced1;
  border-radius: 6px;
  background: #fff;
}

.exam-link {
  align-self: stretch;
  flex: 1;
  display: flex;
  align-items: center;
  color: var(--ink);
  font-size: 15px;
  font-weight: 800;
  text-decoration: none;
}

.exam-link:hover {
  color: var(--teal-dark);
}

.exam-row.current {
  border-color: var(--teal);
}

.exam-row button {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: #e7f2f2;
  color: var(--teal-dark);
  font-size: 21px;
  cursor: pointer;
}

.exam-row button:hover {
  background: #d5ebeb;
}

.question-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
  padding: 10px 6px 4px;
}

.question-list a {
  min-height: 36px;
  border: 1px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  color: #40545b;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
}

.question-list a:hover,
.question-list a.active {
  background: #cce8e8;
  color: var(--teal-dark);
}

.question-list a.favorite { border-color: #d5b043; background: #fff3bf; color: #715310; }
.question-list a.favorite:hover { background: #ffe89a; }
.question-list a.active { box-shadow: inset 0 0 0 2px var(--teal-dark); }
.question-list a:focus-visible { outline: 2px solid var(--teal-dark); outline-offset: 2px; }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.questions-enter-active,
.questions-leave-active {
  transition: opacity 150ms ease, transform 180ms ease;
}

.questions-enter-from,
.questions-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (min-width: 761px) {
  .exam-sidebar {
    position: absolute;
    top: 100%;
    left: 0;
    height: calc(100vh - var(--header-height));
    overflow-y: auto;
  }
  .exam-sidebar.desktop-collapsed { padding: 22px 9px; }
  .desktop-collapsed .sidebar-heading { justify-content: center; padding: 0 0 10px; }
  .desktop-collapsed .sidebar-content { display: none; }
}

@media (max-width: 760px) {
  .exam-sidebar {
    position: relative;
    width: 100%;
    min-height: auto;
    padding: 0;
    border-right: 0;
    border-bottom: 1px solid #cdd9dc;
  }

  .sidebar-heading {
    display: none;
  }

  .mobile-exam-toggle {
    width: 100%;
    height: var(--exam-toggle-height);
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) 20px;
    align-items: center;
    gap: 9px;
    padding: 0 16px;
    border: 0;
    background: transparent;
    color: var(--teal-dark);
    font-size: 14px;
    font-weight: 800;
    text-align: left;
    cursor: pointer;
  }

  .mobile-exam-toggle:hover { background: #d8e5e5; }
  .mobile-exam-toggle > :first-child,
  .mobile-exam-toggle > :last-child { width: 20px; height: 20px; }

  .sidebar-content {
    --exam-row-height: 56px;
    --exam-grid-gap: 8px;
    display: none;
    position: absolute;
    inset: 100% 0 auto;
    max-height: min(calc(var(--exam-row-height) * 3 + var(--exam-grid-gap) * 2 + 25px), calc(100vh - var(--site-navigation-height) - 12px));
    max-height: min(calc(var(--exam-row-height) * 3 + var(--exam-grid-gap) * 2 + 25px), calc(100dvh - var(--site-navigation-height) - 12px));
    padding: 12px;
    overflow-y: auto;
    scrollbar-gutter: stable;
    overscroll-behavior-y: contain;
    border-bottom: 1px solid #cdd9dc;
    background: #e3e9e9;
    box-shadow: 0 10px 16px rgba(18, 42, 48, .12);
  }

  .mobile-open .sidebar-content { display: block; }

  .exam-groups {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: var(--exam-grid-gap);
  }

  .exam-group + .exam-group { margin-top: 0; }
  .exam-group { min-width: 0; }

  .exam-row {
    height: var(--exam-row-height);
    min-height: var(--exam-row-height);
    gap: 4px;
    padding: 5px 6px;
  }

  .exam-link { font-size: 13px; }

  .exam-row button {
    width: 44px;
    height: 44px;
    flex-basis: 44px;
  }

  /* Keep both exam controls in place while questions span the row. */
  .question-list {
    width: calc(200% + var(--exam-grid-gap));
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .exam-group:nth-child(even) .question-list {
    margin-left: calc(-100% - var(--exam-grid-gap));
  }
}
</style>
