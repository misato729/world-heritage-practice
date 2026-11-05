import { readFileSync } from 'node:fs'
import { parseExamConfig } from '../shared/schemas/exam.ts'
import { contentDocumentSchema, parseQuestionArchiveEntries } from '../shared/schemas/content.ts'
import { createTestContent } from '../test-support/question-fixture.ts'

/** Synthetic browser data uses the same validation as runtime, without reading publishable content. */
export function loadE2EFixture() {
  let config
  let questions
  try {
    config = parseExamConfig(JSON.parse(readFileSync(new URL('../../config/exam.json', import.meta.url), 'utf8')))
    const document = contentDocumentSchema.parse(createTestContent(config))
    questions = parseQuestionArchiveEntries(document.questions, config)
  } catch { throw new Error('E2E fixture validation failed. Check the shared configuration and synthetic test fixture.') }
  const question = questions.find(item => item.publication_status === 'published' && (!config.payments.enabled || item.exam_number <= config.payments.free_exam_count))
  if (!question) throw new Error('Core browser journeys require a free synthetic question in the isolated test fixture.')
  return { config, question, questions }
}
