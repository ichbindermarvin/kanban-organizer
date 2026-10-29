import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { addDays, card, column, dragCardTo, goToBoard, nextMondayIso, openApp, quickCapture } from './helpers'

test('Flow 1 – Quick Capture with N, persists after reload', async ({ page }) => {
  await openApp(page)
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible()
  await quickCapture(page, 'Newsletter vorbereiten')
  await goToBoard(page)
  await expect(card(column(page, 'Inbox'), 'Newsletter vorbereiten')).toBeVisible()
  await page.reload()
  await expect(card(column(page, 'Inbox'), 'Newsletter vorbereiten')).toBeVisible()
})

test('Flow 2 – Kanban drag and drop survives reload', async ({ page }) => {
  await openApp(page, '#/board')
  await quickCapture(page, 'Landingpage prüfen')
  const inbox = column(page, 'Inbox')
  await expect(card(inbox, 'Landingpage prüfen')).toBeVisible()

  await dragCardTo(page, card(inbox, 'Landingpage prüfen'), column(page, 'Geplant'))
  await expect(card(column(page, 'Geplant'), 'Landingpage prüfen')).toBeVisible()

  await dragCardTo(page, card(column(page, 'Geplant'), 'Landingpage prüfen'), column(page, 'In Arbeit'))
  await expect(card(column(page, 'In Arbeit'), 'Landingpage prüfen')).toBeVisible()

  await page.reload()
  await expect(card(column(page, 'In Arbeit'), 'Landingpage prüfen')).toBeVisible()
  await expect(card(column(page, 'Inbox'), 'Landingpage prüfen')).toHaveCount(0)
})

test('Flow 2b – reorder within a column by drag and drop', async ({ page }) => {
  await openApp(page, '#/board')
  await quickCapture(page, 'Erste')
  await quickCapture(page, 'Zweite')
  const inbox = column(page, 'Inbox')
  await expect(inbox.locator('.card__title')).toHaveText(['Erste', 'Zweite'])
  const first = await card(inbox, 'Erste').boundingBox()
  const second = await card(inbox, 'Zweite').boundingBox()
  await page.mouse.move(second!.x + 60, second!.y + 14)
  await page.mouse.down()
  await page.mouse.move(second!.x + 60, second!.y + 4, { steps: 4 })
  await page.mouse.move(first!.x + 60, first!.y + 2, { steps: 12 })
  await page.mouse.up()
  await expect(inbox.locator('.card__title')).toHaveText(['Zweite', 'Erste'])
  await page.reload()
  await expect(column(page, 'Inbox').locator('.card__title')).toHaveText(['Zweite', 'Erste'])
})

test('Flow 2c – move without a mouse: keyboard drag and "Verschieben nach"', async ({ page }) => {
  await openApp(page, '#/board')
  await quickCapture(page, 'Tastatur')
  const inbox = column(page, 'Inbox')

  // Keyboard sensor: pick up with space, move right, drop with space.
  // Waiting for the screen reader announcements also verifies them.
  const live = page.locator('[id^="DndLiveRegion"]')
  await card(inbox, 'Tastatur').getByRole('button', { name: 'Verschieben nach … Tastatur' }).focus()
  await page.keyboard.press('Space')
  // "ist über Inbox" follows the pick-up once dnd-kit has measured the droppables.
  await expect(live).toHaveText('Aufgabe Tastatur ist über Inbox.')
  await page.keyboard.press('ArrowRight')
  await expect(live).toHaveText('Aufgabe Tastatur ist über Geplant.')
  await page.keyboard.press('Space')
  await expect(live).toHaveText('Aufgabe Tastatur abgelegt in Geplant.')
  await expect(card(column(page, 'Geplant'), 'Tastatur')).toBeVisible()

  // Menu alternative.
  await card(column(page, 'Geplant'), 'Tastatur').getByRole('button', { name: /Aktionen für/ }).click()
  await page.getByRole('menuitem', { name: 'Verschieben nach … Erledigt' }).click()
  await expect(card(column(page, 'Erledigt'), 'Tastatur')).toBeVisible()
})

test('Flow 3 – Today view shows a task due today', async ({ page }) => {
  await openApp(page, '#/board')
  await quickCapture(page, 'Steuer abgeben')
  await card(column(page, 'Inbox'), 'Steuer abgeben').locator('.card__main').click()
  const drawer = page.getByRole('dialog', { name: 'Aufgabendetails' })
  await drawer.getByRole('button', { name: 'Heute', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await page.getByRole('link', { name: /Heute/ }).click()
  const section = page.locator('section', { has: page.getByRole('heading', { name: /Heute fällig/ }) })
  await expect(section.getByText('Steuer abgeben')).toBeVisible()
})

test('Flow 4 – recurring task creates the next instance when completed', async ({ page }) => {
  const monday = nextMondayIso()
  await openApp(page, '#/board')
  await quickCapture(page, 'Wochenplanung')
  await card(column(page, 'Inbox'), 'Wochenplanung').locator('.card__main').click()
  const drawer = page.getByRole('dialog', { name: 'Aufgabendetails' })

  // Without a deadline the app asks for a start date instead of assuming one.
  await expect(drawer.getByText('Eine Wiederholung braucht ein Startdatum')).toBeVisible()
  await drawer.getByLabel('Deadline').fill(monday)
  await drawer.getByLabel('Wiederholung').selectOption('weekly')
  await expect(drawer.getByText(/Nächste Instanz: /)).toBeVisible()
  await page.keyboard.press('Escape')

  await card(column(page, 'Inbox'), 'Wochenplanung').getByRole('button', { name: '„Wochenplanung“ als erledigt markieren' }).click()
  await expect(page.getByText(/Nächste Instanz für .* erstellt/)).toBeVisible()

  await expect(card(column(page, 'Erledigt'), 'Wochenplanung')).toBeVisible()
  const next = card(column(page, 'Geplant'), 'Wochenplanung')
  await expect(next).toBeVisible()
  const nextMonday = addDays(monday, 7)
  const [, mm, dd] = nextMonday.split('-')
  await expect(next).toContainText(`${dd}.${mm}.`)

  await page.reload()
  await expect(card(column(page, 'Geplant'), 'Wochenplanung')).toBeVisible()
  await expect(card(column(page, 'Erledigt'), 'Wochenplanung')).toBeVisible()
})

test('Flow 5 – details are saved in the drawer', async ({ page }) => {
  await openApp(page, '#/board')
  await quickCapture(page, 'Website relaunch')
  await card(column(page, 'Inbox'), 'Website relaunch').locator('.card__main').click()
  const drawer = page.getByRole('dialog', { name: 'Aufgabendetails' })
  await drawer.getByLabel('Beschreibung').fill('Texte und Bilder abstimmen')
  await drawer.getByRole('radio', { name: 'Hoch' }).click()
  const addSubtask = drawer.getByLabel('Subtask hinzufügen')
  for (const title of ['Texte', 'Bilder', 'Freigabe']) {
    await addSubtask.fill(title)
    await addSubtask.press('Enter')
  }
  await drawer.getByLabel('Tag hinzufügen').fill('Content')
  await drawer.getByLabel('Tag hinzufügen').press('Enter')
  await drawer.getByRole('button', { name: 'Schließen' }).click()
  await expect(drawer).toBeHidden()

  await page.reload()
  const reloadedCard = card(column(page, 'Inbox'), 'Website relaunch')
  await expect(reloadedCard).toContainText('Hoch')
  await expect(reloadedCard).toContainText('0/3')
  await expect(reloadedCard).toContainText('Content')
  await reloadedCard.locator('.card__main').click()
  await expect(drawer.getByLabel('Beschreibung')).toHaveValue('Texte und Bilder abstimmen')
  await expect(drawer.getByRole('radio', { name: 'Hoch' })).toHaveAttribute('aria-checked', 'true')
  await expect(drawer.getByLabel('Subtask-Titel')).toHaveCount(3)
  await expect(drawer.getByRole('button', { name: 'Tag Content entfernen' })).toBeVisible()
})

test('Flow 6 – export and import a backup', async ({ page }) => {
  await openApp(page, '#/board')
  await quickCapture(page, 'Aufgabe A')
  await quickCapture(page, 'Aufgabe B')

  await page.getByRole('link', { name: 'Einstellungen' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Daten exportieren' }).click()
  const download = await downloadPromise
  const path = await download.path()
  const json = JSON.parse(await readFile(path, 'utf8'))
  expect(json.schemaVersion).toBe(1)
  expect(json.tasks).toHaveLength(2)

  // Change data after the export.
  await goToBoard(page)
  await quickCapture(page, 'Aufgabe C')
  await card(column(page, 'Inbox'), 'Aufgabe A').getByRole('button', { name: /Aktionen für/ }).click()
  await page.getByRole('menuitem', { name: 'Löschen' }).click()
  await expect(card(column(page, 'Inbox'), 'Aufgabe A')).toHaveCount(0)

  // An invalid file is rejected and changes nothing.
  await page.getByRole('link', { name: 'Einstellungen' }).click()
  await page.getByTestId('import-input').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion": 1, "tasks": 5}') })
  await expect(page.getByRole('alert')).toContainText('nicht verändert')

  await page.getByTestId('import-input').setInputFiles(path)
  const confirm = page.getByRole('alertdialog', { name: 'Backup importieren?' })
  await expect(confirm).toContainText('2 Aufgaben')
  const safetyDownload = page.waitForEvent('download')
  await confirm.getByRole('button', { name: 'Ersetzen und importieren' }).click()
  await safetyDownload

  await goToBoard(page)
  const inbox = column(page, 'Inbox')
  await expect(card(inbox, 'Aufgabe A')).toBeVisible()
  await expect(card(inbox, 'Aufgabe B')).toBeVisible()
  await expect(card(inbox, 'Aufgabe C')).toHaveCount(0)
  await page.reload()
  await expect(card(column(page, 'Inbox'), 'Aufgabe A')).toBeVisible()
})

test('WIP limit asks before exceeding and allows moving anyway', async ({ page }) => {
  await openApp(page, '#/board')
  for (const title of ['W1', 'W2', 'W3', 'W4']) await quickCapture(page, title)
  for (const title of ['W1', 'W2', 'W3']) {
    await card(column(page, 'Inbox'), title).getByRole('button', { name: /Aktionen für/ }).click()
    await page.getByRole('menuitem', { name: 'Verschieben nach … In Arbeit' }).click()
  }
  await expect(column(page, 'In Arbeit')).toContainText('3 / 3')
  await card(column(page, 'Inbox'), 'W4').getByRole('button', { name: /Aktionen für/ }).click()
  await page.getByRole('menuitem', { name: 'Verschieben nach … In Arbeit' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'WIP-Limit erreicht' })
  await expect(dialog).toContainText('Das WIP-Limit von 3 Aufgaben')
  await dialog.getByRole('button', { name: 'Trotzdem verschieben' }).click()
  await expect(column(page, 'In Arbeit')).toContainText('4 / 3')
})

test('search, duplicate, archive and restore', async ({ page }) => {
  await openApp(page, '#/board')
  await quickCapture(page, 'Vorlage Rechnung')
  await card(column(page, 'Inbox'), 'Vorlage Rechnung').getByRole('button', { name: /Aktionen für/ }).click()
  await page.getByRole('menuitem', { name: 'Duplizieren' }).click()
  const drawer = page.getByRole('dialog', { name: 'Aufgabendetails' })
  await expect(drawer.getByLabel('Titel')).toHaveValue('Vorlage Rechnung (Kopie)')
  await page.keyboard.press('Escape')

  await card(column(page, 'Inbox'), 'Vorlage Rechnung (Kopie)').getByRole('button', { name: /Aktionen für/ }).click()
  await page.getByRole('menuitem', { name: 'Archivieren' }).click()
  await expect(card(column(page, 'Inbox'), 'Kopie')).toHaveCount(0)

  await page.keyboard.press('/')
  await page.keyboard.type('rechnung')
  await expect(page.getByRole('heading', { name: 'Suche' })).toBeVisible()
  await expect(page.getByText('2 Treffer für „rechnung“')).toBeVisible()

  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Archiv' }).click()
  await page.locator('.row', { hasText: 'Kopie' }).getByRole('button', { name: /Aktionen für/ }).click()
  await page.getByRole('menuitem', { name: 'Wiederherstellen' }).click()
  await goToBoard(page)
  await expect(card(column(page, 'Inbox'), 'Vorlage Rechnung (Kopie)')).toBeVisible()
})

test('backlog sits in front of the inbox, accepts tasks and can be collapsed', async ({ page }) => {
  await openApp(page, '#/board')
  await expect(page.getByRole('group', { name: 'Arbeitsfluss: Backlog → Inbox → Geplant / Blockiert → In Arbeit → Erledigt' })).toBeVisible()
  await expect(page.locator('section.column h2')).toHaveText(['Backlog', 'Inbox', 'Geplant', 'Blockiert', 'In Arbeit', 'Erledigt'])

  await quickCapture(page, 'Irgendwann')
  await dragCardTo(page, card(column(page, 'Inbox'), 'Irgendwann'), column(page, 'Backlog'))
  await expect(card(column(page, 'Backlog'), 'Irgendwann')).toBeVisible()

  await page.getByRole('button', { name: 'Backlog einklappen' }).click()
  await expect(card(page, 'Irgendwann')).toHaveCount(0)
  await page.reload()
  const expand = page.getByRole('button', { name: 'Backlog ausklappen' })
  await expect(expand).toHaveAttribute('aria-expanded', 'false')

  // Dropping on the collapsed backlog appends the task.
  await quickCapture(page, 'Später')
  await dragCardTo(page, card(column(page, 'Inbox'), 'Später'), column(page, 'Backlog'))
  await expect(column(page, 'Backlog')).toContainText('2')
  await expand.click()
  await expect(column(page, 'Backlog').locator('.card__title')).toHaveText(['Irgendwann', 'Später'])
})

test('cards can be colored from the menu and the drawer; backlog tasks are dimmed in Today', async ({ page }) => {
  await openApp(page, '#/board')
  await quickCapture(page, 'Bunte Karte')
  const target = () => card(column(page, 'Inbox'), 'Bunte Karte')

  await target().getByRole('button', { name: /Aktionen für/ }).click()
  await page.getByRole('menuitemradio', { name: 'Farbe: Grün' }).click()
  await expect(target()).toHaveClass(/color-green/)

  await target().locator('.card__main').click()
  const drawer = page.getByRole('dialog', { name: 'Aufgabendetails' })
  await expect(drawer.getByRole('radio', { name: 'Grün' })).toHaveAttribute('aria-checked', 'true')
  await drawer.getByRole('radio', { name: 'Lila' }).click()
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(target()).toHaveClass(/color-purple/)

  // Backlog task with a deadline today: shown in Today, greyed out and after the flow tasks.
  await target().getByRole('button', { name: /Aktionen für/ }).click()
  await page.getByRole('menuitem', { name: 'Verschieben nach … Backlog' }).click()
  await card(column(page, 'Backlog'), 'Bunte Karte').locator('.card__main').click()
  await drawer.getByRole('button', { name: 'Heute', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: /Heute/ }).click()
  await expect(page.locator('.row', { hasText: 'Bunte Karte' })).toHaveClass(/row--dimmed/)
})

test('colors get a user-defined meaning and can be filtered', async ({ page }) => {
  await openApp(page, '#/settings')
  await page.getByLabel('Bedeutung für Blau').fill('Arbeit')
  await goToBoard(page)
  await quickCapture(page, 'Angebot schreiben')
  await quickCapture(page, 'Fahrrad reparieren')

  await card(column(page, 'Inbox'), 'Angebot schreiben').getByRole('button', { name: /Aktionen für/ }).click()
  await page.getByRole('menuitemradio', { name: 'Farbe: Blau – Arbeit' }).click()
  await expect(card(column(page, 'Inbox'), 'Angebot schreiben')).toContainText('Arbeit')

  await page.getByRole('button', { name: 'Filter' }).click()
  await page.getByRole('checkbox', { name: 'Arbeit' }).check()
  await expect(column(page, 'Inbox').locator('.card__title')).toHaveText(['Angebot schreiben'])
  await page.getByRole('checkbox', { name: 'Ohne Farbe' }).check()
  await expect(column(page, 'Inbox').locator('.card__title')).toHaveText(['Angebot schreiben', 'Fahrrad reparieren'])

  await page.reload()
  await expect(card(column(page, 'Inbox'), 'Angebot schreiben')).toContainText('Arbeit')

  // The search also finds tasks by the color's meaning.
  await page.keyboard.press('/')
  await page.keyboard.type('arbeit')
  await expect(page.getByText('1 Treffer für „arbeit“')).toBeVisible()
  await expect(page.locator('.row', { hasText: 'Angebot schreiben' })).toBeVisible()
})

test('up to three boards; boards and columns can be renamed', async ({ page }) => {
  await openApp(page, '#/board')
  const boards = page.getByRole('list', { name: 'Boards' })
  await quickCapture(page, 'Privat-Aufgabe')

  for (const name of ['Arbeit', 'Verein']) {
    await boards.getByRole('button', { name: 'Neues Board' }).click()
    await page.getByLabel('Name').fill(name)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  }
  await expect(boards.getByRole('button', { name: 'Neues Board' })).toBeDisabled()
  await expect(page.locator('section.column h2')).toHaveText(['Backlog', 'Inbox', 'Geplant', 'Blockiert', 'In Arbeit', 'Erledigt'])
  await expect(card(page, 'Privat-Aufgabe')).toHaveCount(0)

  // Rename the board via the title button and a column via its menu.
  await page.getByRole('button', { name: 'Board „Verein“ umbenennen' }).click()
  await page.getByLabel('Name').fill('Handball')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Handball' })).toBeVisible()
  await column(page, 'Inbox').getByRole('button', { name: 'Spaltenaktionen: Inbox' }).click()
  await page.getByRole('menuitem', { name: 'Spalte umbenennen' }).click()
  await page.getByLabel('Name').fill('Ideen')
  await page.keyboard.press('Enter')
  await expect(column(page, 'Ideen')).toBeVisible()

  // Quick capture goes to the active board; Today spans all boards and names the board.
  await page.keyboard.press('n')
  await page.keyboard.type('Training planen')
  await page.keyboard.press('Enter')
  await expect(card(column(page, 'Ideen'), 'Training planen')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Handball' })).toBeVisible()
  await expect(column(page, 'Ideen')).toBeVisible()
  await boards.getByRole('link', { name: 'Persönlich' }).click()
  await expect(card(column(page, 'Inbox'), 'Privat-Aufgabe')).toBeVisible()

  // Delete a board (with undo).
  await boards.getByRole('button', { name: 'Aktionen für Board „Arbeit“' }).click()
  await page.getByRole('menuitem', { name: 'Board löschen' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Board löschen' }).click()
  await expect(boards.getByRole('link', { name: 'Arbeit' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Rückgängig' }).click()
  await expect(boards.getByRole('link', { name: 'Arbeit' })).toBeVisible()
})

test('Today shows tasks of all boards with the board name', async ({ page }) => {
  await openApp(page, '#/board')
  await page.getByRole('list', { name: 'Boards' }).getByRole('button', { name: 'Neues Board' }).click()
  await page.getByLabel('Name').fill('Arbeit')
  await page.keyboard.press('Enter')
  await page.getByRole('link', { name: /Heute/ }).click()
  await page.getByLabel('Neue Aufgabe – Heute').fill('Report abgeben')
  await page.keyboard.press('Enter')
  await expect(page.locator('.row', { hasText: 'Report abgeben' })).toContainText('Arbeit · Geplant')
})

test('"Blockiert" sits below "Geplant", can be collapsed, renamed and receives drops when collapsed', async ({ page }) => {
  await openApp(page, '#/board')
  // Optional column: collapsed by default.
  await page.getByRole('button', { name: 'Blockiert ausklappen' }).click()
  const planned = column(page, 'Geplant')
  const blocked = column(page, 'Blockiert')
  const plannedOpen = (await planned.boundingBox())!
  const blockedBox = (await blocked.boundingBox())!
  // Same track, stacked: same x, blocked below planned, roughly half the height each.
  expect(Math.abs(blockedBox.x - plannedOpen.x)).toBeLessThan(2)
  expect(blockedBox.y).toBeGreaterThan(plannedOpen.y + plannedOpen.height - 1)
  expect(Math.abs(blockedBox.height - plannedOpen.height)).toBeLessThan(40)

  await quickCapture(page, 'Wartet auf Freigabe')
  await dragCardTo(page, card(column(page, 'Inbox'), 'Wartet auf Freigabe'), blocked)
  await expect(card(blocked, 'Wartet auf Freigabe')).toBeVisible()

  await page.getByRole('button', { name: 'Blockiert einklappen' }).click()
  await expect(card(page, 'Wartet auf Freigabe')).toHaveCount(0)
  const plannedFull = (await planned.boundingBox())!
  expect(plannedFull.height).toBeGreaterThan(plannedOpen.height * 1.7)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Blockiert ausklappen' })).toHaveAttribute('aria-expanded', 'false')
  await quickCapture(page, 'Zweiter Blocker')
  await dragCardTo(page, card(column(page, 'Inbox'), 'Zweiter Blocker'), column(page, 'Blockiert'))
  await expect(column(page, 'Blockiert')).toContainText('2')

  await column(page, 'Blockiert').getByRole('button', { name: 'Spaltenaktionen: Blockiert' }).click()
  await page.getByRole('menuitem', { name: 'Spalte umbenennen' }).click()
  await page.getByLabel('Name').fill('Wartet')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Wartet ausklappen' }).click()
  await expect(column(page, 'Wartet').locator('.card__title')).toHaveText(['Wartet auf Freigabe', 'Zweiter Blocker'])
})

test('"Wartet auf" is shown for blocked tasks only', async ({ page }) => {
  await openApp(page, '#/board')
  await quickCapture(page, 'Vertrag unterschreiben')
  await card(column(page, 'Inbox'), 'Vertrag unterschreiben').locator('.card__main').click()
  const drawer = page.getByRole('dialog', { name: 'Aufgabendetails' })
  await expect(drawer.getByLabel('Wartet auf')).toHaveCount(0)
  await drawer.getByLabel('Status').selectOption({ label: 'Blockiert' })
  await drawer.getByLabel('Wartet auf').fill('Unterschrift von Anna')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Blockiert ausklappen' }).click()
  await expect(card(column(page, 'Blockiert'), 'Vertrag unterschreiben')).toContainText('Wartet auf: Unterschrift von Anna')
  await page.reload()
  await expect(card(column(page, 'Blockiert'), 'Vertrag unterschreiben')).toContainText('Wartet auf: Unterschrift von Anna')

  // Found by search; hidden again once the task is no longer blocked.
  await page.keyboard.press('/')
  await page.keyboard.type('anna')
  await expect(page.locator('.row', { hasText: 'Vertrag unterschreiben' })).toContainText('Wartet auf: Unterschrift von Anna')
  await page.keyboard.press('Escape')
  await card(column(page, 'Blockiert'), 'Vertrag unterschreiben').getByRole('button', { name: /Aktionen für/ }).click()
  await page.getByRole('menuitem', { name: 'Verschieben nach … In Arbeit' }).click()
  await expect(card(column(page, 'In Arbeit'), 'Vertrag unterschreiben')).not.toContainText('Wartet auf')
})
