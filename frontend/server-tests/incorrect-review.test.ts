import test from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { listIncorrectReviewQuestions } from '../server/services/incorrect-review.ts'
import { configuration, setConfigurationForTesting } from '../server/core/config.ts'
process.env.APP_ENV = 'test'
test('incorrect review uses own latest answers, exact pairs, publication and current entitlement', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  assert.match(new URL(process.env.TEST_DATABASE_URL!).pathname, /_test$/)
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL })
  await client.connect()
  const original = structuredClone(configuration)
  try {
    setConfigurationForTesting({ ...original, exam: { ...original.exam, set_count: 10 }, payments: { ...original.payments, enabled: true, free_exam_count: 5 } })
    await client.query('BEGIN')
    await client.query(`CREATE TEMP TABLE questions(id bigint,exam_number int,question_number int,publication_status text,content_version int DEFAULT 1,answer_type text DEFAULT 'single_choice',group_id bigint);
      CREATE TEMP TABLE answer_histories(id bigint,user_id bigint,question_id bigint,is_correct boolean,created_at timestamp,question_version int DEFAULT 1,answer_type text DEFAULT 'single_choice');
      CREATE TEMP TABLE exam_sets(exam_number int,publication_status text,format_code text);
      CREATE TEMP TABLE question_groups(id bigint,exam_number int,publication_status text);
      CREATE TEMP TABLE memberships(user_id bigint,status text);
      CREATE TEMP TABLE verification_access_grants(user_id bigint,revoked_at timestamp,expires_at timestamp);
      INSERT INTO questions(id,exam_number,question_number,publication_status) VALUES(1,1,3,'published'),(2,2,4,'published'),(3,2,9,'published'),(4,1,5,'published'),(5,1,6,'draft'),(6,6,7,'published'),(7,1,7,'published'),(8,1,8,'published'),(9,3,1,'published'),(10,4,1,'published'),(11,11,1,'published');
      INSERT INTO answer_histories(id,user_id,question_id,is_correct,created_at) VALUES(1,1,1,false,'2026-01-01'),(2,1,1,false,'2026-01-01'),(3,1,2,false,'2026-01-01'),(4,1,2,true,'2026-01-01'),(5,1,3,true,'2026-01-01'),(6,1,3,false,'2026-01-01'),(7,2,4,false,'2026-01-01'),(8,1,5,false,'2026-01-01'),(9,1,6,false,'2026-01-01'),(10,1,7,false,'2026-01-01'),(11,1,8,NULL,'2026-01-01'),(12,1,9,false,'2026-01-01'),(13,1,10,false,'2026-01-01'),(14,1,11,false,'2026-01-01');
      UPDATE answer_histories SET question_version=2 WHERE question_id=7;
      INSERT INTO exam_sets VALUES(3,'published','group_practice'),(4,'draft','legacy_practice');
      INSERT INTO question_groups VALUES(1,3,'draft'); UPDATE questions SET group_id=1 WHERE id=9`)
    const db = { query: client.query.bind(client), membership: { findFirst: async () => null }, verificationAccessGrant: { findFirst: async () => null } } as any
    const user = { id: 1, role: 'user' } as any
    const data = await listIncorrectReviewQuestions(user, db)
    assert.deepEqual(data.data.map(x => [x.exam_number,x.question_number]), [[1,3],[1,7],[2,9],[3,1],[4,1]])
    assert.equal(data.meta.total_count, 5)
    assert.deepEqual(Object.keys(data.data[0]!).sort(), ['exam_number','question_id','question_number'])
    const full = await listIncorrectReviewQuestions({ ...user, role: 'admin' }, db)
    assert.equal(full.data.some(x => x.exam_number === 6), true)
    assert.equal((await listIncorrectReviewQuestions(user, db)).data.some(x => x.exam_number === 6), false)
    await client.query("UPDATE answer_histories SET is_correct=true WHERE id=2")
    assert.equal((await listIncorrectReviewQuestions(user, db)).data.some(x => x.question_id === 1), false)
    await client.query("INSERT INTO answer_histories(id,user_id,question_id,is_correct,created_at) VALUES(15,1,1,false,'2026-02-01')")
    assert.equal((await listIncorrectReviewQuestions(user, db)).data.some(x => x.question_id === 1), true)
    await assert.rejects(listIncorrectReviewQuestions(null, db), (e:any) => e.status === 401)
  } finally { await client.query('ROLLBACK'); await client.end(); setConfigurationForTesting(original) }
})
