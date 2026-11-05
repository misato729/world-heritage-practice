import { currentGrade } from '../core/grade.ts'
import { hasPaidAccess, type User } from '../core/auth.ts'
import { configuration, freeExamMax } from '../core/config.ts'
import { getDatabase, query, type Database } from '../core/db.ts'
import { fail } from '../core/errors.ts'


export async function listIncorrectReviewQuestions(user: User | null, db: Database = getDatabase()) {
  if (!user) fail(401, 'unauthorized', 'ログインが必要です')
  const full = await hasPaidAccess(user, db)
  const rows = await query<{ question_id: number; exam_number: number; question_number: number }>(`
    SELECT q.id AS question_id, q.exam_number, q.question_number
    FROM questions q
    JOIN LATERAL (
      SELECT ah.is_correct FROM answer_histories ah
      WHERE ah.user_id=$1 AND ah.question_id=q.id
      ORDER BY ah.created_at DESC,ah.id DESC LIMIT 1
    ) latest ON latest.is_correct=FALSE
    WHERE q.grade=$5 AND q.publication_status='published' AND q.exam_number BETWEEN 1 AND $3 AND ($2::boolean OR q.exam_number<=$4)
    ORDER BY q.exam_number,q.question_number,q.id
  `, [user!.id, full, configuration.exam.set_count, freeExamMax,currentGrade()], db)
  const data = rows.map(row => ({ question_id: Number(row.question_id), exam_number: Number(row.exam_number), question_number: Number(row.question_number) }))
  return { data, meta: { total_count: data.length } }
}
