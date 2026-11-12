import { expect, test } from '@playwright/test'
import { reloadSaved } from './helpers'

// iPhone 16 Pro viewport (CSS pixels), touch input.
test.use({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true })

test('phone: tab bar, quick capture, check off in Today, more sheet', async ({ page }) => {
  await page.goto('/#/today')
  const tabbar = page.getByRole('navigation', { name: 'Schnellzugriff' })
  await expect(tabbar).toBeVisible()
  await expect(page.locator('.sidebar')).toBeHidden()

  // Quick capture with the big + button.
  await tabbar.getByRole('button', { name: 'Neue Aufgabe' }).tap()
  await page.getByRole('dialog', { name: 'Neue Aufgabe' }).getByLabel('Titel').fill('Milch kaufen')
  await page.getByRole('radio', { name: 'Geplant' }).tap()
  await page.getByRole('button', { name: 'Speichern' }).tap()

  // Add a task for today and check it off with one tap.
  await page.getByLabel('Neue Aufgabe – Heute').fill('Anrufen')
  await page.keyboard.press('Enter')
  const row = page.locator('.row', { hasText: 'Anrufen' })
  await row.getByRole('button', { name: '„Anrufen“ als erledigt markieren' }).tap()
  await expect(row).toHaveCount(0)

  // The board shows one column per screen width; no horizontal page overflow (tab bar stays on screen).
  await tabbar.getByRole('link', { name: 'Board' }).tap()
  await expect(page.locator('.board')).toBeVisible()
  expect(await page.evaluate(() => window.innerWidth)).toBe(402)
  await expect(page.locator('section.column', { hasText: 'Milch kaufen' })).toHaveCount(1)
  await expect(tabbar).toBeInViewport()

  // More sheet: settings.
  await tabbar.getByRole('button', { name: 'Mehr' }).tap()
  await page.getByRole('dialog', { name: 'Mehr' }).getByRole('button', { name: 'Einstellungen' }).tap()
  await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible()

  await reloadSaved(page)
  await tabbar.getByRole('link', { name: 'Board' }).tap()
  await expect(page.locator('section.column', { hasText: 'Milch kaufen' })).toHaveCount(1)
})

test('phone: opening a task does not pop up the keyboard', async ({ page }) => {
  await page.goto('/#/today')
  await page.getByLabel('Neue Aufgabe – Heute').fill('Termin')
  await page.keyboard.press('Enter')
  await page.locator('.row__main', { hasText: 'Termin' }).tap()
  const drawer = page.getByRole('dialog', { name: 'Aufgabendetails' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByLabel('Titel')).not.toBeFocused()
})
