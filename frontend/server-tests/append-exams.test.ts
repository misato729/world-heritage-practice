import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { configuration } from '../server/core/config.ts'
import { gradeScope } from '../server/core/grade.ts'
import { isolatedTransaction, closeDatabase, query, record, type Database } from '../server/core/db.ts'
import { appendArchive, createArchive, importArchive, APPEND_CONFIRMATION, IMPORT_CONFIRMATION, OperationError } from '../server/operations/content.ts'
import { createTestContent } from '../test-support/question-fixture.ts'

const available = { skip: !Boolean(process.env.DATABASE_URL || process.env.PGHOST || process.env.TEST_DATABASE_URL) }
const questions = createTestContent(configuration).questions
const first = createArchive(questions.filter(q => q.exam_number === 1))
const second = createArchive(questions.filter(q => q.exam_number === 2))
const final = createArchive(questions)
const options = { confirmation: APPEND_CONFIRMATION, beforeSha256: first.sha256, afterSha256: final.sha256, addedSha256: second.sha256,
  totalQuestionsBefore: first.question_count, otherGradeQuestionCounts: { '1': 0, pre1: 0 } }
after(closeDatabase)

const rows = (db: Database) => db.question.findMany({ orderBy: { id: 'asc' }, include: { choices: { orderBy: { id: 'asc' } } } }).then(record)
async function isolated(action: (db: Database) => Promise<void>) {
  return isolatedTransaction(async db => {
    await db.user.deleteMany(); await db.question.deleteMany(); await db.payment.deleteMany()
    await db.stripeWebhookEvent.deleteMany(); await db.authVerification.deleteMany()
    await db.apiRateLimitBucket.deleteMany(); await db.rateLimiterFlexible.deleteMany()
    await importArchive(first, IMPORT_CONFIRMATION, db)
    await action(db)
  })
}

test('append requires explicit confirmation and all three verified checksums before DB access', async () => {
  const db = new Proxy({}, { get() { throw new Error('unexpected DB access') } }) as Database
  for (const override of [{ confirmation: undefined }, { beforeSha256: undefined }, { afterSha256: 'wrong' }, { addedSha256: '0'.repeat(64) }, { totalQuestionsBefore: undefined }, { otherGradeQuestionCounts: undefined }]) {
    await assert.rejects(appendArchive(second, { ...options, ...override }, db), OperationError)
  }
  const altered = structuredClone(second); altered.questions[0]!.content_blocks = [{ type: 'text', text: 'Synthetic altered payload' }]
  await assert.rejects(appendArchive(altered, options, db), OperationError)
})

test('append preserves other grades, original IDs/times, member history, favorites and subscription; repeat is unchanged', available, async () => isolated(async db => {
  await gradeScope.run('pre1', () => importArchive(first, IMPORT_CONFIRMATION, db))
  const bothGradeOptions = { ...options, totalQuestionsBefore: first.question_count * 2,
    otherGradeQuestionCounts: { '1': 0, pre1: first.question_count } }
  const before = await rows(db), question = before.find(q => q.grade === '2')!, now = new Date()
  const user = await db.user.create({ data: { name: 'Append synthetic user', email: `append-${randomUUID()}@example.invalid`, created_at: now, updated_at: now } })
  await db.answerHistory.create({ data: { user_id: user.id, question_id: question.id, selected_choice_id: question.choices[0]!.id, is_correct: false, created_at: now, updated_at: now } })
  await db.favorite.create({ data: { user_id: user.id, question_id: question.id, created_at: now, updated_at: now } })
  await db.subscription.create({ data: { user_id: user.id, status: 'active', paid_until: new Date(Date.now() + 86_400_000) } })
  const protectedBefore = [await db.user.findMany(), await db.answerHistory.findMany(), await db.favorite.findMany(), await db.subscription.findMany()]
  const result = await appendArchive(second, bothGradeOptions, db)
  assert.equal(result.status, 'appended'); assert.equal(result.addedQuestions, second.question_count)
  assert.equal(result.totalQuestions, first.question_count * 2 + second.question_count)
  const after = await rows(db), oldIds = new Set(before.map(q => q.id))
  assert.deepEqual(after.filter(q => oldIds.has(q.id)), before)
  assert.deepEqual([await db.user.findMany(), await db.answerHistory.findMany(), await db.favorite.findMany(), await db.subscription.findMany()], protectedBefore)
  assert.equal((await appendArchive(second, bothGradeOptions, db)).status, 'unchanged')
  assert.deepEqual(await rows(db), after)
}))

test('append refuses an already occupied or partially occupied exam without overwriting it', available, async () => isolated(async db => {
  const before = await rows(db)
  await assert.rejects(appendArchive(first, { ...options, addedSha256: first.sha256 }, db), OperationError)
  const partial = structuredClone(second.questions[0]!); partial.publication_status = 'draft'
  const { saveQuestion } = await import('../server/services/learning-writer.ts')
  await saveQuestion(partial, { db, requireCompleteExam: false })
  const occupied = await rows(db)
  await assert.rejects(appendArchive(second, options, db), OperationError)
  assert.deepEqual(await rows(db), occupied)
  assert.deepEqual(occupied.filter(q => before.some(b => b.id === q.id)), before)
}))

test('incomplete sets and incorrect final checksums fail after writing and roll back in the caller transaction', available, async () => isolated(async db => {
  const before = await rows(db)
  for (const [archive, override] of [[createArchive(second.questions.slice(0, 1)), {}], [second, { afterSha256: '0'.repeat(64) }]] as const) {
    await query('SAVEPOINT append_failure', [], db)
    await assert.rejects(appendArchive(archive, { ...options, ...override, addedSha256: archive.sha256 }, db))
    await query('ROLLBACK TO SAVEPOINT append_failure', [], db)
    assert.deepEqual(await rows(db), before)
  }
}))
