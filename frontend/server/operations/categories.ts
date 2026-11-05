import { transaction, query, type Database } from '../core/db.ts'
import { configuration } from '../core/config.ts'
import { parseExamConfig, type ExamConfiguration } from '../../shared/schemas/exam.ts'

const CATEGORY_LOCK = 71514346

/** Persist configured major categories without removing existing rows or touching questions. */
export async function syncMajorCategories(options: { db?: Database, config?: ExamConfiguration } = {}) {
  const categories = parseExamConfig(options.config ?? configuration).categories.major
  return transaction(async db => {
    await query('SELECT pg_advisory_xact_lock($1)::text', [CATEGORY_LOCK], db)
    const existing = new Map((await db.majorCategory.findMany()).map(row => [row.code, row]))
    let created_count = 0
    let updated_count = 0
    let unchanged_count = 0
    for (const [index, category] of categories.entries()) {
      const data = { label: category.label, display_order: index + 1 }
      const current = existing.get(category.value)
      if (!current) {
        await db.majorCategory.create({ data: { code: category.value, ...data } })
        created_count++
      } else if (current.label !== data.label || current.display_order !== data.display_order) {
        await db.majorCategory.update({ where: { code: category.value }, data })
        updated_count++
      } else unchanged_count++
    }
    return { status: 'ok' as const, created_count, updated_count, unchanged_count,
      configured_count: categories.length, total_count: await db.majorCategory.count() }
  }, options.db)
}
