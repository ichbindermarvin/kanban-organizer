import { expect, type Locator, type Page } from '@playwright/test'

export async function openApp(page: Page, hash = '') {
  await page.goto(`/${hash}`)
  await expect(page.locator('.view__title')).toBeVisible()
}

export function column(page: Page, name: string): Locator {
  return page.locator('section.column', { has: page.getByRole('heading', { name, exact: true }) })
}

export function card(scope: Page | Locator, title: string): Locator {
  return scope.locator('.card', { hasText: title })
}

export async function quickCapture(page: Page, title: string) {
  await page.keyboard.press('n')
  const dialog = page.getByRole('dialog', { name: 'Neue Aufgabe' })
  await expect(dialog).toBeVisible()
  await page.keyboard.type(title)
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
}

export async function goToBoard(page: Page) {
  await page.getByRole('list', { name: 'Boards' }).getByRole('link').first().click()
  await expect(page.locator('.board')).toBeVisible()
}

/** Pointer drag (dnd-kit needs intermediate moves to activate the sensor). */
export async function dragCardTo(page: Page, source: Locator, target: Locator) {
  const from = await source.boundingBox()
  const to = await target.boundingBox()
  if (!from || !to) throw new Error('Element not visible')
  await page.mouse.move(from.x + from.width / 2, from.y + 14)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + 20, { steps: 5 })
  await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 15 })
  await page.mouse.move(to.x + to.width / 2, to.y + 64, { steps: 3 })
  await page.mouse.up()
  // Wait for the drop animation to finish before the next interaction.
  await expect(page.locator('.card--overlay')).toHaveCount(0)
}

export function nextMondayIso(): string {
  const d = new Date()
  d.setHours(12)
  const add = ((8 - d.getDay()) % 7) || 7
  d.setDate(d.getDate() + add)
  return toIso(d)
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return toIso(new Date(y!, m! - 1, d! + days, 12))
}
