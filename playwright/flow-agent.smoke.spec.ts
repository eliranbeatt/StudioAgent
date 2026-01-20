import { test, expect } from '@playwright/test'

test('projects page renders', async ({ page }) => {
  await page.goto('/projects')
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
})
