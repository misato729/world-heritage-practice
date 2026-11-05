import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { after, before, beforeEach, test } from 'node:test'
import { createApp, defineEventHandler, toNodeListener } from 'h3'
import { createApiTestApp } from './helpers/api-app.ts'
import { getDatabase, query, closeDatabase } from '../server/core/db.ts'
import { closeRateLimitStore } from '../server/core/rate-limit.ts'
import { migrate } from '../server/database/migrate.ts'
import { saveQuestion } from '../server/services/learning-writer.ts'
import { configuration } from '../server/core/config.ts'
import { createTestQuestion } from '../test-support/question-fixture.ts'

const integration={skip:!process.env.TEST_DATABASE_URL}
let api:Server,relay:Server,base:string,questionId:number,choiceId:number
const mail:{to:string,token:string,origin:string}[]=[]
const backgroundTasks:Promise<unknown>[]=[]
let pauseRelay=false,releaseRelay:(()=>void)|undefined
const emails:string[]=[];const userIds:bigint[]=[]
const initial='Synthetic-old-password';const next='新'.repeat(50)
const origin='http://localhost:3100';const secret='a'.repeat(64)
process.env.APP_ENV='test';process.env.BETTER_AUTH_URL=origin;process.env.FRONTEND_URL=origin
process.env.BETTER_AUTH_SECRET='synthetic-password-test-'+randomUUID()+randomUUID()
if(process.env.TEST_DATABASE_URL)process.env.DATABASE_URL=process.env.TEST_DATABASE_URL
before(async()=>{
 if(integration.skip)return
 assert.match(new URL(process.env.DATABASE_URL!).pathname,/_test$/)
 await migrate()
 const app=await createApiTestApp();const tracked=createApp().use(defineEventHandler(event=>{(event as any).waitUntil=(p:Promise<unknown>)=>backgroundTasks.push(p)})).use(app.handler);api=createServer(toNodeListener(tracked));await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(api.address() as any).port
 relay=createServer(async(req,res)=>{let raw='';for await(const b of req)raw+=b;const envelope=JSON.parse(raw);assert.ok(envelope.signature===createHmac('sha256',secret).update(envelope.payload).digest('hex'));const p=JSON.parse(envelope.payload);mail.push({to:p.to,token:p.token,origin:p.origin});if(pauseRelay)await new Promise<void>(r=>{releaseRelay=r});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,request_id:p.request_id}))})
 await new Promise<void>(r=>relay.listen(0,'127.0.0.1',r))
 process.env.PASSWORD_RESET_ENABLED='true';process.env.PASSWORD_RESET_GAS_SECRET=secret;process.env.PASSWORD_RESET_GAS_URL='http://127.0.0.1:'+(relay.address() as any).port+'/exec'
 questionId=(await saveQuestion(createTestQuestion(configuration))).id
 choiceId=Number((await getDatabase().questionChoice.findFirstOrThrow({where:{question_id:BigInt(questionId)}})).id)
})
beforeEach(async()=>{if(!integration.skip){await Promise.all(backgroundTasks);backgroundTasks.length=0;await query('DELETE FROM rate_limiter_flexible');mail.length=0}})
after(async()=>{
 await Promise.all(backgroundTasks)
 if(api)await new Promise<void>(r=>api.close(()=>r()));if(relay)await new Promise<void>(r=>relay.close(()=>r()))
 if(!integration.skip){await getDatabase().authVerification.deleteMany({where:{value:{in:userIds.map(String)}}});await getDatabase().user.deleteMany({where:{email:{in:emails}}});if(questionId)await getDatabase().question.delete({where:{id:BigInt(questionId)}})}
 await closeRateLimitStore();await closeDatabase()
})
async function request(path:string,body?:unknown,cookie?:string,extra:Record<string,string>={}){
 const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})})
 const text=await r.text();return{status:r.status,body:text?JSON.parse(text):null,cookie:r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; '),headers:r.headers}
}
async function account(){const email='password-'+randomUUID()+'@example.invalid';emails.push(email);const r=await request('/api/auth/sign-up/email',{email,name:'Synthetic password user',password:initial});assert.equal(r.status,200);const u=await getDatabase().user.findUniqueOrThrow({where:{email}});userIds.push(u.id);return{email,id:u.id,cookie:r.cookie}}
async function resetMail(email:string){const count=mail.length;const r=await request('/api/auth/request-password-reset',{email,redirectTo:'https://foreign.invalid/reset'});assert.equal(r.status,200);for(let i=0;i<100&&mail.length===count;i++)await new Promise(r=>setTimeout(r,10));assert.equal(mail.length,count+1);assert.equal(mail.at(-1)!.to,email);assert.equal(mail.at(-1)!.origin,origin);return mail.at(-1)!.token}

test('HTTP change verifies the current password and forces session revocation even when the caller requests otherwise',integration,async()=>{
 const a=await account();const b=await request('/api/auth/sign-in/email',{email:a.email,password:initial});assert.equal(b.status,200)
 const before=await getDatabase().authAccount.findFirstOrThrow({where:{user_id:a.id,provider_id:'credential'}})
 assert.equal((await request('/api/auth/change-password',{currentPassword:'wrong-password',newPassword:next},a.cookie)).status,400)
 assert.ok((await getDatabase().authAccount.findUniqueOrThrow({where:{id:before.id}})).password===before.password)
 assert.equal((await request('/api/auth/change-password',{currentPassword:initial,newPassword:initial},a.cookie)).status,422)
 const changed=await request('/api/auth/change-password',{currentPassword:initial,newPassword:next,revokeOtherSessions:false},a.cookie);assert.equal(changed.status,200);assert.ok(changed.cookie)
 for(const cookie of[a.cookie,b.cookie])assert.equal((await request('/api/v1/me',undefined,cookie)).status,401)
 assert.equal((await request('/api/v1/me',undefined,changed.cookie)).status,200)
 assert.equal((await request('/api/auth/sign-in/email',{email:a.email,password:initial})).status,401)
 assert.equal((await request('/api/auth/sign-in/email',{email:a.email,password:next})).status,200)
})
test('reset uses hashed native verification identifiers, expires in 30 minutes, consumes once and preserves unrelated data',integration,async()=>{
 const a=await account(),other=await account();const db=getDatabase();const at=new Date()
 await db.favorite.create({data:{user_id:a.id,question_id:BigInt(questionId),created_at:at,updated_at:at}})
 await db.answerHistory.create({data:{user_id:a.id,question_id:BigInt(questionId),selected_choice_id:BigInt(choiceId),is_correct:true,created_at:at,updated_at:at}})
 const otherCredential=(await db.authAccount.findFirstOrThrow({where:{user_id:other.id}})).password
 const token=await resetMail(a.email);const v=await db.authVerification.findFirstOrThrow({where:{value:String(a.id)}})
 assert.ok(!v.identifier.includes(token));assert.ok(v.expires_at.getTime()-Date.now()>29*60000&&v.expires_at.getTime()-Date.now()<=30*60000)
 assert.equal((await request('/api/auth/reset-password',{token,newPassword:next})).status,200)
 assert.equal((await request('/api/auth/reset-password',{token,newPassword:'Different-synthetic-password'})).status,400)
 assert.equal((await request('/api/v1/me',undefined,a.cookie)).status,401)
 assert.equal((await request('/api/v1/me',undefined,other.cookie)).status,200)
 assert.equal((await request('/api/auth/sign-in/email',{email:a.email,password:initial})).status,401)
 assert.equal((await request('/api/auth/sign-in/email',{email:a.email,password:next})).status,200)
 assert.equal(await db.favorite.count({where:{user_id:a.id}}),1);assert.equal(await db.answerHistory.count({where:{user_id:a.id}}),1)
 assert.ok((await db.authAccount.findFirstOrThrow({where:{user_id:other.id}})).password===otherCredential)
})
test('native reset rejects expiry and admits exactly one concurrent use',integration,async()=>{
 const a=await account();const expired=await resetMail(a.email)
 await getDatabase().authVerification.updateMany({where:{value:String(a.id)},data:{expires_at:new Date(Date.now()-1000)}})
 assert.equal((await request('/api/auth/reset-password',{token:expired,newPassword:next})).status,400)
 assert.equal((await request('/api/v1/me',undefined,a.cookie)).status,200)
 const token=await resetMail(a.email);const results=await Promise.all([request('/api/auth/reset-password',{token,newPassword:next}),request('/api/auth/reset-password',{token,newPassword:'Other-new-synthetic-password'})])
 assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);assert.equal(await getDatabase().authVerification.count({where:{value:String(a.id)}}),0)
})
test('unknown email does not send; missing settings, CSRF, query-token and unsupported callbacks stay closed',integration,async()=>{
 const r=await request('/api/auth/request-password-reset',{email:'unregistered-'+randomUUID()+'@example.invalid'});assert.equal(r.status,200);assert.equal(mail.length,0)
 process.env.PASSWORD_RESET_ENABLED='false';try{assert.equal((await request('/api/auth/request-password-reset',{email:'unregistered@example.invalid'})).status,503)}finally{process.env.PASSWORD_RESET_ENABLED='true'}
 const a=await account();assert.equal((await request('/api/auth/request-password-reset',{email:a.email},undefined,{Origin:'https://foreign.invalid'})).status,403);assert.equal(mail.length,0)
 assert.equal((await request('/api/auth/reset-password?token='+'A'.repeat(24),{newPassword:next})).status,422)
 assert.equal((await request('/api/auth/reset-password/'+'A'.repeat(24))).status,404)
 assert.equal((await request('/api/auth/delete-user',{})).status,404)
})
test('per-email requests use the shared PostgreSQL store and preserve the retry header',integration,async()=>{
 const email='rate-'+randomUUID()+'@example.invalid'
 for(let i=0;i<3;i++)assert.equal((await request('/api/auth/request-password-reset',{email})).status,200)
 const denied=await request('/api/auth/request-password-reset',{email});assert.equal(denied.status,429);assert.ok(Number(denied.headers.get('retry-after'))>0);assert.equal(mail.length,0)
})

test('delivery is registered with the event lifecycle and stays pending after the public response',integration,async()=>{
 const a=await account();pauseRelay=true
 try{
  const response=await request('/api/auth/request-password-reset',{email:a.email});assert.equal(response.status,200);assert.equal(backgroundTasks.length,1)
  for(let i=0;i<100&&!releaseRelay;i++)await new Promise(r=>setTimeout(r,10));assert.ok(releaseRelay)
  let completed=false;void backgroundTasks[0]!.then(()=>{completed=true});await new Promise(r=>setTimeout(r,10));assert.equal(completed,false)
 }finally{pauseRelay=false;releaseRelay?.();releaseRelay=undefined;await Promise.all(backgroundTasks)}
})
test('native standard preserves other unused links after reissue, another reset and a normal password change',integration,async()=>{
 const a=await account(),old=await resetMail(a.email),latest=await resetMail(a.email)
 assert.equal((await request('/api/auth/reset-password',{token:latest,newPassword:next})).status,200)
 assert.equal((await request('/api/auth/reset-password',{token:old,newPassword:'Synthetic-other-reset'})).status,200)
 const login=await request('/api/auth/sign-in/email',{email:a.email,password:'Synthetic-other-reset'});assert.equal(login.status,200)
 const remaining=await resetMail(a.email)
 assert.equal((await request('/api/auth/change-password',{currentPassword:'Synthetic-other-reset',newPassword:next},login.cookie)).status,200)
 assert.equal((await request('/api/auth/reset-password',{token:remaining,newPassword:'Synthetic-final-reset'})).status,200)
})
test('native IP admission refuses new email bucket allocation after exhausting the IP limit',integration,async()=>{
 for(let i=0;i<30;i++)assert.equal((await request('/api/auth/request-password-reset',{email:'ip-'+i+'-'+randomUUID()+'@example.invalid'})).status,200)
 const before=Number((await query<{count:number}>('SELECT count(*)::int AS count FROM rate_limiter_flexible'))[0]!.count)
 assert.equal((await request('/api/auth/request-password-reset',{email:'denied-'+randomUUID()+'@example.invalid'})).status,429)
 const after=Number((await query<{count:number}>('SELECT count(*)::int AS count FROM rate_limiter_flexible'))[0]!.count)
 assert.equal(after,before);assert.equal(mail.length,0)
})
