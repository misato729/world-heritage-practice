import test from 'node:test'
import assert from 'node:assert/strict'
import {achievementStatus} from '../shared/achievement.ts'
import {filterReviewPositions} from '../app/utils/reviewPositions.ts'
import {MAX_REVIEW_POSITIONS} from '../app/utils/reviewPositions.ts'
test('map states distinguish unanswered and the latest two answers',()=>{assert.equal(achievementStatus([]),'unanswered');assert.equal(achievementStatus([true,true]),'mastered');assert.equal(achievementStatus([false,false]),'struggling')})
test('review preserves exact pairs across exams and rejects malformed input',()=>{const p=[{examNumber:1,questionNumber:3},{examNumber:1,questionNumber:4},{examNumber:2,questionNumber:3},{examNumber:2,questionNumber:4}];assert.deepEqual(filterReviewPositions(p,'1.3,2.4'),[p[0],p[3]]);assert.deepEqual(filterReviewPositions(p,'bad'),[])})
test('a complete 600-question selection survives routing while oversized input is rejected', () => {
  const positions = Array.from({ length: 10 }, (_, exam) => Array.from({ length: 60 }, (_, question) => ({ examNumber: exam + 1, questionNumber: question + 1 }))).flat()
  assert.deepEqual(filterReviewPositions(positions, positions.map(p => `${p.examNumber}.${p.questionNumber}`).join(',')), positions)
  assert.deepEqual(filterReviewPositions(positions, Array.from({ length: MAX_REVIEW_POSITIONS + 1 }, () => '1.1').join(',')), [])
})
