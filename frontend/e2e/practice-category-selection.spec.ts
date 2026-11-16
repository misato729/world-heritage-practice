import { test, expect } from '@playwright/test'
import { loadE2EFixture } from '../scripts/e2e-fixture.mjs'

for (const grade of ['2', 'pre1', '1']) {
  test(`grade ${grade} selects multiple fields before exams and retains exact positions`, async ({ page }, info) => {
    let catalogs = 0
    await page.route('**/api/v1/exams*', route => {
      if (new URL(route.request().url()).searchParams.has('count')) return route.fulfill({ json: { data: [] } })
      catalogs++
      expect(new URL(route.request().url()).searchParams.get('major_categories')).toBe('fundamentals,japan')
      return route.fulfill({ json: { data: [
        { exam_number: 1, question_numbers: [2], access: 'available' },
        { exam_number: 2, question_numbers: [4], access: 'available' },
        { exam_number: 3, question_numbers: [9], access: 'available' },
        { exam_number: 6, question_numbers: [1], access: 'paid_membership_required' },
      ] } })
    })
    await page.goto(`/?grade=${grade}`)
    await page.getByRole('tab', { name: '条件を指定', exact: true }).click()
    const panel = page.locator('#conditions-mode-panel')
    await expect(panel.locator('legend')).toHaveText(['出題範囲', '対象模試'])
    const fields = panel.getByRole('group', { name: '出題範囲', exact: true })
    const exams = panel.getByRole('group', { name: '対象模試', exact: true })
    await expect(fields.locator('.category-checkbox-grid label span')).toHaveText(['基礎知識', '日本の遺産', '世界の文化遺産', '世界の自然遺産', 'その他'])
    await expect(panel.locator('input[name="question-numbers"]')).toHaveCount(0)
    await fields.getByRole('checkbox', { name: '全選択', exact: true }).uncheck()
    await expect(panel.getByRole('button', { name: '問題番号順に始める', exact: true })).toBeDisabled()
    await fields.getByRole('checkbox', { name: '基礎知識', exact: true }).check()
    await fields.getByRole('checkbox', { name: '日本の遺産', exact: true }).check()
    await expect(fields.getByRole('checkbox', { name: '全選択', exact: true })).toHaveJSProperty('indeterminate', true)
    await exams.getByRole('checkbox', { name: '全選択', exact: true }).uncheck()
    await expect(panel.getByRole('button', { name: 'ランダムに始める', exact: true })).toBeDisabled()
    await exams.getByRole('checkbox', { name: '1', exact: true }).check()
    await exams.getByRole('checkbox', { name: '2', exact: true }).check()
    await expect(panel.locator('.condition-submit')).toContainText('2模試・2分野')
    expect(catalogs).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await fields.scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath(`fields-${grade}.png`), fullPage: true, animations: 'disabled' })
    await panel.getByRole('button', { name: '問題番号順に始める', exact: true }).click()
    await expect(page).toHaveURL(/\/practice\/1\/2\?/)
    const query = new URL(page.url()).searchParams
    expect(query.get('exams')).toBe('1,2')
    expect(query.get('review')).toBe('1.2,2.4')
    expect(query.get('questions')).toBe(null)
    expect(query.get('grade')).toBe(grade)
    expect(catalogs).toBe(1)
  })
}

test('a real category start contains only the selected field in the selected exam', async ({ page }) => {
  const { questions } = loadE2EFixture()
  const expected = questions.filter(question => question.exam_number === 1 && question.major_category_code === 'japan' && question.publication_status === 'published')
    .map(question => `1.${question.question_number}`).join(',')
  expect(expected.length).toBeGreaterThan(0)
  await page.goto('/')
  await page.getByRole('tab', { name: '条件を指定', exact: true }).click()
  const fields = page.getByRole('group', { name: '出題範囲', exact: true })
  const exams = page.getByRole('group', { name: '対象模試', exact: true })
  await fields.getByRole('checkbox', { name: '全選択', exact: true }).uncheck()
  await fields.getByRole('checkbox', { name: '日本の遺産', exact: true }).check()
  await exams.getByRole('checkbox', { name: '全選択', exact: true }).uncheck()
  await exams.getByRole('checkbox', { name: '1', exact: true }).check()
  const response = page.waitForResponse('**/api/v1/exams*')
  await page.getByRole('button', { name: '問題番号順に始める', exact: true }).click()
  const catalog = await response
  expect(catalog.status()).toBe(200)
  expect(JSON.stringify(await catalog.json())).not.toContain('content_blocks')
  await expect(page).toHaveURL(/\/practice\/1\/\d+\?/)
  expect(new URL(page.url()).searchParams.get('review')).toBe(expected)
  expect((await page.request.get('/api/v1/exams?major_categories=unknown')).status()).toBe(400)
})

test('changing fields during a pending start discards the previous selection', async ({ page }) => {
  let deliver!: () => Promise<void>
  let arrive!: () => void
  const arrived = new Promise<void>(done => { arrive = done })
  await page.route('**/api/v1/exams*', route => {
      if (new URL(route.request().url()).searchParams.has('count')) return route.fulfill({ json: { data: [] } })
    deliver = () => route.fulfill({ json: { data: [{ exam_number: 1, question_numbers: [1], access: 'available' }] } })
    arrive()
  })
  await page.goto('/')
  await page.getByRole('tab', { name: '条件を指定', exact: true }).click()
  await page.getByRole('button', { name: '問題番号順に始める', exact: true }).click()
  await arrived
  await page.getByRole('checkbox', { name: 'その他', exact: true }).uncheck()
  const response = page.waitForResponse('**/api/v1/exams*')
  await deliver(); await response
  await expect(page.getByRole('button', { name: '問題番号順に始める', exact: true })).toBeEnabled()
  await expect(page).toHaveURL('/')
})

test('selected condition count follows published fields and exams', async ({ page }) => {
  const { questions } = loadE2EFixture()
  await page.goto('/')
  await page.getByRole('tab', { name: '条件を指定', exact: true }).click()
  const count = page.locator('.condition-submit strong')
  await expect(count).toHaveText(`${questions.length}問`)
  const fields = page.getByRole('group', { name: '出題範囲', exact: true })
  const exams = page.getByRole('group', { name: '対象模試', exact: true })
  await fields.getByRole('checkbox', { name: '全選択', exact: true }).uncheck()
  await fields.getByRole('checkbox', { name: '日本の遺産', exact: true }).check()
  await expect(count).toHaveText(`${questions.filter(q => q.major_category_code === 'japan').length}問`)
  await exams.getByRole('checkbox', { name: '全選択', exact: true }).uncheck()
  await exams.getByRole('checkbox', { name: '1', exact: true }).check()
  await expect(count).toHaveText(`${questions.filter(q => q.exam_number === 1 && q.major_category_code === 'japan').length}問`)
})
