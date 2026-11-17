import {test,expect} from '@playwright/test'
for (const grade of ['2','pre1','1']) test(`grade ${grade} displays cancellation instructions before purchase and on legal pages`,async({page},info)=>{
 for(const path of ['/premium','/commercial-disclosure','/terms']){
  await page.goto(`${path}?grade=${grade}`)
  const guide=page.locator('[data-cancellation-guide]')
  await expect(guide).toHaveCount(1)
  await expect(guide.locator('li')).toHaveCount(3)
  await expect(guide).toContainText('次回の契約更新日時より前')
  await expect(guide).toContainText('アカウント削除は不要')
  await expect(guide).toContainText('日割りの減額・返金は原則として行いません')
  await expect(guide.getByRole('link')).toHaveAttribute('href',`/account?grade=${grade}#subscription-management`)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  if(path==='/commercial-disclosure'){
   expect(await guide.evaluate(el=>getComputedStyle(el).display)).toBe('block')
   await guide.scrollIntoViewIfNeeded()
   await page.screenshot({path:info.outputPath(`disclosure-${grade}.png`),fullPage:true})
  }
  if(path==='/premium'){
   expect(await page.locator('#cancellation-guide').evaluate(el=>!!(el.compareDocumentPosition(document.querySelector('.purchase-panel')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true)
   await expect(page.locator('body')).not.toContainText('1級の教材は準備中')
   await guide.scrollIntoViewIfNeeded()
   await page.screenshot({path:info.outputPath(`cancellation-${grade}.png`),fullPage:true})
  }
 }
})

test('subscriber can reach management directly, see end date, and retry a failed portal handoff',async({page})=>{
 const user={id:900001,name:'合成確認会員',email:'synthetic@example.invalid',role:'user',paid_content_access:true,favorite_questions:[],membership:{status:'active',purchased_at:'2026-01-01T00:00:00Z',expires_at:'2030-01-01T00:00:00Z'},subscription:{status:'active',cancel_at_period_end:true,paid_until:'2030-01-01T00:00:00Z'},verification_access:null,created_at:'2026-01-01T00:00:00Z'}
 await page.route('**/api/auth/get-session*',r=>r.fulfill({json:{session:{id:'synthetic',userId:String(user.id),expiresAt:'2030-01-01T00:00:00Z'},user:{id:String(user.id),name:user.name,email:user.email,emailVerified:true,createdAt:user.created_at,updatedAt:user.created_at}}}))
 await page.route('**/api/v1/me',r=>r.fulfill({json:{data:user}}))
 await page.route('**/api/v1/me/achievement*',r=>r.fulfill({json:{data:{exams:[],total_count:0,answered_count:0,full_access:true}}}))
 let portalCalls=0
 await page.route('**/api/v1/payments/portal',r=>{portalCalls++;return portalCalls===1?r.fulfill({status:503,json:{error:{message:'Synthetic unavailable'}}}):r.fulfill({json:{data:{url:new URL('/premium?portal-return=1&grade=pre1',page.url()).href}}})})
 await page.goto('/account?grade=pre1#subscription-management')
 const panel=page.locator('#subscription-management')
 await expect(panel).toBeVisible()
 await expect(panel).toContainText('解約予約済み')
 await expect(panel).toContainText('日本時間')
 await expect(panel).toContainText('アカウント削除は不要')
 await page.getByRole('button',{name:'メニューを開く',exact:true}).click()
 await page.getByRole('link',{name:'契約・解約の管理',exact:true}).click()
 await expect(panel).toBeInViewport()
 const open=panel.getByRole('button',{name:'契約・支払方法・解約の管理',exact:true})
 await open.click()
 await expect(panel.getByRole('alert')).toContainText('契約管理を開けませんでした')
 await expect(open).toBeEnabled()
 await open.click()
 await expect(page).toHaveURL('/premium?portal-return=1&grade=pre1')
 expect(portalCalls).toBe(2)
})
