export type AchievementStatus = 'mastered' | 'correct' | 'incorrect' | 'struggling' | 'unanswered' | 'reference'
export type AchievementQuestion = {
  id: number
  exam_number: number
  question_number: number
  group_number: number | null
  group_question_number: number | null
  answer_type: string
  recent_results: (boolean | null)[]
  status: AchievementStatus
}
export type AchievementReport = {
  exams: { exam_number: number; title: string; questions: AchievementQuestion[] }[]
  total_count: number
  answered_count: number
  full_access: boolean
}
