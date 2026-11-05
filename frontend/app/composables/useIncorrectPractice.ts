import { type PracticePosition } from '../utils/practiceSequence.ts'

export const useIncorrectPractice = () => {
  const route = useRoute()
  const auth = useAuth()
  const review = useIncorrectReview()
  const enabled = computed(() => route.query.review === 'incorrect' && route.query.answer_history_id === undefined)
  const sequence = ref<PracticePosition[]>([])
  const ready = ref(false)
  const error = ref('')
  let active = false
  let generation = 0
  const seed = computed(() => {
    const value = route.query.seed
    if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
    const number = Number(value)
    return Number.isSafeInteger(number) && number >= 0 && number <= 0xFFFFFFFF ? number : null
  })
  const query = computed(() => ({ review: 'incorrect', order: 'random', seed: String(seed.value) }))
  const prepare = async () => {
    const version = ++generation
    ready.value = false
    sequence.value = []
    error.value = ''
    if (!active || !enabled.value) return
    if (!auth.isLoggedIn.value) { error.value = '復習するにはログインしてください。'; return }
    if (seed.value === null) { error.value = '復習の指定が正しくありません。トップページから開始し直してください。'; return }
    try {
      const currentUser = await auth.ensureCurrentUser()
      if (!active || version !== generation) return
      if (!currentUser) { error.value = 'ログイン状態を確認できませんでした。再読み込みしてください。'; return }
      const owner = review.sessionKey.value
      const positions = await review.prepareRound(seed.value)
      if (!active || version !== generation || owner !== review.sessionKey.value) return
      if (positions === null) { error.value = review.error.value || '復習する問題を読み込めませんでした。'; return }
      sequence.value = positions
      const currentExists = positions.some(p => p.examNumber === Number(route.params.examNumber) && p.questionNumber === Number(route.params.questionNumber))
      if (positions.length && !currentExists) {
        const first = positions[0]!
        await navigateTo({ path: `/practice/${first.examNumber}/${first.questionNumber}`, query: query.value }, { replace: true })
      }
      if (active && version === generation) ready.value = true
    } catch { if (active && version === generation) error.value = '復習する問題を読み込めませんでした。もう一度お試しください。' }
  }
  onMounted(() => { active = true; void prepare() })
  watch([enabled, seed, review.sessionKey], () => { if (active) void prepare() }, { flush: 'sync' })
  onScopeDispose(() => { active = false; generation++ })
  return { enabled, sequence, ready, error, query, prepare }
}
