import test from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import {getAchievementReport} from '../server/services/achievement.ts'
import {configuration,setConfigurationForTesting} from '../server/core/config.ts'
process.env.APP_ENV='test'
test('map SQL scopes owner, publication and entitlement and orders the latest two answers',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 assert.match(new URL(process.env.TEST_DATABASE_URL!).pathname,/_test$/)
 const client=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await client.connect()
 const original=structuredClone(configuration)
 try{
 setConfigurationForTesting({...original,exam:{...original.exam,set_count:10},payments:{...original.payments,enabled:true,free_exam_count:5}})
 await client.query('BEGIN')
 await client.query(`CREATE TEMP TABLE questions(id bigint,exam_number int,question_number int,publication_status text); CREATE TEMP TABLE answer_histories(id bigint,user_id bigint,question_id bigint,is_correct boolean,created_at timestamp); INSERT INTO questions VALUES(1,1,1,'published'),(2,1,2,'published'),(3,6,1,'published'),(4,1,3,'draft'); INSERT INTO answer_histories VALUES(1,1,1,false,'2026-01-01'),(2,1,1,true,'2026-01-01'),(3,1,1,true,'2026-01-01'),(4,2,2,true,'2026-01-01')`)
 const db={query:client.query.bind(client),membership:{findFirst:async()=>null},verificationAccessGrant:{findFirst:async()=>null}} as any
 const free=await getAchievementReport({id:1,role:'user'} as any,db)
 assert.equal(free.data.total_count,2);assert.equal(free.data.answered_count,1);assert.deepEqual(free.data.exams[0]!.questions[0]!.recent_results,[true,true]);assert.equal(free.data.exams[0]!.questions[1]!.status,'unanswered')
 const admin=await getAchievementReport({id:1,role:'admin'} as any,db);assert.equal(admin.data.total_count,3)
 await assert.rejects(getAchievementReport(null,db))
 }finally{await client.query('ROLLBACK');await client.end();setConfigurationForTesting(original)}
})
