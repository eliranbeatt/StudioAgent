import { test, expect, Page } from '@playwright/test'

async function resolveProjectId(page: Page): Promise<string> {
  await page.goto('/projects')
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible({ timeout: 15000 })

  const existingProject = page.locator('a[href*="/projects/"][href$="/agent"]').first()
  if (await existingProject.count()) {
    const href = await existingProject.getAttribute('href')
    const match = href?.match(/^\/projects\/([^/]+)\/agent$/)
    if (match?.[1]) return match[1]
  }

  await page.getByRole('button', { name: 'New Project' }).click()
  await expect(page.getByRole('heading', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: 'Save Project' }).click()
  await expect(page).toHaveURL(/\/projects\/[^/]+\/agent/, { timeout: 20000 })

  const match = page.url().match(/\/projects\/([^/]+)\/agent/)
  if (!match?.[1]) throw new Error('Could not resolve project id')
  return match[1]
}

test.describe('Flow Agent', () => {
  test('FF-01: Flow Agent page is reachable', async ({ page }) => {
    const projectId = await resolveProjectId(page)
    await page.goto(`/projects/${projectId}/flow-agent`)

    const heading = page.getByRole('heading', { name: 'Flow Agent' })
    const disabled = page.getByText('Flow Agent is currently disabled.')
    const backendDisabled = page.getByText(/Backend is disabled/i)

    await expect(heading.or(disabled).or(backendDisabled)).toBeVisible({ timeout: 15000 })
  })

  test('RUN-01: Start creates run', async ({ page }) => {
    const projectId = await resolveProjectId(page)
    await page.goto(`/projects/${projectId}/flow-agent`)

    if (await page.getByText('Flow Agent is currently disabled.').isVisible()) {
      test.skip(true, 'Flow Agent tab is disabled by flags')
    }
    if (await page.getByText(/Backend is disabled/i).isVisible()) {
      test.skip(true, 'Flow Agent backend is disabled by flags')
    }

    await expect(page.getByText('Run status')).toBeVisible({ timeout: 15000 })

    const noRunSelected = page.getByText('No run selected')
    if (await noRunSelected.isVisible()) {
      const startButton = page.locator('label:has-text("Web pricing") + button')
      if (await startButton.isVisible()) {
        await startButton.click()
      }
    }

    await expect(page.getByRole('button', { name: 'Run next' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('No run selected')).toHaveCount(0)
  })

  test('BD-01: Questions lane interaction', async ({ page }) => {
    const projectId = await resolveProjectId(page)
    await page.goto(`/projects/${projectId}/flow-agent`)

    if (await page.getByText('Flow Agent is currently disabled.').isVisible()) {
      test.skip(true, 'Flow Agent tab is disabled by flags')
    }
    if (await page.getByText(/Backend is disabled/i).isVisible()) {
      test.skip(true, 'Flow Agent backend is disabled by flags')
    }

    await expect(page.getByRole('button', { name: /Show debug|Hide debug/i })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: 'Run next' })).toBeVisible({ timeout: 15000 })
  })
})