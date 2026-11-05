import { hasPaidAccess, type User } from '../core/auth.ts'
import { configuration, freeExamMax } from '../core/config.ts'
import { getDatabase, query, type Database } from '../core/db.ts'
import { fail } from '../core/errors.ts'
import { achievementStatus } from '../../shared/achievement.ts'
import type { AchievementQuestion, AchievementReport } from '../../shared/types/achievement.ts'
export async function getAchievementReport(user: User | null, db: Database = getDatabase()): Promise<{data:AchievementReport}> {
 if(!user) fail(401,'unauthorized','ログインが必要です')
 const full = await hasPaidAccess(user,db)
 const rows = await query<{id:number;exam_number:number;question_number:number;recent_results:boolean[]}>(`SELECT q.id,q.exam_number,q.question_number,COALESCE(h.results,'[]'::jsonb) AS recent_results FROM questions q LEFT JOIN LATERAL (SELECT jsonb_agg(v.is_correct ORDER BY v.created_at DESC,v.id DESC) AS results FROM (SELECT a.id,a.is_correct,a.created_at FROM answer_histories a WHERE a.user_id=$1 AND a.question_id=q.id ORDER BY a.created_at DESC,a.id DESC LIMIT 2) v) h ON true WHERE q.publication_status='published' AND q.exam_number BETWEEN 1 AND $3 AND ($2::boolean OR q.exam_number<=$4) ORDER BY q.exam_number,q.question_number,q.id`,[user!.id,full,configuration.exam.set_count,freeExamMax],db)
 const exams:AchievementReport['exams']=[];let answered=0
 for(const row of rows){let exam=exams.at(-1);if(exam?.exam_number!==row.exam_number){exam={exam_number:row.exam_number,title:`模擬試験${row.exam_number}`,questions:[]};exams.push(exam)}if(row.recent_results.length)answered++;exam!.questions.push({...row,group_number:null,group_question_number:null,answer_type:'single_choice',status:achievementStatus(row.recent_results)} as AchievementQuestion)}
 return {data:{exams,total_count:rows.length,answered_count:answered,full_access:full}}
}
