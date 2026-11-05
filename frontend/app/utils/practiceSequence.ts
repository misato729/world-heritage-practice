export type PracticeOrder = 'sequential' | 'random'

export type PracticePosition = {
  examNumber: number
  questionNumber: number
}

export const createPracticeSequence = (
  examNumbers: readonly number[],
  questionNumbers: readonly number[],
): PracticePosition[] => (
  examNumbers.flatMap(examNumber => (
    questionNumbers.map(questionNumber => ({ examNumber, questionNumber }))
  ))
)

export const createPracticeSeed = () => Math.floor(Math.random() * 0x100000000)

export const shufflePracticeSequence = (
  positions: readonly PracticePosition[],
  seed: number,
): PracticePosition[] => {
  const shuffled = [...positions]
  let state = seed >>> 0
  const random = () => {
    state = (state + 0x6D2B79F5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000
  }

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[randomIndex]!
    shuffled[randomIndex] = current!
  }

  return shuffled
}

const mixPracticePosition = (value: number) => {
  let mixed = value >>> 0
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21F0AAAD)
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735A2D97)
  return (mixed ^ (mixed >>> 15)) >>> 0
}

const stablePracticePositionRank = (
  position: PracticePosition,
  seed: number,
) => {
  const examRank = Math.imul(position.examNumber >>> 0, 0x9E3779B1)
  const questionRank = Math.imul(position.questionNumber >>> 0, 0x85EBCA77)
  return mixPracticePosition((seed >>> 0) ^ examRank ^ questionRank)
}

/**
 * Gives every exact problem position a seed-dependent rank before sorting.
 * Unlike Fisher-Yates, filtering the input does not change the relative order
 * of the positions that remain.
 */
export const stableRandomizePracticeSequence = (
  positions: readonly PracticePosition[],
  seed: number,
): PracticePosition[] => (
  [...positions].sort((left, right) => {
    const rankDifference = (
      stablePracticePositionRank(left, seed)
      - stablePracticePositionRank(right, seed)
    )
    if (rankDifference !== 0) return rankDifference

    return (
      left.examNumber - right.examNumber
      || left.questionNumber - right.questionNumber
    )
  })
)
