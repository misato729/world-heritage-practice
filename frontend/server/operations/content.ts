import { currentGrade } from '../core/grade.ts'
import { gradeConfig } from '../../shared/grades.ts'
import { createHash } from 'node:crypto'
import { lstat, readFile, mkdtemp, writeFile, link, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { query, transaction, getDatabase, record, type Database } from '../core/db.ts'
import { environment, configuration } from '../core/config.ts'
import { ContentValidationError, contentDocumentSchema, parseQuestionArchiveEntries, type QuestionInput } from '../../shared/schemas/content.ts'
import { saveQuestion, setExamsPublication, validateCompleteExam } from '../services/learning-writer.ts'

export class OperationError extends Error {}
export const ARCHIVE_FORMAT = 'exam-practice-question-archive'
export const IMPORT_CONFIRMATION = 'IMPORT_INTO_EMPTY_DATABASE'
export const APPEND_CONFIRMATION = 'APPEND_NEW_COMPLETE_EXAMS'
export const MAX_CONTENT_BYTES = 64 * 1024 * 1024
export const QUESTION_LOCK = 71514345
export const defaultContentPath = fileURLToPath(new URL('../../../content/questions.json', import.meta.url))
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]))
  return value
}
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const object = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const exactKeys = (value: unknown, keys: string[]): value is Record<string, any> => object(value) && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')

export function validateQuestions(value: unknown): QuestionInput[] {
  try { return parseQuestionArchiveEntries(value, gradeConfig(currentGrade(), configuration)) }
  catch (error) {
    if (error instanceof ContentValidationError) throw new OperationError(error.message)
    throw error
  }
}

export type ArchiveDocument = {
  format: string, version: number, question_count: number, choice_count: number,
  sha256: string, questions: QuestionInput[]
}
export function createArchive(questions: unknown): ArchiveDocument {
  const validated = validateQuestions(questions)
  const body = { format: ARCHIVE_FORMAT, version: 1, question_count: validated.length,
    choice_count: validated.reduce((count, question) => count + question.choices.length, 0), questions: validated }
  return { ...body, sha256: digest(body) }
}
export function validateArchive(value: unknown): ArchiveDocument {
  if (!exactKeys(value, ['format', 'version', 'question_count', 'choice_count', 'sha256', 'questions']) || value.format !== ARCHIVE_FORMAT || value.version !== 1) throw new OperationError('未対応のアーカイブ形式です')
  const archive = createArchive(value.questions)
  if (!Number.isSafeInteger(value.question_count) || !Number.isSafeInteger(value.choice_count) || value.question_count !== archive.question_count || value.choice_count !== archive.choice_count || typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sha256) || value.sha256 !== archive.sha256) throw new OperationError('アーカイブの件数又は照合値が一致しません')
  return archive
}
const summary = (archive: ArchiveDocument) => ({ format: archive.format, version: archive.version, question_count: archive.question_count, choice_count: archive.choice_count, sha256: archive.sha256 })

async function readJson(path: string): Promise<unknown> {
  try {
    if (!path || path.includes('\0') || !(await lstat(path)).isFile()) throw new OperationError('取込元には通常のJSONファイルを指定してください')
    if ((await lstat(path)).size > MAX_CONTENT_BYTES) throw new OperationError('問題データのサイズ上限を超えています')
    const bytes = await readFile(path)
    if (bytes.length > MAX_CONTENT_BYTES) throw new OperationError('問題データのサイズ上限を超えています')
    return JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    if (error instanceof OperationError) throw error
    throw new OperationError('問題データを読み取れません。配置とJSON形式を確認してください')
  }
}

export async function importArchive(document: unknown, confirmation: string | undefined, db?: Database) {
  if (confirmation !== IMPORT_CONFIRMATION) throw new OperationError('空のDBへ取り込む明示的な確認が必要です')
  const archive = validateArchive(document)
  return transaction(async connection => {
    await query('SELECT pg_advisory_xact_lock($1)::text', [QUESTION_LOCK], connection)
    await query('LOCK TABLE questions, question_choices IN SHARE ROW EXCLUSIVE MODE', [], connection)
    const total = await connection.question.count({where:{grade:currentGrade()}}) + await connection.questionChoice.count({where:{question:{grade:currentGrade()}}})
    if (total !== 0) throw new OperationError('問題と選択肢が両方空のDBだけに取り込めます。既存データは上書きしません')
    for (const question of archive.questions) await saveQuestion(question, { db: connection, requireCompleteExam: false })
    const publishedSets = new Set(archive.questions.filter(question => question.publication_status === 'published').map(question => question.exam_number))
    for (const exam of publishedSets) await validateCompleteExam(exam, connection)
    return summary(archive)
  }, db)
}
export async function importContent(path = defaultContentPath, confirmation?: string, db?: Database) {
  if (currentGrade() !== '2' && path === defaultContentPath) throw new OperationError('2級以外はその級のINPUTを明示してください')
  const result = contentDocumentSchema.safeParse(await readJson(path))
  if (!result.success) throw new OperationError('問題データはschema_version: 1とquestions配列で指定してください')
  return importArchive(createArchive(result.data.questions), confirmation, db)
}
export async function importArchiveFile(path: string, confirmation?: string, db?: Database) {
  return importArchive(await readJson(path), confirmation, db)
}

const storedQuestions = (db: Database) => db.question.findMany({
  orderBy: [{ grade: 'asc' }, { exam_number: 'asc' }, { question_number: 'asc' }],
  include: { choices: { orderBy: { display_order: 'asc' } } },
}).then(record)
type StoredQuestion = Awaited<ReturnType<typeof storedQuestions>>[number]
function archiveQuestion(question: StoredQuestion): QuestionInput {
  return {
    exam_number: question.exam_number, question_number: question.question_number,
    major_category_code: question.major_category_code, category_code: question.category_code,
    content_blocks: question.content_blocks as QuestionInput['content_blocks'],
    explanation_blocks: question.explanation_blocks as QuestionInput['explanation_blocks'],
    source_text: question.source_text, publication_status: question.publication_status as QuestionInput['publication_status'],
    choices: question.choices.map(choice => ({ choice_label: choice.choice_label,
      content_blocks: choice.content_blocks as QuestionInput['choices'][number]['content_blocks'],
      is_correct: choice.is_correct, display_order: choice.display_order })),
  }
}
// Preserve dates and safe numeric IDs when fingerprinting stored rows. Values
// remain in the CLI process; results contain only counts and equality flags.
const storedDigest = (value: unknown) => digest(JSON.parse(JSON.stringify(value)))
async function protectedState(db: Database) {
  const rows = await Promise.all([
    db.majorCategory.findMany({ orderBy: { code: 'asc' } }),
    db.user.findMany({ orderBy: { id: 'asc' } }),
    db.answerHistory.findMany({ orderBy: { id: 'asc' } }),
    db.favorite.findMany({ orderBy: { id: 'asc' } }),
    db.payment.findMany({ orderBy: { id: 'asc' } }),
    db.membership.findMany({ orderBy: { id: 'asc' } }),
    db.stripeWebhookEvent.findMany({ orderBy: { id: 'asc' } }),
    db.verificationAccessGrant.findMany({ orderBy: { id: 'asc' } }),
    db.authSession.findMany({ orderBy: { id: 'asc' } }),
    db.authAccount.findMany({ orderBy: { id: 'asc' } }),
    db.authVerification.findMany({ orderBy: { id: 'asc' } }),
    db.subscription.findMany({ orderBy: { id: 'asc' } }),
    db.apiRateLimitBucket.findMany({ orderBy: { key: 'asc' } }),
  ])
  return storedDigest(record(rows))
}
type AppendOptions = { confirmation?: string, beforeSha256?: string, afterSha256?: string, addedSha256?: string,
  totalQuestionsBefore?: number, otherGradeQuestionCounts?: Record<string, number> }
/** Add only wholly new, complete published sets; never update existing rows. */
export async function appendArchive(document: unknown, options: AppendOptions, existing?: Database) {
  if (options.confirmation !== APPEND_CONFIRMATION) throw new OperationError('新規の模試だけを追加する明示的な確認が必要です')
  for (const hash of [options.beforeSha256, options.afterSha256, options.addedSha256]) {
    if (!hash || !/^[0-9a-f]{64}$/.test(hash)) throw new OperationError('追加前・追加後・追加教材の照合値を指定してください')
  }
  const otherGrades = configuration.grades.map(g => g.code).filter(grade => grade !== currentGrade()).sort()
  if (!Number.isSafeInteger(options.totalQuestionsBefore) || options.totalQuestionsBefore! < 0 ||
      !object(options.otherGradeQuestionCounts) || Object.keys(options.otherGradeQuestionCounts).sort().join(',') !== otherGrades.join(',') ||
      Object.values(options.otherGradeQuestionCounts).some(count => !Number.isSafeInteger(count) || count < 0)) {
    throw new OperationError('追加前の全体件数と他級の件数を指定してください')
  }
  const archive = validateArchive(document)
  if (archive.sha256 !== options.addedSha256 || archive.question_count === 0 || archive.questions.some(q => q.publication_status !== 'published')) {
    throw new OperationError('追加教材の照合値又は公開状態が一致しません')
  }
  const exams = [...new Set(archive.questions.map(q => q.exam_number))].sort((a, b) => a - b)
  const run = async (db: Database) => {
    await query('SELECT pg_advisory_xact_lock($1)::text', [QUESTION_LOCK], db)
    await query('LOCK TABLE questions, question_choices IN SHARE ROW EXCLUSIVE MODE', [], db)
    const before = await storedQuestions(db), protectedBefore = await protectedState(db)
    const scoped = before.filter(q => q.grade === currentGrade())
    const current = createArchive(scoped.map(archiveQuestion))
    const repeated = current.sha256 === options.afterSha256
    if (before.length !== options.totalQuestionsBefore! + (repeated ? archive.question_count : 0) ||
        otherGrades.some(grade => before.filter(q => q.grade === grade).length !== options.otherGradeQuestionCounts![grade])) {
      throw new OperationError('追加前の全体件数又は他級の件数が一致しません')
    }
    const prior = scoped.filter(q => !exams.includes(q.exam_number))
    if (createArchive(prior.map(archiveQuestion)).sha256 !== options.beforeSha256 ||
        (!repeated && (current.sha256 !== options.beforeSha256 || prior.length !== scoped.length))) {
      throw new OperationError('追加前の教材が一致しないか、対象模試が既に存在します')
    }
    if (repeated && createArchive(scoped.filter(q => exams.includes(q.exam_number)).map(archiveQuestion)).sha256 !== archive.sha256) {
      throw new OperationError('追加済み教材が一致しません')
    }
    if (!repeated) for (const question of archive.questions) await saveQuestion(question, { db, requireCompleteExam: false })
    for (const exam of exams) await validateCompleteExam(exam, db)
    const after = await storedQuestions(db), byId = new Map(after.map(q => [q.id, q]))
    if (createArchive(after.filter(q => q.grade === currentGrade()).map(archiveQuestion)).sha256 !== options.afterSha256 ||
        after.length !== before.length + (repeated ? 0 : archive.question_count) ||
        before.some(q => storedDigest(byId.get(q.id)) !== storedDigest(q)) ||
        await protectedState(db) !== protectedBefore) {
      throw new OperationError('追加後の教材又は既存データの保持確認に失敗しました')
    }
    return { status: repeated ? 'unchanged' as const : 'appended' as const,
      addedQuestions: repeated ? 0 : archive.question_count, addedChoices: repeated ? 0 : archive.choice_count,
      totalQuestions: after.length, totalChoices: after.reduce((sum, q) => sum + q.choices.length, 0),
      existingQuestionAndChoiceIdsContentAndTimesUnchanged: true, protected13ModelsUnchangedWithinTransaction: true,
      grade: currentGrade(), exams, beforeSha256: options.beforeSha256!, afterSha256: options.afterSha256!, addedSha256: archive.sha256 }
  }
  // A stable snapshot allows legitimate concurrent member activity without
  // mistaking it for this operation's writes. No private rows leave the process.
  return existing ? run(existing) : getDatabase().$transaction(run, { isolationLevel: 'RepeatableRead', timeout: 180_000, maxWait: 10_000 })
}
export async function appendArchiveFile(path: string, options: AppendOptions) {
  return appendArchive(await readJson(path), options)
}

export const PUBLICATION_CONFIRMATION = 'SET_EXAM_PUBLICATION_STATUS'
const publicationStatuses = ['draft', 'published', 'private'] as const
type PublicationOptions = { confirmation?: string, exams?: number[], status?: string, beforeSha256?: string, afterSha256?: string,
  totalQuestionsBefore?: number, otherGradeQuestionCounts?: Record<string, number> }
/** Parse `11-20` or `11,12` into exam numbers without accepting partial or out-of-range input. */
export function parseExamNumbers(value: string | undefined): number[] {
  const text = (value ?? '').trim()
  const range = /^(\d{1,4})-(\d{1,4})$/.exec(text)
  const [low, high] = range ? [Number(range[1]), Number(range[2])] : [0, 0]
  // Check bounds before building a range so oversized input cannot allocate.
  const numbers = range ? (low >= 1 && high <= configuration.exam.set_count && low <= high ? Array.from({ length: high - low + 1 }, (_, i) => low + i) : [])
    : /^\d{1,4}(,\d{1,4})*$/.test(text) ? text.split(',').map(Number) : []
  if (!numbers.length || new Set(numbers).size !== numbers.length ||
      numbers.some(n => !Number.isSafeInteger(n) || n < 1 || n > configuration.exam.set_count)) {
    throw new OperationError(`対象の模試番号を1〜${configuration.exam.set_count}の範囲（例：11-20）で指定してください`)
  }
  return numbers.sort((a, b) => a - b)
}
/**
 * Change the publication status of whole, complete exam sets in the current
 * grade only. Content, choices, IDs, creation times, member histories,
 * favorites and contracts are verified unchanged inside the transaction.
 */
export async function setExamPublication(options: PublicationOptions, existing?: Database) {
  if (options.confirmation !== PUBLICATION_CONFIRMATION) throw new OperationError('模試の公開状態を変更する明示的な確認が必要です')
  if (!publicationStatuses.includes(options.status as typeof publicationStatuses[number])) throw new OperationError('公開状態はdraft・published・privateから指定してください')
  const status = options.status as typeof publicationStatuses[number]
  const exams = options.exams ?? []
  if (!exams.length || exams.some(n => !Number.isSafeInteger(n) || n < 1 || n > configuration.exam.set_count) || new Set(exams).size !== exams.length) {
    throw new OperationError('対象の模試番号を指定してください')
  }
  for (const hash of [options.beforeSha256, options.afterSha256]) {
    if (!hash || !/^[0-9a-f]{64}$/.test(hash)) throw new OperationError('変更前・変更後の照合値を指定してください')
  }
  const otherGrades = configuration.grades.map(g => g.code).filter(grade => grade !== currentGrade()).sort()
  if (!Number.isSafeInteger(options.totalQuestionsBefore) || options.totalQuestionsBefore! < 0 ||
      !object(options.otherGradeQuestionCounts) || Object.keys(options.otherGradeQuestionCounts).sort().join(',') !== otherGrades.join(',') ||
      Object.values(options.otherGradeQuestionCounts).some(count => !Number.isSafeInteger(count) || count < 0)) {
    throw new OperationError('変更前の全体件数と他級の件数を指定してください')
  }
  const perExam = gradeConfig(currentGrade(), configuration).exam.questions_per_exam
  const run = async (db: Database) => {
    await query('SELECT pg_advisory_xact_lock($1)::text', [QUESTION_LOCK], db)
    await query('LOCK TABLE questions, question_choices IN SHARE ROW EXCLUSIVE MODE', [], db)
    const before = await storedQuestions(db), protectedBefore = await protectedState(db)
    if (before.length !== options.totalQuestionsBefore ||
        otherGrades.some(grade => before.filter(q => q.grade === grade).length !== options.otherGradeQuestionCounts![grade])) {
      throw new OperationError('変更前の全体件数又は他級の件数が一致しません')
    }
    const scoped = before.filter(q => q.grade === currentGrade())
    const currentSha = createArchive(scoped.map(archiveQuestion)).sha256
    const repeated = currentSha === options.afterSha256
    if (!repeated && currentSha !== options.beforeSha256) throw new OperationError('変更前の教材が一致しません')
    const targets = scoped.filter(q => exams.includes(q.exam_number))
    for (const exam of exams) {
      const numbers = targets.filter(q => q.exam_number === exam).map(q => q.question_number).sort((a, b) => a - b)
      if (numbers.length !== perExam || numbers.some((n, i) => n !== i + 1)) throw new OperationError(`模試${exam}は問1〜${perExam}がそろっていません`)
    }
    const expectedChanges = targets.filter(q => q.publication_status !== status).length
    const changed = repeated ? 0 : (await setExamsPublication(exams, status, db)).changedQuestions
    if (changed !== (repeated ? 0 : expectedChanges)) throw new OperationError('公開状態を変更した件数が一致しません')
    const after = await storedQuestions(db), byId = new Map(after.map(q => [q.id, q])), targetIds = new Set(targets.map(q => q.id))
    if (before.some(q => !byId.has(q.id))) throw new OperationError('変更後の教材又は既存データの保持確認に失敗しました')
    const withoutPublication = (q: StoredQuestion | undefined) => q && storedDigest({ ...q, publication_status: null, updated_at: null })
    if (createArchive(after.filter(q => q.grade === currentGrade()).map(archiveQuestion)).sha256 !== options.afterSha256 ||
        after.length !== before.length ||
        before.some(q => targetIds.has(q.id)
          ? withoutPublication(byId.get(q.id)) !== withoutPublication(q) || byId.get(q.id)!.publication_status !== status
          : storedDigest(byId.get(q.id)) !== storedDigest(q)) ||
        await protectedState(db) !== protectedBefore) {
      throw new OperationError('変更後の教材又は既存データの保持確認に失敗しました')
    }
    return { status: repeated || changed === 0 ? 'unchanged' as const : 'updated' as const, grade: currentGrade(), exams,
      publicationStatus: status, targetQuestions: targets.length, changedQuestions: changed,
      totalQuestions: after.length, totalChoices: after.reduce((sum, q) => sum + q.choices.length, 0),
      contentChoicesIdsAndCreationTimesUnchanged: true, nonTargetQuestionsUnchanged: true, protected13ModelsUnchangedWithinTransaction: true,
      beforeSha256: options.beforeSha256!, afterSha256: options.afterSha256! }
  }
  return existing ? run(existing) : getDatabase().$transaction(run, { isolationLevel: 'RepeatableRead', timeout: 180_000, maxWait: 10_000 })
}
export async function seedContent(options: { path?: string, db?: Database, mode?: string } = {}) {
  if (currentGrade() !== '2' || (options.mode ?? environment()) !== 'development') return { status: 'skipped' as const }
  return transaction(async connection => {
    await query('SELECT pg_advisory_xact_lock($1)::text', [QUESTION_LOCK], connection)
    await query('LOCK TABLE questions, question_choices IN SHARE ROW EXCLUSIVE MODE', [], connection)
    const total = await connection.question.count({where:{grade:currentGrade()}}) + await connection.questionChoice.count({where:{question:{grade:currentGrade()}}})
    if (total !== 0) return { status: 'skipped' as const }
    const report = await importContent(options.path, IMPORT_CONFIRMATION, connection)
    if (report.question_count === 0) return { status: 'skipped' as const }
    return { status: 'imported' as const, ...report }
  }, options.db)
}

export async function exportArchive(path: string, db?: Database) {
  if (!path || path.includes('\0')) throw new OperationError('出力先のパスを明示してください')
  const archive = await transaction(async connection => {
    if (!db) await query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY', [], connection)
    const questions = await connection.question.findMany({
      where: { grade: currentGrade() },
      orderBy: [{ exam_number: 'asc' }, { question_number: 'asc' }],
      select: { id: true, exam_number: true, question_number: true, major_category_code: true, category_code: true,
        content_blocks: true, explanation_blocks: true, source_text: true, publication_status: true },
    })
    const choices = await connection.questionChoice.findMany({ orderBy: { display_order: 'asc' },
      select: { question_id: true, choice_label: true, content_blocks: true, is_correct: true, display_order: true } })
    const rows = questions.map(({ id, ...question }) => ({ ...question,
      choices: choices.filter(choice => choice.question_id === id).map(({ question_id, ...choice }) => choice),
    }))
    return createArchive(rows)
  }, db)
  const encoded = JSON.stringify(archive, null, 2) + '\n'
  if (Buffer.byteLength(encoded) > MAX_CONTENT_BYTES) throw new OperationError('アーカイブのサイズ上限を超えています')
  let temporary: string | undefined
  try {
    const destination = resolve(path)
    temporary = await mkdtemp(join(dirname(destination), '.exam-questions-'))
    const file = join(temporary, 'archive.json')
    await writeFile(file, encoded, { mode: 0o600, flag: 'wx' })
    await link(file, destination)
  } catch {
    throw new OperationError('書き出せません。出力先が未使用であることと権限を確認してください')
  } finally { if (temporary) await rm(temporary, { recursive: true, force: true }) }
  return summary(archive)
}
