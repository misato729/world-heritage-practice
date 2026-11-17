import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { closeDatabase, isolatedTransaction, query, record } from '../server/core/db.ts'
import { gradeConfig } from '../shared/grades.ts'
import { gradeScope } from '../server/core/grade.ts'
import { hasPaidAccess, type User } from '../server/core/auth.ts'
import { authorizeExam, getQuestion, listExams } from '../server/services/learning.ts'
import { validMonthlyPrice, monthlyCheckout, syncSubscription, stopSubscription, subscriptionPortal } from '../server/services/subscriptions.ts'
import { processStripeEvent } from '../server/services/payment-webhooks.ts'
import { paymentSettings } from '../server/services/payment-settings.ts'
import type { PaymentStripeClient } from '../server/services/payment-client.ts'
import { configuration } from '../server/core/config.ts'

const settings = paymentSettings({ PAID_MEMBERSHIP_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_synthetic',STRIPE_WEBHOOK_SECRET:'whsec_synthetic',STRIPE_PRICE_ID:'price_monthly',FRONTEND_URL:'https://example.invalid',NUXT_PUBLIC_SELLER_NAME:'Synthetic',NUXT_PUBLIC_SELLER_REPRESENTATIVE:'Synthetic',NUXT_PUBLIC_SELLER_EMAIL:'seller@example.invalid',NUXT_PUBLIC_SELLER_ADDRESS:'Synthetic',NUXT_PUBLIC_SELLER_PHONE:'synthetic' },configuration,'test')
const price = {id:'price_monthly',active:true,livemode:false,type:'recurring',currency:'jpy',unit_amount:500,tax_behavior:'inclusive',recurring:{interval:'month',interval_count:1}}
const userFixture = async (db:any) => record(await db.user.create({data:{name:'Synthetic',email:randomUUID()+'@example.invalid',role:'user',created_at:new Date(),updated_at:new Date()}})) as User

test('only tax-inclusive JPY 500 monthly recurring prices are accepted',()=>{
 assert.equal(validMonthlyPrice(price),true)
 for(const change of [{unit_amount:501},{tax_behavior:'exclusive'},{currency:'usd'},{type:'one_time'},{recurring:{interval:'year',interval_count:1}},{recurring:{interval:'month',interval_count:2}}]) assert.equal(validMonthlyPrice({...price,...change}),false)
})
test('grade contexts are concurrent and isolate question IDs, catalogs and the free boundary',async()=>isolatedTransaction(async db=>{
 const user=await userFixture(db)
 const [q] = await query(`INSERT INTO questions(grade,exam_number,question_number,major_category_code,category_code,publication_status,created_at,updated_at) VALUES('1',1,1,'basic','basic','published',now(),now()) RETURNING id`,[],db)
 await Promise.all(['1','pre1','2'].map(grade=>gradeScope.run(grade as any,async()=>{
  await new Promise(r=>setTimeout(r,2))
  assert.equal(gradeConfig(grade as any,configuration).exam.questions_per_exam,grade==='1'?90:60)
  const free = gradeConfig(grade as any,configuration).payments.free_exam_count
  await authorizeExam(free,null,db)
  await assert.rejects(()=>authorizeExam(free+1,user,db))
  if(grade!=='1') await assert.rejects(()=>getQuestion(q!.id,null,db))
  const result=await listExams(null,{},db)
  assert.equal(result.data.some(e=>e.exam_number===1),grade==='1')
 })))
}))
test('monthly checkout is shared and idempotent; renewal, failure, expiry and account cancellation retain bounded access',async()=>isolatedTransaction(async db=>{
 const user=await userFixture(db)
 let creates=0
 let checkoutText=''
 let period=Math.floor(Date.now()/1000)+86400
 let status='active',paid=true,canceled=false
 const client={prices:{retrieve:async()=>price},checkout:{sessions:{create:async(params:any)=>{creates++;checkoutText=params.custom_text.submit.message;assert.ok(checkoutText.includes('次回の契約更新日時より前'));assert.ok(checkoutText.includes('準1級は模試1〜2が無料'));assert.ok(checkoutText.length<=1200);assert.equal(params.mode,'subscription');assert.deepEqual(params.allowed_payment_method_types,['card']);assert.equal('payment_method_types' in params,false);return {id:'cs_'+user.id,status:'open',url:'https://checkout.stripe.com/synthetic',livemode:false}},retrieve:async()=>({id:'cs_'+user.id,status:'open',url:'https://checkout.stripe.com/synthetic',livemode:false,custom_text:{submit:{message:checkoutText}},client_reference_id:String(user.id),subscription:'sub_'+user.id}),expire:async()=>({status:'expired'})}},subscriptions:{retrieve:async()=>({id:'sub_'+user.id,customer:'cus_'+user.id,livemode:false,status,cancel_at_period_end:canceled,metadata:{service:'world-heritage-lab',user_id:String(user.id),stripe_price_id:price.id},items:{data:[{price,quantity:1}]},latest_invoice:{status:paid?'paid':'open',amount_paid:paid?500:0,currency:'jpy',livemode:false,lines:{data:[{pricing:{price_details:{price:price.id}},period:{end:period}}]}}}),cancel:async()=>({status:'canceled',livemode:false})}} as unknown as PaymentStripeClient
 await monthlyCheckout(user,{db,client,settings});await monthlyCheckout(user,{db,client,settings});assert.equal(creates,1)
 assert.equal(await hasPaidAccess(user,db),false)
 await syncSubscription('sub_'+user.id,db,client,settings)
 const event={id:'evt_'+randomUUID(),type:'invoice.paid',livemode:false,data:{object:{id:'in_'+user.id,parent:{subscription_details:{subscription:'sub_'+user.id}}}}}
 assert.equal(await processStripeEvent(event,{db,client,settings}),'processed')
 assert.equal(await processStripeEvent(event,{db,client,settings}),'duplicate')
 for(const grade of ['2','pre1','1'] as const) await gradeScope.run(grade,async()=>assert.equal(await hasPaidAccess(user,db),true))
 await assert.rejects(()=>monthlyCheckout(user,{db,client,settings}))
 const until=(await db.subscription.findUniqueOrThrow({where:{user_id:user.id}})).paid_until
 period+=86400;paid=false;status='past_due';await syncSubscription('sub_'+user.id,db,client,settings)
 assert.equal((await db.subscription.findUniqueOrThrow({where:{user_id:user.id}})).paid_until?.toISOString(),until?.toISOString())
 const priorInvoice = {status:'paid',amount_paid:500,currency:'jpy',livemode:false,lines:{data:[{pricing:{price_details:{price:price.id}},period:{end:period-86400}}]}}
 client.invoices={list:async()=>({data:[priorInvoice]})}
 await db.subscription.update({where:{user_id:user.id},data:{paid_until:null}})
 await syncSubscription('sub_'+user.id,db,client,settings)
 assert.equal((await db.subscription.findUniqueOrThrow({where:{user_id:user.id}})).paid_until?.toISOString(),until?.toISOString())
 paid=true;status='active';canceled=true;await syncSubscription('sub_'+user.id,db,client,settings)
 const renewed=(await db.subscription.findUniqueOrThrow({where:{user_id:user.id}})).paid_until
 await syncSubscription('sub_'+user.id,db,client,settings)
 assert.equal((await db.subscription.findUniqueOrThrow({where:{user_id:user.id}})).paid_until?.toISOString(),renewed?.toISOString())
 await db.subscription.update({where:{user_id:user.id},data:{paid_until:new Date(Date.now()-1000)}})
 assert.equal(await hasPaidAccess(user,db),false)
 status='canceled'
 await stopSubscription(user,db,client)
 assert.equal(await db.subscription.count({where:{user_id:user.id}}),0)
}))
after(closeDatabase)

test('stale open Checkout expires before replacement; provider uncertainty never creates another session', async () => isolatedTransaction(async db => {
 const user=await userFixture(db)
 await db.subscription.create({data:{user_id:user.id,checkout_session_id:'cs_stale',status:'pending'}})
 let expired=false,creates=0,expireStatus='expired',pendingStatus='open'
 const client={prices:{retrieve:async()=>price},checkout:{sessions:{
  retrieve:async()=>({id:'cs_stale',status:pendingStatus,url:'https://checkout.stripe.com/stale',livemode:false,custom_text:{submit:{message:'旧説明'}}}),
  expire:async(id:string)=>{assert.equal(id,'cs_stale');expired=true;return {status:expireStatus}},
  create:async(params:any)=>{assert.ok(expired);creates++;assert.match(params.custom_text.submit.message,/解約手順/);return {id:'cs_new',status:'open',url:'https://checkout.stripe.com/new',livemode:false}}
 }}} as unknown as PaymentStripeClient
 const result=await monthlyCheckout(user,{db,client,settings});assert.equal(result.checkout_session_id,'cs_new');assert.equal(creates,1)
 await db.subscription.update({where:{user_id:user.id},data:{checkout_session_id:'cs_stale'}})
 expireStatus='complete'
 await assert.rejects(monthlyCheckout(user,{db,client,settings}));assert.equal(creates,1)
 pendingStatus='complete';expired=false
 await assert.rejects(monthlyCheckout(user,{db,client,settings}));assert.equal(expired,false);assert.equal(creates,1)
}))


test('existing subscribers can open cancellation management even while sales and paid features are disabled',async()=>isolatedTransaction(async db=>{
 const user=await userFixture(db)
 await db.subscription.create({data:{user_id:user.id,stripe_customer_id:'cus_existing',stripe_subscription_id:'sub_existing',status:'active'}})
 const client={billingPortal:{sessions:{create:async(params:any)=>{assert.equal(params.customer,'cus_existing');return {url:'https://billing.stripe.com/synthetic'}}}}} as unknown as PaymentStripeClient
 const result=await subscriptionPortal(user,{db,client,settings:{...settings,enabled:false,featureEnabled:false}})
 assert.equal(result.data.url,'https://billing.stripe.com/synthetic')
}))
