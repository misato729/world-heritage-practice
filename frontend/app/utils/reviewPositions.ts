import type { PracticePosition } from './practiceSequence.ts'
// Bound URL work while allowing the complete 10 x 60 question catalogue.
export const MAX_REVIEW_POSITIONS = 1000
export const filterReviewPositions = (positions: PracticePosition[], value: unknown): PracticePosition[] => {
  if (value === undefined) return positions
  if (typeof value !== 'string') return []
  const keys = value.split(',')
  if (!keys.length || keys.length > MAX_REVIEW_POSITIONS || keys.some(key => !/^[1-9]\d{0,3}\.[1-9]\d{0,4}$/.test(key))) return []
  const wanted = new Set(keys)
  return positions.filter(p => wanted.has(`${p.examNumber}.${p.questionNumber}`))
}
