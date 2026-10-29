# Kanban Organizer

Ein persönliches, lokales Kanban- und To-do-Werkzeug für den täglichen Gebrauch am Desktop.
Kein Jira-, Asana- oder Trello-Klon: wenige Funktionen, dafür schnelle Kernabläufe.

- **Aufgaben in Sekunden erfassen**: `N` → Titel → `Enter`
- **Heute-Ansicht**: Überfälliges, heute Fälliges und laufende Arbeit auf einen Blick
- **Farbige Karten**: 8 Farben zur freien Markierung, direkt über das Kartenmenü oder im Drawer
- **Kanban-Board**: Backlog ⇢ Inbox → Geplant (darunter optional Blockiert) → In Arbeit → Erledigt, mit sichtbaren Flow-Pfeilen, Drag-and-drop und Tastaturbedienung
- **Wiederkehrende Aufgaben**: täglich, wöchentlich, monatlich oder benutzerdefiniert
- **Lokal und privat**: alle Daten bleiben im Browser (IndexedDB), kein Konto, keine Cloud, kein Tracking
- **Backup**: versionierter JSON-Export und geprüfter Import
- Deutsch und Englisch, helles und dunkles Design, als PWA installierbar

## Installation

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install
```

## Entwicklung

```bash
npm run dev
```

Öffnet die App unter http://localhost:5173. Im Entwicklungsmodus wird eine leere Datenbank mit Beispieldaten gefüllt.
Ein Production-Build startet immer leer.

## Build

```bash
npm run build
npm run preview
```

Das Ergebnis in `dist/` ist eine rein statische Website und läuft auf jedem Webserver.
Für einen Unterpfad (z. B. GitHub Pages) wird `BASE_PATH` gesetzt:

```bash
BASE_PATH=/kanban-organizer/ npm run build
```

## Tests

```bash
npm run test        # Unit- und Komponententests (Vitest + React Testing Library)
npm run test:e2e    # End-to-End-Tests (Playwright, Chromium)
npm run lint        # ESLint
npm run typecheck   # TypeScript
```

Einmalig für E2E: `npx playwright install chromium`.

## Bedienung

| Taste | Aktion |
| --- | --- |
| `N` | Neue Aufgabe (Quick Capture, Ziel standardmäßig Inbox) |
| `/` | Suche |
| `Strg/⌘ + K` | Befehlspalette |
| `E` | Fokussierte Aufgabe öffnen |
| `X` | Fokussierte Aufgabe erledigen / wieder öffnen |
| `D` | Fokussierte Aufgabe duplizieren |
| `1` / `2` | Heute / Board |
| `Leertaste` auf dem Griff | Karte aufnehmen, mit Pfeiltasten verschieben, mit Leertaste ablegen |
| `Esc` | Dialog oder Drawer schließen |
| `?` | Übersicht der Tastenkürzel |

Kürzel greifen nicht, solange der Fokus in einem Eingabefeld liegt.
Alles, was per Drag-and-drop geht, geht auch über das Menü „⋯ → Verschieben nach …“ oder das Status-Feld im Drawer.

**Aufgaben wiederverwenden:** „Duplizieren“ legt eine Kopie direkt unter dem Original an und öffnet sie. Bei erledigten oder archivierten Aufgaben heißt die Aktion „Erneut verwenden“. Die Kopie landet dann ohne Deadline in der Inbox. Subtasks werden in der Kopie immer zurückgesetzt.

## Architektur

```
React-Komponenten (src/features/*/components)
        │  lesen State, rufen Aktionen auf
        ▼
Application State (Zustand, src/state/appStore.ts)
        │  Optimistic UI: State sofort ändern, dann speichern
        │  Fachlogik als reine Funktionen (src/features/*/services)
        ▼
Repository Layer (src/db/repositories/types.ts)
        │  TaskRepository, BoardRepository, ColumnRepository, SettingsRepository
        ▼
Dexie-/IndexedDB-Adapter (src/db/repositories/dexieRepositories.ts)
```

- **Keine Komponente greift direkt auf Dexie zu.** Die UI kennt nur den Store, der Store kennt nur die Repository-Interfaces.
- **Fachlogik ist UI-frei und getestet**, zum Beispiel `calculateNextOccurrence`, `moveTask`, `selectToday`, `filterTasks`, `searchTasks`, `parseBackup`, `wouldExceedWip` und `duplicateTask`.
- **Schlägt ein Schreibvorgang fehl**, lädt der Store den letzten gespeicherten Stand neu und zeigt eine verständliche Meldung. So bleiben Anzeige und Datenbank konsistent.
- **Datenmodelle sind Zod-Schemas** (`src/features/tasks/models/schemas.ts`). Daraus werden die TypeScript-Typen abgeleitet, und dieselben Schemas validieren Importe und Wiederholungsregeln.

Projektstruktur:

```
src/
  app/            App-Shell, Sidebar, Routing (Hash), globale Shortcuts, Seed-Daten
  state/          Zustand-Store (Application State)
  db/             Dexie-Datenbank, Migrationen, Repositories
  features/
    tasks/        Datenmodell, Task-Operationen, Karte, Drawer, Tags, Subtasks
    board/        Board, Spalten, Drag-and-drop, Verschiebe-Logik, WIP
    today/        Heute-Ansicht und Smart Views
    recurrence/   Wiederholungslogik und -Editor
    filters/      Filter und Sortierung
    search/       Suche
    archive/      Archiv
    settings/     Einstellungen, Backup Export/Import
    command/      Quick Capture, Befehlspalette, Tastenkürzel-Hilfe
  shared/         i18n, UI-Bausteine, Hooks, Hilfsfunktionen
  styles/         Design-Tokens und Styles (helles/dunkles Design)
e2e/              Playwright-Tests
```

## Daten

- **Lokale Speicherung:** IndexedDB im Browser, Tabellen `boards`, `columns`, `tasks` und `settings`. Jede Änderung wird sofort automatisch gespeichert, einen Speichern-Button gibt es nicht.
- **Kein Account, kein Cloud-Sync, keine Telemetrie:** Aufgabeninhalte verlassen den Browser nie.
- **Daten gehören zur Adresse und zum Browser:** Wer die App unter einer anderen URL oder in einem anderen Browser öffnet, sieht ein leeres Board. Zum Umziehen dient Export/Import.
- **Speicherschutz:** Beim Start bittet die App den Browser um dauerhaften Speicher (`navigator.storage.persist()`). Edge und Chrome entscheiden das ohne Rückfrage. In Firefox geschieht es nur auf Knopfdruck in den Einstellungen, weil Firefox dafür einen Dialog zeigt. Als installierte PWA ist der Schutz am zuverlässigsten.
- **Backup:** Einstellungen → „Daten exportieren“ speichert eine versionierte JSON-Datei (`schemaVersion`). Sobald einige Aufgaben existieren, erinnert die Sidebar, wenn das letzte Backup älter als 7 Tage ist (oder noch keines existiert).
- **Import:** Die Datei wird geparst und vollständig validiert: Struktur, Schema-Version, doppelte IDs, Verweise auf Boards und Spalten, Wiederholungsregeln. Danach fragt die App nach. Vor dem Ersetzen wird automatisch ein Backup des aktuellen Stands heruntergeladen. Das Ersetzen selbst läuft in einer einzigen Transaktion: Schlägt es fehl, bleibt die Datenbank unverändert.
- **Schema-Migrationen:** `src/db/migrations/index.ts` (IndexedDB) und `BACKUP_MIGRATIONS` in `src/features/settings/services/backup.ts` (Backup-Dateien). Versionen werden nur angehängt, nie verändert. Beispiel: Version 2 ergänzt die Backlog-Spalte, Version 3 die Spalte „Blockiert“, jeweils ohne Aufgaben anzufassen. Auch ältere Backups ohne Backlog werden beim Import automatisch ergänzt.

## Wiederkehrende Aufgaben

Eine wiederkehrende Aufgabe braucht ein Startdatum, also eine Deadline. Ohne Deadline bittet der Drawer darum, statt still eine anzunehmen.

Wird eine Instanz erledigt (Spalte „Erledigt“, Kreis-Button, `X` oder Status-Feld):

1. Die aktuelle Aufgabe bleibt als erledigte, historische Aufgabe erhalten (`completedAt`).
2. Es entsteht **genau eine** neue Aufgabe in **„Geplant“**. Sie übernimmt Titel, Beschreibung, Priorität, Tags, Regel und Subtasks (alle offen). Neue Instanzen sind per Definition eingeplant, deshalb immer „Geplant“.
3. Alle Instanzen teilen sich eine `recurrenceSeriesId`.

**Berechnung der nächsten Deadline** (`src/features/recurrence/services/nextOccurrence.ts`):

- **Die Serie behält ihren Rhythmus**, maßgeblich ist die geplante Deadline, nicht das Erledigt-Datum. Beispiel: fällig Montag 10.08., erledigt Mittwoch 12.08. → nächste Instanz Montag 17.08.
- **Die nächste Instanz liegt immer nach heute und nach der aktuellen Deadline.** Eine 30 Tage liegen gebliebene tägliche Aufgabe erzeugt deshalb nach dem Abschluss genau eine neue Aufgabe für morgen und keine 30 nachgeholten.
- **Früher erledigt:** Die nächste Instanz richtet sich nach der Deadline. Fällig am 25., erledigt am 19., täglich → nächste am 26.
- **Monatsende:** Gibt es den Tag im Monat nicht, gilt der letzte Tag des Monats. Die Regel merkt sich den Originaltag: 31.01. → 28.02. (bzw. 29.02.) → 31.03. → 30.04.
- **Wöchentlich mit Intervall:** „Alle 2 Wochen am Freitag“ zählt Wochen ab der Woche der Deadline (Wochenbeginn Montag).
- **Enddatum:** Liegt die nächste Instanz danach, entsteht keine neue.
- **Kein Duplikat:** Wird eine erledigte Instanz wieder geöffnet und erneut erledigt, entsteht keine zweite Folgeaufgabe, solange die Serie schon einen offenen Nachfolger hat.
- **Wiederholung beenden:** Die aktuelle Aufgabe bleibt bestehen, es entstehen keine weiteren Instanzen, die Historie bleibt unverändert.

## Weitere Produktentscheidungen

- **Mehrere Boards (bis zu 3):** Die Boards stehen in der Sidebar. Über „⋯“ lassen sie sich umbenennen oder löschen, das Löschen lässt sich rückgängig machen. Das letzte Board kann nicht gelöscht werden. Jedes neue Board startet mit den Standardspalten. „Heute“, „Überfällig“ und „Hohe Priorität“ zeigen Aufgaben aus allen Boards, mit dem Board-Namen an der Aufgabe. Board, Filter und Quick Capture beziehen sich auf das aktive Board, in Quick Capture lässt sich das Board aber wählen.
- **Spalten umbenennen:** über „⋯“ an der Spalte. Leer lassen stellt den Standardnamen wieder her. Die Logik (z. B. „Erledigt“ setzt `completedAt`) hängt an der festen Rolle der Spalte, nicht am Namen. Umbenennen ist deshalb gefahrlos.

- **Backlog** steht vor der Inbox, optisch abgesetzt (gestrichelt, größerer Abstand, gestrichelter Pfeil). Er ist der Ort für „irgendwann“-Ideen, die den Arbeitsfluss nicht belasten sollen. Er lässt sich einklappen, Karten können auch auf den eingeklappten Backlog gezogen werden. Ohne eigene Wahl startet er bei Fensterbreiten unter 1400 px eingeklappt, danach gilt die gespeicherte Einstellung. Quick Capture (`N`) kann direkt in den Backlog speichern, Standard bleibt die Inbox.
- **Backlog-Aufgaben in „Heute“:** Hat eine Backlog-Aufgabe eine Deadline, erscheint sie in „Heute“, aber leicht ausgegraut und nach den Aufgaben aus dem Arbeitsfluss.
- **Farb-Bedeutungen:** In den Einstellungen kannst Du jeder Farbe eine eigene Bedeutung geben (z. B. Blau = Arbeit). Sie erscheint als Text auf der Karte, in der Farbauswahl und im Filter. So ist Farbe nie die einzige Information. Der Filter „Farbe“ kann mit allen anderen Filtern kombiniert werden, inklusive „Ohne Farbe“.
- **Kartenfarben** sind rein visuell und frei verwendbar: farbiger Streifen links plus leichte Tönung, die im hellen und dunklen Design funktioniert. Duplikate und neue Instanzen wiederkehrender Aufgaben übernehmen die Farbe.
- **„Blockiert“** teilt sich die Spalte mit „Geplant“: beide je halbe Höhe, „Blockiert“ darunter, mit etwas dunklerem Hintergrund. Angedeutete (gestrichelte) Pfeile führen von „Inbox“, „Geplant“ und „In Arbeit“ hinein, nicht von „Erledigt“. Die Spalte lässt sich pro Board zu einer schmalen Leiste einklappen, dann nutzt „Geplant“ fast die volle Höhe. Karten können auch auf die eingeklappte Leiste gezogen werden. Blockierte Aufgaben gelten als offen und erscheinen bei Fälligkeit in „Heute“. Die Spalte ist umbenennbar und wird bei bestehenden Boards per Migration (Version 3) ergänzt.
- **Flow-Pfeile** zwischen den Spalten zeigen die Richtung des Arbeitsflusses. Sie sind rein dekorativ, für Screenreader ist der Fluss als Gruppenname des Boards hinterlegt („Arbeitsfluss: Backlog → Inbox → …“).

- **Wiedereröffnete Aufgaben** (Kreis-Button bei einer erledigten Aufgabe) gehen zurück nach „Geplant“.
- **Erledigte Aufgaben** landen oben in „Erledigt“, das Neueste zuerst.
- **Löschen** markiert eine Aufgabe als gelöscht (`deletedAt`) und bietet „Rückgängig“ an. Die Markierung bleibt gespeichert, damit ein späterer Sync Löschungen auf andere Geräte übertragen kann.
- **Archivieren** blendet erledigte Aufgaben vom Board aus. Sie bleiben durchsuchbar und lassen sich wiederherstellen.
- **WIP-Limits** sind weich: Beim Überschreiten fragt die App nach. Standard ist 3 für „In Arbeit“, änderbar in den Einstellungen.
- **Filter:** Innerhalb einer Kategorie gilt ODER, zwischen Kategorien UND. „Diese Woche“ bedeutet: fällig ab heute bis Sonntag.
- **Suche** zeigt eine globale Ergebnisliste über Board und Archiv, die sich beim Tippen aktualisiert. Sie durchsucht Titel, Beschreibung, Tags sowie Farbname und Farb-Bedeutung („arbeit“ findet alle Karten in der Farbe mit der Bedeutung „Arbeit“).

## Future Architecture (Sync-Vorbereitung)

Cloud-Sync ist bewusst nicht implementiert. Vorbereitet ist Folgendes:

- **Globale UUIDs** (`crypto.randomUUID()`) statt Auto-Increment-IDs.
- **`createdAt` und `updatedAt`** (ISO-8601) auf allen Boards, Spalten und Aufgaben. Jede Änderung aktualisiert `updatedAt`, das ist die Basis für Konflikterkennung („last write wins“ pro Objekt).
- **Löschmarkierungen** (`deletedAt`), damit Löschungen synchronisierbar sind.
- **Geordnete Schreibvorgänge:** Alle Änderungen werden in einer Warteschlange gespeichert, eine ältere Änderung kann nie eine neuere überschreiben.
- **Repository-Interfaces** (`src/db/repositories/types.ts`): Ein `RemoteTaskRepository` oder ein synchronisierender Wrapper kann ergänzt werden, ohne die UI zu ändern.
- **Mehrere Boards:** `boardId` steht an Spalten und Aufgaben, Spalten haben eine feste `role`. Gelöschte Boards bleiben als Markierung (`archivedAt`) erhalten, ihre Aufgaben als Löschmarkierung.
- **Serialisierbare Datenobjekte** und versionierte Schemas für Datenbank und Backup.

## Hosting

Die App ist eine statische Website. Optionen:

1. **Lokal:** `npm run build && npm run preview`. Dabei immer denselben Port verwenden, sonst sind die Daten unter der anderen Adresse nicht sichtbar.
2. **GitHub Pages** (eingerichtet): Jeder Push auf `main` wird nach den Unit-Tests automatisch veröffentlicht, siehe `.github/workflows/pages.yml`. Einmalig nötig: Settings → Pages → Source „GitHub Actions“. Adresse: https://ichbindermarvin.github.io/kanban-organizer/
3. **Netlify, Cloudflare Pages oder Vercel:** funktionieren auch mit privaten Repositories im Gratis-Tarif (Build: `npm run build`, Ausgabe: `dist`).

Gehostet werden nur die Programmdateien. Die Aufgaben bleiben im Browser.
