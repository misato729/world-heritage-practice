import { test, expect } from '@playwright/test'
import { loadE2EFixture } from '../scripts/e2e-fixture.mjs'

const { config } = loadE2EFixture()

for (const kind of ['anonymous', 'free', 'premium'] as const) {
  test(`static home and sidebar keep links without problem requests for ${kind}`, async ({ page }, testInfo) => {
    const fullAccess = !config.payments.enabled || kind === 'premium'
    const user = kind === 'anonymous' ? null : {
      id: 900001, name: '検証会員', email: 'synthetic@example.invalid', role: 'user',
      paid_content_access: kind === 'premium', favorite_questions: [],
      membership: { status: kind === 'premium' ? 'active' : 'free', purchased_at: null, expires_at: null },
    }
    await page.route('**/api/auth/get-session*', route => route.fulfill({ json: user ? {
      user: { id: String(user.id), name: user.name, email: user.email, emailVerified: false },
      session: { id: 'synthetic-navigation', userId: String(user.id), expiresAt: '2099-01-01T00:00:00.000Z' },
    } : null }))
    await page.route('**/api/v1/me', route => route.fulfill({ status: user ? 200 : 401, json: user ? { data: user } : { error: { code: 'unauthorized', message: 'ログインが必要です' } } }))
    const problemRequests: string[] = []
    page.on('request', request => {
      const path = new URL(request.url()).pathname
      if (/^\/api\/v1\/(?:exams|questions|review_questions)(?:\/|$)/.test(path)) problemRequests.push(path)
    })
    await page.goto('/')
    await expect(page.locator('.exam-sidebar .exam-group')).toHaveCount(config.exam.set_count)
    await expect(page.locator('.exam-grid .exam-card')).toHaveCount(config.exam.set_count)
    // Qualification has resolved before checking premium destinations.
    if (user) await expect(page.locator('.site-header .account-link')).toBeVisible()
    for (let number = 1; number <= config.exam.set_count; number++) {
      const locked = config.payments.enabled && number > config.payments.free_exam_count && !fullAccess
      await expect(page.locator('.exam-grid .exam-card').nth(number - 1)).toHaveAttribute('href', locked ? '/premium' : `/practice/${number}/1`)
    }
    const mobile = page.locator('.mobile-exam-toggle')
    if (await mobile.isVisible()) await mobile.click()
    const exam = page.locator('.exam-sidebar .exam-group').nth(config.exam.set_count - 1)
    await exam.getByRole('button').click()
    const questions = exam.locator('.question-list a')
    await expect(questions).toHaveCount(config.exam.questions_per_exam)
    const locked = config.payments.enabled && config.exam.set_count > config.payments.free_exam_count && !fullAccess
    for (let number = 1; number <= config.exam.questions_per_exam; number++) {
      await expect(questions.nth(number - 1)).toHaveText(`問${number}`)
      await expect(questions.nth(number - 1)).toHaveAttribute('href', locked ? '/premium' : `/practice/${config.exam.set_count}/${number}`)
    }
    await questions.last().scrollIntoViewIfNeeded()
    await expect(questions.last()).toBeVisible()
    await expect(page.locator('.sidebar-loading')).toHaveCount(0)
    expect(problemRequests).toEqual([])
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }))
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport)
    await page.screenshot({ path: testInfo.outputPath(`static-${kind}.png`), fullPage: true, animations: 'disabled' })
    if (kind === 'free') {
      // A previous explicit catalog request must not replace locked static entries.
      expect((await page.request.get('/api/v1/exams')).ok()).toBe(true)
      await exam.getByRole('button').click()
      await exam.getByRole('button').click()
      await expect(questions.nth(0)).toHaveAttribute('href', locked ? '/premium' : `/practice/${config.exam.set_count}/1`)
      expect(problemRequests).toEqual([])
    }
    await page.goto('/privacy-policy')
    if (await mobile.isVisible()) await mobile.click()
    const staticExam = page.locator('.exam-sidebar .exam-group').nth(config.exam.set_count - 1)
    if (await staticExam.getByRole('button').getAttribute('aria-expanded') !== 'true') await staticExam.getByRole('button').click()
    await expect(staticExam.locator('.question-list a')).toHaveCount(config.exam.questions_per_exam)
    expect(problemRequests).toEqual([])
  })
}

for (const order of ['sequential', 'random'] as const) {
  test(`condition start uses only published exact positions in ${order} order`, async ({ page }) => {
    let catalogs = 0
    await page.route('**/api/v1/exams', route => {
      catalogs++
      return route.fulfill({ json: { data: [
        { exam_number: 1, question_numbers: [1], access: 'available' },
        { exam_number: 2, question_numbers: [4], access: 'available' },
        { exam_number: 6, question_numbers: [1], access: 'paid_membership_required' },
      ] } })
    })
    await page.goto('/')
    await page.getByRole('tab', { name: '条件を指定', exact: true }).click()
    const availableSets = config.payments.enabled ? config.payments.free_exam_count : config.exam.set_count
    await expect(page.locator('.condition-submit')).toContainText(`最大${availableSets * config.exam.questions_per_exam}問`)
    expect(catalogs).toBe(0)
    await page.getByRole('button', { name: order === 'random' ? 'ランダムに始める' : '問題番号順に始める', exact: true }).click()
    await expect(page).toHaveURL(/\/practice\/[12]\/[14]\?/)
    const url = new URL(page.url())
    expect(url.searchParams.get('review')).toBe('1.1,2.4')
    expect(url.searchParams.get('order')).toBe(order === 'random' ? 'random' : null)
    expect(catalogs).toBe(1)
  })
}

test('unpublished conditions stay on the launcher with a clear message', async ({ page }) => {
  await page.route('**/api/v1/exams', route => route.fulfill({ json: { data: [] } }))
  await page.goto('/')
  await page.getByRole('tab', { name: '条件を指定', exact: true }).click()
  await page.getByRole('button', { name: '問題番号順に始める', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('選択した条件に公開中の問題はありません。')
  await expect(page).toHaveURL('/')
})


test('a delayed condition start cannot navigate after leaving the home page', async ({ page }) => {
  let deliver!: () => Promise<void>
  let arrived!: () => void
  const requestArrived = new Promise<void>(resolve => { arrived = resolve })
  await page.route('**/api/v1/exams', route => {
    deliver = () => route.fulfill({ json: { data: [{ exam_number: 1, question_numbers: [1], access: 'available' }] } })
    arrived()
  })
  await page.goto('/')
  await page.getByRole('tab', { name: '条件を指定', exact: true }).click()
  await page.getByRole('button', { name: '問題番号順に始める', exact: true }).click()
  await requestArrived
  await page.locator('footer').getByRole('link', { name: 'プライバシーポリシー', exact: true }).click()
  await expect(page).toHaveURL('/privacy-policy')
  const response = page.waitForResponse('**/api/v1/exams')
  await deliver()
  await response
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveURL('/privacy-policy')
})
