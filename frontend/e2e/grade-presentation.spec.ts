import { test, expect } from '@playwright/test'
const cookieGrade = (value?: string) => {
 if (!value) return value
 const decoded = decodeURIComponent(value)
 return decoded.startsWith('"') ? JSON.parse(decoded) : decoded
}

for (const [grade, primary, free] of [['2','#087ca6',3],['pre1','#86438f',2],['1','#34363a',1]] as const) {
 test(`grade ${grade}: theme, selector, free range and last answered default`, async ({page,context}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`/?grade=${grade}`)
  await expect(page.locator('html')).toHaveAttribute('data-grade',grade)
  expect(await page.locator('html').evaluate(el=>getComputedStyle(el).getPropertyValue('--brand-primary').trim())).toBe(primary)
  const select = page.getByLabel('学習する級')
  const control = await select.evaluate(el=>({height:el.getBoundingClientRect().height,border:getComputedStyle(el).borderTopWidth}))
  expect(control.height).toBeGreaterThanOrEqual(44)
  expect(parseFloat(control.border)).toBeGreaterThanOrEqual(2)
  const sidebar = page.getByRole('complementary',{name:'模擬試験一覧'})
  if(await sidebar.locator('.mobile-exam-toggle').isVisible()) await sidebar.locator('.mobile-exam-toggle').click()
  await expect(sidebar.locator('.exam-group').nth(free-1).locator('.exam-link')).toHaveAttribute('href',`/practice/${free}/1?grade=${grade}`)
  await expect(sidebar.locator('.exam-group').nth(free).locator('.exam-link')).toHaveAttribute('href',`/premium?grade=${grade}`)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:testInfo.outputPath(`theme-${grade}.png`),fullPage:true})
  await page.goto(`/premium?grade=${grade}`)
  await expect(page.locator('body')).toContainText('無料会員は2級3セット・準1級2セット・1級1セット')
  await page.goto(`/practice/1/1?grade=${grade}`)
  await expect(page.getByRole('radio')).toHaveCount(4)
  expect((await context.cookies()).some(c=>c.name==='heritage-last-answered-grade')).toBe(false)
  await page.locator('.choices label').first().click()
  await page.getByRole('button',{name:'回答する',exact:true}).click()
  await expect(page.getByRole('heading',{name:'解答解説',exact:true})).toBeVisible()
  expect(cookieGrade((await context.cookies()).find(c=>c.name==='heritage-last-answered-grade')?.value)).toBe(grade)
  const other = grade==='1'?'pre1':'1'
  await page.getByLabel('学習する級').selectOption(other)
  await expect(page.getByLabel('学習する級')).toHaveValue(other)
  await page.goto('/')
  await expect(page).toHaveURL(`/?grade=${grade}`)
  await expect(page.getByLabel('学習する級')).toHaveValue(grade)
  await page.goto(`/?grade=${other}`)
  await expect(page.getByLabel('学習する級')).toHaveValue(other)
  await page.reload()
  await expect(page.getByLabel('学習する級')).toHaveValue(other)
  expect(cookieGrade((await context.cookies()).find(c=>c.name==='heritage-last-answered-grade')?.value)).toBe(grade)
  expect(errors).toEqual([])
 })
}

for (const [grade, free] of [['2',3],['pre1',2],['1',1]] as const) {
 test(`static legal page retains grade ${grade} theme and locks`, async ({page}) => {
  const hydration: string[] = []
  page.on('console', message => { if (/hydration|mismatch/i.test(message.text())) hydration.push(message.text()) })
  await page.goto(`/commercial-disclosure?grade=${grade}`)
  await expect(page.getByLabel('学習する級')).toHaveValue(grade)
  await expect(page.locator('html')).toHaveAttribute('data-grade',grade)
  const sidebar = page.getByRole('complementary',{name:'模擬試験一覧'})
  if(await sidebar.locator('.mobile-exam-toggle').isVisible()) await sidebar.locator('.mobile-exam-toggle').click()
  await expect(sidebar.locator('.exam-group').nth(free-1).locator('.exam-link')).toHaveAttribute('href',`/practice/${free}/1?grade=${grade}`)
  await expect(sidebar.locator('.exam-group').nth(free).locator('.exam-link')).toHaveAttribute('href',`/premium?grade=${grade}`)
  await expect(sidebar.locator('.exam-group').nth(free).getByLabel('プレミアム会員向け')).toHaveCount(1)
  await page.locator('.site-header .brand').click()
  await expect(page).toHaveURL(`/?grade=${grade}`)
  await expect(page.getByLabel('学習する級')).toHaveValue(grade)
  if(await sidebar.locator('.mobile-exam-toggle').isVisible()) await sidebar.locator('.mobile-exam-toggle').click()
  await expect(sidebar.locator('.exam-group').nth(free).locator('.exam-link')).toHaveAttribute('href',`/premium?grade=${grade}`)
  await sidebar.locator('.exam-group').first().locator('.exam-link').click()
  await expect(page).toHaveURL(`/practice/1/1?grade=${grade}`)
  await expect(page.getByRole('radio')).toHaveCount(4)
  await expect(page.getByLabel('学習する級')).toHaveValue(grade)
  expect(hydration).toEqual([])
 })
}
