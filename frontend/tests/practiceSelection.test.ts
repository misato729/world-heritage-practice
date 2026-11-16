import assert from 'node:assert/strict'
import test from 'node:test'
import { EXAM_CONFIG } from '../shared/examConfig.ts'
import { createExamCatalogQuerySchema, createPracticeSelectionSchema } from '../shared/schemas/practice.ts'

test('practice selection accepts multiple configured fields and requires a field and an exam', () => {
  const schema = createPracticeSelectionSchema()
  const selection = { major_categories: ['fundamentals', 'japan'], exam_numbers: [1, 3] }
  assert.deepEqual(schema.parse(selection), selection)
  for (const changes of [
    { major_categories: [] }, { major_categories: ['unknown'] },
    { major_categories: ['japan', 'japan'] }, { exam_numbers: [] },
    { exam_numbers: [0] }, { exam_numbers: [EXAM_CONFIG.exam.set_count + 1] },
  ]) assert.equal(schema.safeParse({ ...selection, ...changes }).success, false)
})

test('catalog category queries use the same allowed fields and reject malformed selections', () => {
  const schema = createExamCatalogQuerySchema()
  assert.deepEqual(schema.parse({}), {})
  assert.deepEqual(schema.parse({ major_categories: 'fundamentals,japan' }), { major_categories: ['fundamentals', 'japan'] })
  for (const value of ['', 'japan,', 'unknown', 'japan,japan', ['japan', 'other']]) {
    assert.equal(schema.safeParse({ major_categories: value }).success, false)
  }
})
