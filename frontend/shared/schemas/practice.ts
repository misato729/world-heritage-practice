import { z } from 'zod'
import { EXAM_CONFIG, type ExamConfiguration } from '../examConfig.ts'

const majorCategoriesSchema = (config: ExamConfiguration) => {
  const allowed = config.categories.major.map(category => category.value)
  return z.array(z.string().refine(value => allowed.includes(value), '分野を正しく指定してください。'))
    .min(1, '出題範囲を1つ以上選択してください。').max(allowed.length)
    .refine(values => new Set(values).size === values.length, '同じ分野を重複して指定できません。')
}

export const createPracticeSelectionSchema = (config: ExamConfiguration = EXAM_CONFIG) => z.object({
  major_categories: majorCategoriesSchema(config),
  exam_numbers: z.array(z.number().int().min(1).max(config.exam.set_count))
    .min(1, '対象模試を1つ以上選択してください。'),
})

export const createExamCatalogQuerySchema = (config: ExamConfiguration = EXAM_CONFIG) => z.object({
  major_categories: z.string({ error: '分野を正しく指定してください。' })
    .transform(value => value.split(',')).pipe(majorCategoriesSchema(config)).optional(),
})
