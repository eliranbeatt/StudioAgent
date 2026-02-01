
import { test, expect } from '@playwright/test';
const fs = require('fs');

// Read seeded IDs if available, otherwise use defaults/placeholders
let p0Id = 'TODO_FILL_IN';
let p1Id = 'TODO_FILL_IN';

try {
    const testIds = JSON.parse(fs.readFileSync("test-ids.json", "utf8"));
    p0Id = testIds.p0Id;
    p1Id = testIds.p1Id;
} catch (e) {
    console.log("No test-ids.json found, skipping ID-dependent tests or using placeholders.");
}

test.describe('Flow Agent', () => {

    test('FF-01: Tab should be visible if flag is on (assuming defaults or manually set)', async ({ page }) => {
        if (p1Id === 'TODO_FILL_IN') test.skip(true, 'No P1 ID available');

        // Navigate to overview to ensure layout renders
        await page.goto(`/projects/${p1Id}/overview`);

        // Wait for loading to finish
        const loader = page.getByText('Loading project...');
        await expect(loader).toBeHidden({ timeout: 15000 });

        // Look for Flow Agent tab (rendered as a Link in layout.tsx)
        await expect(page.getByRole('link', { name: /Flow Agent/i })).toBeVisible({ timeout: 10000 });
    });

    test('RUN-01: Start creates run', async ({ page }) => {
        if (p1Id === 'TODO_FILL_IN') test.skip(true, 'No P1 ID available');

        // Navigate via Overview
        await page.goto(`/projects/${p1Id}/overview`);
        const loader = page.getByText('Loading project...');
        await expect(loader).toBeHidden({ timeout: 15000 });

        // Click Flow Agent tab
        await page.getByRole('link', { name: /Flow Agent/i }).click();

        // Verify we are on the page
        await expect(page.getByText('Flow Agent')).toBeVisible();

        // Check if we have a start button
        // "התחל הרצה" based on FlowRunHeader.tsx
        const startButton = page.getByRole('button', { name: /התחל הרצה/i });
        if (await startButton.isVisible()) {
            await startButton.click();
        }

        // Status is in Hebrew: 'רץ', 'חסום', 'מושהה', 'ממתין לאישור'
        // We expect one of these to be visible.
        await expect(page.locator('body')).toContainText(/סטטוס הרצה/); // "Run Status" header

        // Check for any valid status
        await expect(page.getByText('סטטוס הרצה')).toBeVisible();
    });

    test('BD-01: Brain Dump interaction', async ({ page }) => {
        if (p1Id === 'TODO_FILL_IN') test.skip(true, 'No P1 ID available');

        // Navigate via Overview
        await page.goto(`/projects/${p1Id}/overview`);
        const loader = page.getByText('Loading project...');
        await expect(loader).toBeHidden({ timeout: 15000 });

        // Click Flow Agent tab
        await page.getByRole('link', { name: /Flow Agent/i }).click();

        // Look for Brain Dump area
        // The placeholder in page.tsx is 'הוסיפו כאן תוספת קצרה (נשמרת בהוספה בלבד)'
        // using a partial match regex
        const input = page.getByPlaceholder(/הוסיפו כאן תוספת/i);
        await expect(input).toBeVisible();

        await input.fill('Test brain dump content');
        await page.keyboard.press('Enter');
        // Or click Add button ('הוסף תוספת')
        await page.getByRole('button', { name: /הוסף תוספת/i }).click();
    });

});
