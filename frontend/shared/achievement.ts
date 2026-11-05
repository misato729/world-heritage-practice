import type { AchievementStatus } from './types/achievement.ts'

// Results are newest first. A nullable reference grade is never a wrong answer.
export function achievementStatus(results: readonly (boolean | null)[]): AchievementStatus {
  if (!results.length) return 'unanswered'
  if (results[0] === null) return 'reference'
  if (results[0] === true) return results[1] === true ? 'mastered' : 'correct'
  return results[1] === false ? 'struggling' : 'incorrect'
}

export const achievementLabels: Record<AchievementStatus, string> = {
  mastered: '安定して正解', correct: '前回は正解',
  incorrect: '前回は不正解', struggling: '重点的に復習',
  unanswered: '未回答', reference: '論述の記録',
}
