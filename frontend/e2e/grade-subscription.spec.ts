import { test, expect } from '@playwright/test'
import { loadE2EFixture } from '../scripts/e2e-fixture.mjs'

const { config } = loadE2EFixture()

for (const [grade, questions] of [['2', 60], ['pre1', 60], ['1', 90]] as const) {
 test(`grade ${grade} uses the shared sidebar layout and navigation`, async ({ page }, testInfo) => {
  const problemRequests: string[] = []
  page.on('request', request => {
   const path = new URL(request.url()).pathname
   if (/^\/api\/v1\/(?:exams|questions|review_questions)(?:\/|$)/.test(path)) problemRequests.push(path)
  })
  await page.goto(`/?grade=${grade}`)
  const sidebar = page.getByRole('complementary', { name: '模擬試験一覧' })
  await expect(sidebar.locator('.exam-groups')).toHaveCount(1)
  await expect(sidebar.locator('.sidebar-loading')).toHaveCount(0)
  await expect(sidebar.locator('.exam-group')).toHaveCount(config.exam.set_count)
  const mobile = sidebar.locator('.mobile-exam-toggle')
  const isMobile = await mobile.isVisible()
  if (isMobile) {
   await expect(mobile).toHaveAttribute('aria-expanded', 'false')
   await mobile.click()
   const columns = await sidebar.locator('.exam-groups').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)
   expect(columns).toBe(2)
  }
  const first = sidebar.locator('.exam-group').first()
  await first.getByRole('button').click()
  await expect(first.locator('.question-list a')).toHaveCount(questions)
  await expect(first.locator('.question-list a').last()).toHaveAttribute('href', `/practice/1/${questions}?grade=${grade}`)
  const fourth = sidebar.locator('.exam-group').nth(config.payments.free_exam_count)
  await fourth.getByRole('button').click()
  await expect(first.locator('.question-list')).toHaveCount(0)
  await expect(fourth.locator('.question-list a')).toHaveCount(questions)
  await expect(fourth.locator('.exam-link')).toHaveAttribute('href', `/premium?grade=${grade}`)
  await expect(fourth.locator('.question-list a').last()).toHaveAttribute('href', `/premium?grade=${grade}`)
  if (isMobile) {
   const size = await fourth.locator('.question-list').evaluate(el => ({ width: el.getBoundingClientRect().width, parent: el.parentElement!.getBoundingClientRect().width }))
   expect(size.width).toBeGreaterThan(size.parent * 1.9)
  }
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }))
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport)
  expect(problemRequests).toEqual([])
  await page.screenshot({ path: testInfo.outputPath(`sidebar-${grade}.png`), animations: 'disabled' })
  await fourth.locator('.exam-link').click()
  await expect(page).toHaveURL(`/premium?grade=${grade}`)
  await expect(page.getByLabel('学習する級')).toHaveValue(grade)
  if (isMobile) await expect(mobile).toHaveAttribute('aria-expanded', 'false')
  expect(problemRequests).toEqual([])
 })
}

test('grade switch preserves explicit links and monthly price/free boundary',async({page})=>{
 await page.goto('/?grade=2')
 await expect(page.getByLabel('学習する級')).toHaveValue('2')
 await page.getByLabel('学習する級').selectOption('1')
 await expect(page).toHaveURL(/grade=1/)
 await expect(page.getByLabel('学習する級')).toHaveValue('1')
 await expect(page.getByText('各90問',{exact:true})).toBeVisible()
 const link=page.locator('.exam-sidebar a').filter({hasText:'模擬試験 1'}).first()
 if(await link.isVisible()) await expect(link).toHaveAttribute('href',/grade=1/)
 await page.goto('/premium?grade=pre1')
 await expect(page.getByLabel('学習する級')).toHaveValue('pre1')
 await expect(page.locator('.premium-page').last()).toContainText('500')
 await expect(page.locator('body')).toContainText('模擬試験4以降')
 await expect(page.locator('body')).not.toContainText('自動更新はありません')
})
