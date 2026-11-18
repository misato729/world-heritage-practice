import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { configuration } from '../server/core/config.ts'
import { gradeScope } from '../server/core/grade.ts'
import { isolatedTransaction, closeDatabase, query, record, type Database } from '../server/core/db.ts'
import { createArchive, importArchive, setExamPublication, parseExamNumbers, IMPORT_CONFIRMATION, PUBLICATION_CONFIRMATION, OperationError } from '../server/operations/content.ts'
import { createTestContent } from '../test-support/question-fixture.ts'

const available = { skip: !Boolean(process.env.DATABASE_URL || process.env.PGHOST || process.env.TEST_DATABASE_URL) }
const questions = createTestContent(configuration).questions
const all = createArchive(questions)
const privateSecond = createArchive(questions.map(q => q.exam_number === 2 ? { ...q, publication_status: 'private' as const } : q))
const options = { confirmation: PUBLICATION_CONFIRMATION, exams: [2], status: 'private', beforeSha256: all.sha256, afterSha256: privateSecond.sha256,
  totalQuestionsBefore: all.question_count * 2, otherGradeQuestionCounts: { '1': 0, pre1: all.question_count } }
after(closeDatabase)

const rows = (db: Database) => db.question.findMany({ orderBy: { id: 'asc' }, include: { choices: { orderBy: { id: 'asc' } } } }).then(record)
async function isolated(action: (db: Database) => Promise<void>) {
  return isolatedTransaction(async db => {
    await db.user.deleteMany(); await db.question.deleteMany(); await db.payment.deleteMany()
    await db.stripeWebhookEvent.deleteMany(); await db.authVerification.deleteMany()
    await db.apiRateLimitBucket.deleteMany(); await db.rateLimiterFlexible.deleteMany()
    await importArchive(all, IMPORT_CONFIRMATION, db)
    await gradeScope.run('pre1', () => importArchive(all, IMPORT_CONFIRMATION, db))
    await action(db)
  })
}

test('exam numbers accept a bounded range or list only', () => {
  assert.deepEqual(parseExamNumbers('11-20'), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
  assert.deepEqual(parseExamNumbers('3,1'), [1, 3])
  for (const value of [undefined, '', '0', '20-11', '1,1', '1-21', '1-2-3', 'a', '1, 2', '1-99999999999', '0-5']) assert.throws(() => parseExamNumbers(value), OperationError)
})

test('publication change requires confirmation, status, both checksums and counts before DB access', async () => {
  const db = new Proxy({}, { get() { throw new Error('unexpected DB access') } }) as Database
  for (const override of [{ confirmation: undefined }, { status: 'hidden' }, { exams: [] }, { exams: [0] }, { beforeSha256: undefined },
    { afterSha256: 'wrong' }, { totalQuestionsBefore: undefined }, { otherGradeQuestionCounts: { '1': 0 } }]) {
    await assert.rejects(setExamPublication({ ...options, ...override }, db), OperationError)
  }
})

test('making a set private keeps content, IDs, other sets and grades, histories, favorites and subscriptions; repeat is unchanged', available, async () => isolated(async db => {
  const before = await rows(db), target = before.find(q => q.grade === '2' && q.exam_number === 2)!, now = new Date()
  const user = await db.user.create({ data: { name: 'Publication synthetic user', email: `publication-${randomUUID()}@example.invalid`, created_at: now, updated_at: now } })
  await db.answerHistory.create({ data: { user_id: user.id, question_id: target.id, selected_choice_id: target.choices[0]!.id, is_correct: false, created_at: now, updated_at: now } })
  await db.favorite.create({ data: { user_id: user.id, question_id: target.id, created_at: now, updated_at: now } })
  await db.subscription.create({ data: { user_id: user.id, status: 'active', paid_until: new Date(Date.now() + 86_400_000) } })
  const protectedBefore = [await db.user.findMany(), await db.answerHistory.findMany(), await db.favorite.findMany(), await db.subscription.findMany()]

  const result = await setExamPublication(options, db)
  assert.equal(result.status, 'updated'); assert.equal(result.changedQuestions, configuration.exam.questions_per_exam)
  assert.equal(result.targetQuestions, configuration.exam.questions_per_exam)
  const changed = await rows(db), byId = new Map(changed.map(q => [q.id, q]))
  for (const q of before) {
    const now = byId.get(q.id)!
    if (q.grade === '2' && q.exam_number === 2) {
      assert.equal(now.publication_status, 'private')
      assert.deepEqual({ ...now, publication_status: null, updated_at: null }, { ...q, publication_status: null, updated_at: null })
    } else assert.deepEqual(now, q)
  }
  assert.deepEqual([await db.user.findMany(), await db.answerHistory.findMany(), await db.favorite.findMany(), await db.subscription.findMany()], protectedBefore)
  assert.equal((await setExamPublication(options, db)).status, 'unchanged')
  assert.deepEqual(await rows(db), changed)

  assert.equal(await db.question.count({ where: { grade: '2', exam_number: 2, publication_status: 'published' } }), 0)
  assert.equal(await db.question.count({ where: { grade: 'pre1', exam_number: 2, publication_status: 'published' } }), configuration.exam.questions_per_exam)

  const republished = await setExamPublication({ ...options, status: 'published', beforeSha256: privateSecond.sha256, afterSha256: all.sha256 }, db)
  assert.equal(republished.status, 'updated')
  assert.deepEqual((await rows(db)).map(q => ({ ...q, updated_at: null })), before.map(q => ({ ...q, updated_at: null })))
}))

test('stale checksums, wrong counts and incomplete sets are refused; failures after writing roll back', available, async () => isolated(async db => {
  const before = await rows(db)
  await assert.rejects(setExamPublication({ ...options, beforeSha256: '0'.repeat(64) }, db), OperationError)
  await assert.rejects(setExamPublication({ ...options, totalQuestionsBefore: 1 }, db), OperationError)
  await assert.rejects(setExamPublication({ ...options, otherGradeQuestionCounts: { '1': 0, pre1: 1 } }, db), OperationError)
  await assert.rejects(setExamPublication({ ...options, exams: [3] }, db), OperationError)
  assert.deepEqual(await rows(db), before)
  await query('SAVEPOINT publication_failure', [], db)
  await assert.rejects(setExamPublication({ ...options, afterSha256: '0'.repeat(64) }, db), OperationError)
  await query('ROLLBACK TO SAVEPOINT publication_failure', [], db)
  assert.deepEqual(await rows(db), before)
}))
