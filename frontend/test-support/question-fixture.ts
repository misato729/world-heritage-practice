import type { ExamConfiguration } from '../shared/schemas/exam.ts'
import type { QuestionInput } from '../shared/schemas/content.ts'

/** Synthetic software-test data only; never used by development seed or published content. */
export function createTestQuestion(config: ExamConfiguration, examNumber = 1, questionNumber = 1): QuestionInput {
  const category = config.categories.minor[(questionNumber - 1) % config.categories.minor.length]!
  return {
    exam_number: examNumber,
    question_number: questionNumber,
    major_category_code: category.major_category_value,
    category_code: category.value,
    publication_status: 'published',
    content_blocks: [{ type: 'text', text: `Synthetic test fixture ${examNumber}.${questionNumber}` }],
    explanation_blocks: [{ type: 'text', text: 'Synthetic explanation for software testing only.' }],
    source_text: 'Synthetic software-test fixture | https://example.invalid/software-test-fixture',
    choices: config.exam.choice_labels.map((choice_label, index) => ({
      choice_label,
      content_blocks: [{ type: 'text', text: `Synthetic choice ${index + 1}` }],
      is_correct: index === questionNumber % config.exam.choice_labels.length,
      display_order: index + 1,
    })),
  }
}

/** Complete sets keep the same import/publication guarantees as application data. */
export function createTestContent(config: ExamConfiguration) {
  return {
    schema_version: 1 as const,
    questions: Array.from({ length: Math.min(2, config.exam.set_count) }, (_, index) =>
      Array.from({ length: config.exam.questions_per_exam }, (_, questionIndex) =>
        createTestQuestion(config, index + 1, questionIndex + 1))).flat(),
  }
}
