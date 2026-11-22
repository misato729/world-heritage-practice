import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { configuration } from '../server/core/config.ts'
import { gradeScope } from '../server/core/grade.ts'
import { isolatedTransaction, closeDatabase, query, record, type Database } from '../server/core/db.ts'
import { createArchive, importArchive, replaceExamContent, IMPORT_CONFIRMATION, REPLACE_CONFIRMATION, OperationError } from '../server/operations/content.ts'
import { createTestContent } from '../test-support/question-fixture.ts'

const available = { skip: !Boolean(process.env.DATABASE_URL || process.env.PGHOST || process.env.TEST_DATABASE_URL) }
const questions = createTestContent(configuration).questions
const all = createArchive(questions)
// Exam 1 is rewritten except question 2, which is identical, and question 3, where only the explanation and source change.
const rewritten = questions.filter(q => q.exam_number === 1).map(q => q.question_number === 2 ? q : q.question_number === 3 ? {
  ...q, explanation_blocks: [{ type: 'text' as const, text: 'Synthetic rewritten explanation 3' }], source_text: 'Synthetic rewritten source | https://example.invalid/rewritten' } : {
  ...q, content_blocks: [{ type: 'text' as const, text: `Synthetic rewritten question ${q.question_number}` }],
  choices: q.choices.map((c, i) => ({ ...c, content_blocks: [{ type: 'text' as const, text: `Rewritten choice ${i + 1}` }], is_correct: i === 0 })) })
const replacement = createArchive(rewritten)
const final = createArchive([...rewritten, ...questions.filter(q => q.exam_number !== 1)])
const options = { confirmation: REPLACE_CONFIRMATION, beforeSha256: all.sha256, afterSha256: final.sha256, replacementSha256: replacement.sha256,
  totalQuestionsBefore: all.question_count * 2, otherGradeQuestionCounts: { '1': 0, pre1: all.question_count }, expectedHistoryResets: 1 }
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

test('replacement requires confirmation, three checksums, counts and the history-reset number before DB access', async () => {
  const db = new Proxy({}, { get() { throw new Error('unexpected DB access') } }) as Database
  for (const override of [{ confirmation: undefined }, { beforeSha256: undefined }, { afterSha256: 'x' }, { replacementSha256: '0'.repeat(64) },
    { totalQuestionsBefore: undefined }, { otherGradeQuestionCounts: { pre1: 0 } }, { expectedHistoryResets: undefined }, { expectedHistoryResets: -1 }]) {
    await assert.rejects(replaceExamContent(replacement, { ...options, ...override }, db), OperationError)
  }
  const partial = createArchive(rewritten.slice(0, 59))
  await assert.rejects(replaceExamContent(partial, { ...options, replacementSha256: partial.sha256 }, db), OperationError)
})

test('replacing a set keeps IDs and creation times, other sets/grades, favorites and contracts, and resets only histories of questions whose answered content changed', available, async () => isolated(async db => {
  const before = await rows(db), now = new Date()
  const changed = before.find(q => q.grade === '2' && q.exam_number === 1 && q.question_number === 1)!
  const kept = before.find(q => q.grade === '2' && q.exam_number === 1 && q.question_number === 2)!
  const explained = before.find(q => q.grade === '2' && q.exam_number === 1 && q.question_number === 3)!
  const other = before.find(q => q.grade === '2' && q.exam_number === 2 && q.question_number === 1)!
  const user = await db.user.create({ data: { name: 'Replace synthetic user', email: `replace-${randomUUID()}@example.invalid`, created_at: now, updated_at: now } })
  for (const q of [changed, kept, explained, other]) await db.answerHistory.create({ data: { user_id: user.id, question_id: q.id, selected_choice_id: q.choices[0]!.id, is_correct: false, created_at: now, updated_at: now } })
  await db.favorite.create({ data: { user_id: user.id, question_id: changed.id, created_at: now, updated_at: now } })
  await db.subscription.create({ data: { user_id: user.id, status: 'active', paid_until: new Date(Date.now() + 86_400_000) } })
  const keptHistories = await db.answerHistory.findMany({ where: { question_id: { in: [kept.id, explained.id, other.id] } }, orderBy: { id: 'asc' } })
  const favoritesBefore = await db.favorite.findMany(), subscriptionsBefore = await db.subscription.findMany()

  const result = await replaceExamContent(replacement, options, db)
  assert.equal(result.status, 'replaced'); assert.equal(result.replacedQuestions, configuration.exam.questions_per_exam); assert.equal(result.answerHistoriesReset, 1)
  assert.equal(result.contentChangedQuestions, configuration.exam.questions_per_exam - 1)
  const afterRows = await rows(db), byId = new Map(afterRows.map(q => [q.id, q]))
  for (const q of before) {
    const now = byId.get(q.id)!
    assert.equal(String(now.created_at), String(q.created_at))
    assert.deepEqual(now.choices.map(c => [c.id, c.choice_label, String(c.created_at)]), q.choices.map(c => [c.id, c.choice_label, String(c.created_at)]))
    if (!(q.grade === '2' && q.exam_number === 1)) assert.deepEqual(now, q)
  }
  assert.equal((byId.get(changed.id)!.content_blocks as { text: string }[])[0]!.text, 'Synthetic rewritten question 1')
  // The explanation-only question is content-changed (counted above) and stored, but its history is kept.
  assert.equal((byId.get(explained.id)!.explanation_blocks as { text: string }[])[0]!.text, 'Synthetic rewritten explanation 3')
  assert.deepEqual(byId.get(explained.id)!.content_blocks, explained.content_blocks); assert.deepEqual(byId.get(explained.id)!.choices, explained.choices)
  assert.deepEqual(await db.answerHistory.findMany({ orderBy: { id: 'asc' } }), keptHistories)
  assert.deepEqual(await db.favorite.findMany(), favoritesBefore); assert.deepEqual(await db.subscription.findMany(), subscriptionsBefore)
  const repeat = await replaceExamContent(replacement, options, db)
  assert.equal(repeat.status, 'unchanged'); assert.equal(repeat.answerHistoriesReset, 0)
  assert.deepEqual(await rows(db), afterRows)
}))

test('a wrong history-reset number, stale checksum or wrong counts roll back without writes', available, async () => isolated(async db => {
  const now = new Date(), q = (await rows(db)).find(x => x.grade === '2' && x.exam_number === 1 && x.question_number === 1)!
  const user = await db.user.create({ data: { name: 'Replace synthetic user', email: `replace-${randomUUID()}@example.invalid`, created_at: now, updated_at: now } })
  await db.answerHistory.create({ data: { user_id: user.id, question_id: q.id, selected_choice_id: q.choices[0]!.id, is_correct: true, created_at: now, updated_at: now } })
  const before = await rows(db), histories = await db.answerHistory.findMany()
  for (const override of [{ expectedHistoryResets: 0 }, { expectedHistoryResets: 2 }, { afterSha256: '0'.repeat(64) }, { beforeSha256: '1'.repeat(64) }, { totalQuestionsBefore: 1 }]) {
    await query('SAVEPOINT replace_failure', [], db)
    await assert.rejects(replaceExamContent(replacement, { ...options, ...override }, db), OperationError)
    await query('ROLLBACK TO SAVEPOINT replace_failure', [], db)
    assert.deepEqual(await rows(db), before); assert.deepEqual(await db.answerHistory.findMany(), histories)
  }
}))

test('a repeat with a different replacement, a missing exam, and status-only changes are handled safely', available, async () => isolated(async db => {
  await replaceExamContent(replacement, { ...options, expectedHistoryResets: 0 }, db)
  const other = createArchive(rewritten.map(q => ({ ...q, source_text: 'Synthetic other source | https://example.invalid/other' })))
  await assert.rejects(replaceExamContent(other, { ...options, beforeSha256: final.sha256, replacementSha256: other.sha256 }, db), OperationError)
  const missing = createArchive(questions.filter(q => q.exam_number === 1).map(q => ({ ...q, exam_number: 3 })))
  await assert.rejects(replaceExamContent(missing, { ...options, beforeSha256: final.sha256, afterSha256: '0'.repeat(64), replacementSha256: missing.sha256 }, db), OperationError)
  // Exam 2 keeps its content and only becomes private: histories stay.
  const now = new Date(), q = (await rows(db)).find(x => x.grade === '2' && x.exam_number === 2 && x.question_number === 1)!
  const user = await db.user.create({ data: { name: 'Replace synthetic user', email: `replace-${randomUUID()}@example.invalid`, created_at: now, updated_at: now } })
  await db.answerHistory.create({ data: { user_id: user.id, question_id: q.id, selected_choice_id: q.choices[0]!.id, is_correct: true, created_at: now, updated_at: now } })
  const statusOnly = createArchive(questions.filter(x => x.exam_number === 2).map(x => ({ ...x, publication_status: 'private' as const })))
  const afterStatus = createArchive([...rewritten, ...statusOnly.questions])
  const result = await replaceExamContent(statusOnly, { ...options, beforeSha256: final.sha256, afterSha256: afterStatus.sha256, replacementSha256: statusOnly.sha256, expectedHistoryResets: 0 }, db)
  assert.equal(result.status, 'replaced'); assert.equal(result.contentChangedQuestions, 0); assert.equal(result.answerHistoriesReset, 0)
  assert.equal(await db.answerHistory.count({ where: { question_id: q.id } }), 1)
}))
