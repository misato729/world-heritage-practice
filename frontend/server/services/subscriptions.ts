import { randomUUID } from 'node:crypto'
import { query, transaction, getDatabase, type Database } from '../core/db.ts'
import { fail } from '../core/errors.ts'
import type { User } from '../core/auth.ts'
import { paymentSettings } from './payment-settings.ts'
import { paymentStripeClient, stripeId, type PaymentStripeClient, type StripeObject } from './payment-client.ts'
import type { PaymentOptions } from './payment-checkout.ts'

export function validMonthlyPrice(price: StripeObject, requireActive = true) {
 return (!requireActive || price.active === true) && price.type === 'recurring' && price.currency === 'jpy' && price.unit_amount === 500 && price.recurring?.interval === 'month' && price.recurring?.interval_count === 1 && price.tax_behavior === 'inclusive'
}
export async function monthlyCheckout(user: User, options: PaymentOptions = {}) {
 const settings = options.settings ?? paymentSettings()
 if (!settings.enabled) fail(503, 'payment_unavailable', '現在、決済を開始できません')
 const client = options.client ?? paymentStripeClient(settings)
 return transaction(async db => {
  await query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id], db)
  const row = await db.subscription.findUnique({where:{user_id:user.id}})
  if (row?.stripe_subscription_id && !['canceled','incomplete_expired'].includes(row.status)) fail(409,'subscription_already_exists','契約管理から支払い・解約状況を確認してください')
  if (row?.checkout_session_id && !row.stripe_subscription_id) {
   const pending = await client.checkout.sessions.retrieve(row.checkout_session_id)
   if (pending.livemode !== settings.livemode) throw new Error('Provider mode mismatch')
   if (pending.status === 'open' && pending.url) return {checkout_session_id:pending.id,checkout_url:pending.url}
   if (pending.status !== 'expired') fail(409,'checkout_session_in_progress','決済の反映を確認中です')
  }
  const price = await client.prices.retrieve(settings.priceId)
  if (!validMonthlyPrice(price) || price.livemode !== settings.livemode) fail(503,'payment_unavailable','税込500円の月額プラン設定を確認できません')
  const metadata = { user_id:String(user.id), service:'world-heritage-lab', stripe_price_id:settings.priceId }
  const session = await client.checkout.sessions.create({mode:'subscription',payment_method_types:['card'],line_items:[{price:settings.priceId,quantity:1}], customer_email:user.email,client_reference_id:String(user.id), metadata,subscription_data:{metadata},allow_promotion_codes:false,automatic_tax:{enabled:false},consent_collection:{terms_of_service:'required'},custom_text:{submit:{message:'月額500円（税込）で自動更新します。1級・準1級・2級の模試4以降の公開問題が対象です。契約管理から解約できます。'}},success_url:settings.frontendUrl+'/premium/complete',cancel_url:settings.frontendUrl+'/premium?canceled=1'}, {idempotencyKey:'heritage-monthly-'+user.id+'-'+randomUUID()})
  if (session.status !== 'open' || !session.url || session.livemode !== settings.livemode) throw new Error('Invalid Checkout')
  try { await db.subscription.upsert({where:{user_id:user.id},create:{user_id:user.id,checkout_session_id:session.id},update:{checkout_session_id:session.id,stripe_subscription_id:null,stripe_customer_id:null,status:'pending',paid_until:null,cancel_at_period_end:false}}) }
  catch(error) { await client.checkout.sessions.expire(session.id); throw error }
  return {checkout_session_id:session.id,checkout_url:session.url}
 },options.db)
}

// Always reconcile the latest provider state, even when events arrive out of order.
export async function syncSubscription(id: string, db: Database, client: PaymentStripeClient, settings = paymentSettings()) {
 if (!client.subscriptions) throw new Error('Subscription client unavailable')
 await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text',['subscription:'+id],db)
 const sub = await client.subscriptions.retrieve(id,{expand:['latest_invoice']})
 const meta = sub.metadata ?? {}
 if (meta.service !== 'world-heritage-lab') return
 const uid = Number(meta.user_id)
 if (!Number.isSafeInteger(uid) || uid < 1) throw new Error('Invalid subscriber')
 await query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[uid],db)
 const row = await db.subscription.findUnique({where:{user_id:uid}})
 if (!row) return // A deleted account must never be recreated by delayed events.
 if (row.stripe_subscription_id && row.stripe_subscription_id !== id) return
 if (!row.stripe_subscription_id) {
  if (!row.checkout_session_id) throw new Error('Missing checkout binding')
  const session = await client.checkout.sessions.retrieve(row.checkout_session_id)
  if (stripeId(session.subscription) !== id || session.client_reference_id !== String(uid) || session.livemode !== settings.livemode) throw new Error('Checkout binding mismatch')
 }
 const item = sub.items?.data?.[0]
 const price = item?.price
 if (sub.id !== id || sub.livemode !== settings.livemode || sub.items?.data?.length !== 1 || item.quantity !== 1 || !validMonthlyPrice(price ?? {}, false) || price.id !== settings.priceId || meta.stripe_price_id !== settings.priceId || !stripeId(sub.customer)) throw new Error('Subscription mismatch')
 let until = row.paid_until
 let invoice = sub.latest_invoice
 if (invoice?.status !== 'paid' && client.invoices) invoice = (await client.invoices.list({subscription:id,status:'paid',limit:1})).data?.[0]
 if (invoice?.status === 'paid' && invoice.amount_paid === 500 && invoice.currency === 'jpy' && invoice.livemode === settings.livemode) {
  const line = invoice.lines?.data?.find((entry: StripeObject) => (entry.pricing?.price_details?.price ?? entry.price?.id) === settings.priceId)
  const end = Number(line?.period?.end)
  if (!Number.isFinite(end) || end <= 0) throw new Error('Invalid paid period')
  const candidate = new Date(end*1000)
  if (!until || candidate > until) until = candidate
 }
 if (sub.status === 'canceled' && until && until > new Date()) until = new Date()
 await db.subscription.update({where:{id:row.id},data:{stripe_subscription_id:id,stripe_customer_id:stripeId(sub.customer),status:sub.status,paid_until:until,cancel_at_period_end:sub.cancel_at_period_end === true}})
}
export async function subscriptionPortal(user: User) {
 const row = await getDatabase().subscription.findUnique({where:{user_id:user.id}})
 const settings=paymentSettings()
 if (!row?.stripe_customer_id || !settings.secretKey) fail(409,'subscription_not_found','管理する契約がありません')
 const client=paymentStripeClient(settings)
 if (!client.billingPortal) throw new Error('Portal unavailable')
 const session=await client.billingPortal.sessions.create({customer:row!.stripe_customer_id,return_url:settings.frontendUrl+'/account'})
 return {data:{url:session.url}}
}
export async function stopSubscription(user: User, db: Database, injectedClient?: PaymentStripeClient) {
 const row=await db.subscription.findUnique({where:{user_id:user.id}})
 if (!row) return
 const client = injectedClient ?? paymentStripeClient()
 if (row.stripe_subscription_id) {
  if (!client.subscriptions) throw new Error('Subscription client unavailable')
  const current=await client.subscriptions.retrieve(row.stripe_subscription_id)
  const result=current.status === 'canceled' ? current : await client.subscriptions.cancel(row.stripe_subscription_id)
  if(result.status !== 'canceled' || result.livemode !== paymentSettings().livemode) fail(503,'payment_unavailable','請求停止を確認できませんでした')
 } else if (row.checkout_session_id) {
  const session=await client.checkout.sessions.retrieve(row.checkout_session_id)
  if(session.livemode !== paymentSettings().livemode) throw new Error('Provider mode mismatch')
  if(session.status==='open') { const expired=await client.checkout.sessions.expire(session.id); if(expired.status !== 'expired' || expired.livemode !== session.livemode) throw new Error('Checkout not expired') }
  else if(session.status!=='expired') fail(409,'checkout_session_in_progress','決済の反映後に再度お試しください')
 }
 await db.subscription.delete({where:{id:row.id}})
}
