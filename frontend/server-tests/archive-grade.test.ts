import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EXAM_CONFIG } from '../shared/examConfig.ts'
import { gradeConfig } from '../shared/grades.ts'
import { gradeScope } from '../server/core/grade.ts'
import { createArchive, validateArchive, OperationError } from '../server/operations/content.ts'
import { createTestContent } from '../test-support/question-fixture.ts'
import { excerptFrom } from '../server/services/learning-validation.ts'

test('grade 1 archives accept all 90 questions and reject numbers beyond that grade', () => {
  const config = gradeConfig('1', EXAM_CONFIG)
  config.exam.set_count = 1
  const { questions } = createTestContent(config)
  gradeScope.run('1', () => {
    const archive = createArchive(questions)
    assert.equal(archive.question_count, 90)
    assert.equal(archive.choice_count, 360)
    assert.deepEqual(validateArchive(archive), archive)
    assert.throws(() => createArchive([{ ...questions[89]!, question_number: 91 }]), OperationError)
  })
  for (const grade of ['2', 'pre1'] as const) {
    gradeScope.run(grade, () => assert.throws(() => createArchive(questions), OperationError))
  }
})

test('question excerpts use the question after a shared passage and before its points', () => {
  assert.equal(excerptFrom([
    { type: 'rich_text', variant: 'passage', title: '共通リード', runs: [{ type: 'underline', text: '複数の問題に共通する本文' }] },
    { type: 'rich_text', runs: [{ type: 'text', text: '下線部について、' }, { type: 'underline', text: '正しいもの' }, { type: 'text', text: 'を選べ。' }] },
    { type: 'text', text: '配点：2点' },
  ]), '下線部について、正しいものを選べ。')
})
