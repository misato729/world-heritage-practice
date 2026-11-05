import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { configuration } from '../server/core/config.ts'
import { isolatedTransaction, query, closeDatabase } from '../server/core/db.ts'
import { syncMajorCategories } from '../server/operations/categories.ts'

process.env.APP_ENV = 'test'
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const integration = { skip: !Boolean(process.env.DATABASE_URL || process.env.PGHOST) }
after(closeDatabase)

test('configured major categories persist in order and repeated sync does not touch rows or questions', integration, () => isolatedTransaction(async db => {
  await db.majorCategory.deleteMany()
  const questions = await db.question.count()
  const choices = await db.questionChoice.count()
  const expected = configuration.categories.major.map((category, index) => ({ code: category.value, label: category.label, display_order: index + 1 }))
  const first = await syncMajorCategories({ db })
  assert.equal(first.created_count, expected.length)
  const before = await db.majorCategory.findMany({ orderBy: { display_order: 'asc' } })
  assert.deepEqual(before.map(({ code, label, display_order }) => ({ code, label, display_order })), expected)
  assert.deepEqual(await syncMajorCategories({ db }), { status: 'ok', created_count: 0, updated_count: 0,
    unchanged_count: expected.length, configured_count: expected.length, total_count: expected.length })
  assert.deepEqual(await db.majorCategory.findMany({ orderBy: { display_order: 'asc' } }), before)
  assert.equal(await db.question.count(), questions)
  assert.equal(await db.questionChoice.count(), choices)
}))

test('sync updates configured labels and order while preserving existing rows outside configuration', integration, () => isolatedTransaction(async db => {
  await db.majorCategory.deleteMany()
  await syncMajorCategories({ db })
  const before = await db.majorCategory.findMany()
  const preserved = await db.majorCategory.create({ data: { code: 'legacy', label: '既存の分類', display_order: 99 } })
  const config = structuredClone(configuration)
  config.categories.major.reverse()
  config.categories.major[0]!.label = '変更後の分類'
  const report = await syncMajorCategories({ db, config })
  assert.equal(report.created_count, 0)
  assert.equal(report.total_count, before.length + 1)
  assert.deepEqual(await db.majorCategory.findUnique({ where: { code: 'legacy' } }), preserved)
  for (const [index, category] of config.categories.major.entries()) {
    const row = await db.majorCategory.findUniqueOrThrow({ where: { code: category.value } })
    assert.equal(row.label, category.label)
    assert.equal(row.display_order, index + 1)
    assert.deepEqual(row.created_at, before.find(old => old.code === row.code)!.created_at)
  }
}))

test('caller rollback removes every category written before a database failure', integration, () => isolatedTransaction(async db => {
  await db.majorCategory.deleteMany()
  await query("CREATE FUNCTION pg_temp.reject_second_category() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.code='japan' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$", [], db)
  await query('CREATE TRIGGER synthetic_category_failure BEFORE INSERT ON major_categories FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_second_category()', [], db)
  await query('SAVEPOINT category_sync_failure', [], db)
  await assert.rejects(syncMajorCategories({ db }))
  await query('ROLLBACK TO SAVEPOINT category_sync_failure', [], db)
  assert.equal(await db.majorCategory.count(), 0)
}))

test('database constraints reject malformed codes, blank labels and nonpositive display order', integration, () => isolatedTransaction(async db => {
  await db.majorCategory.deleteMany()
  for (const data of [
    { code: 'Invalid-Code', label: '検証用', display_order: 1 },
    { code: 'blank', label: '   ', display_order: 1 },
    { code: 'zero_order', label: '検証用', display_order: 0 },
  ]) {
    await query('SAVEPOINT category_constraint', [], db)
    await assert.rejects(db.majorCategory.create({ data }))
    await query('ROLLBACK TO SAVEPOINT category_constraint', [], db)
  }
  assert.equal(await db.majorCategory.count(), 0)
}))
