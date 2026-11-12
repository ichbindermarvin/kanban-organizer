# Cloud-Sync einrichten (Supabase)

Dauer: ca. 10–15 Minuten, einmalig. Kosten: keine (Supabase Free Plan).

**Was in der Cloud landet:** nur verschlüsselte Datenblöcke, zufällige Kennungen und Änderungszeitpunkte.
Titel, Beschreibungen, Tags, Board- und Spaltennamen verlassen Dein Gerät ausschließlich verschlüsselt
(AES-256-GCM, Schlüssel aus Deinem Sync-Passwort). Supabase kann die Inhalte nicht lesen.

> Vorher: In der App unter **Einstellungen → Daten exportieren** ein Backup speichern.

## 1. Supabase-Projekt anlegen

1. Auf <https://supabase.com> registrieren (E-Mail oder GitHub-Login).
2. **New project**:
   - Name: z. B. `kanban-organizer`
   - Database Password: ein zufälliges Passwort erzeugen lassen und im Passwortmanager ablegen
     (die App braucht es nicht).
   - Region: **Central EU (Frankfurt)**
   - Plan: **Free**
3. Warten, bis das Projekt bereit ist (1–2 Minuten).

## 2. Datenbank-Tabelle anlegen

1. Links **SQL Editor** → **New query**.
2. Den kompletten Inhalt von [`supabase/schema.sql`](../supabase/schema.sql) einfügen.
3. **Run**. Erwartet: „Success. No rows returned“.

## 3. Anmeldung per Code einstellen

Die App meldet Dich mit einem 6-stelligen Code per E-Mail an (funktioniert auch in der
installierten iPhone-App, anders als Links).

1. **Authentication → Sign In / Providers → Email**: muss aktiviert sein.
2. **Authentication → Emails → Templates**: In den Vorlagen **„Magic Link“** und **„Confirm signup“**
   den Text ersetzen durch (oder ergänzen um):

   ```html
   <h2>Dein Anmeldecode</h2>
   <p>Gib diesen Code in der Kanban-App ein: <strong>{{ .Token }}</strong></p>
   ```

   Hinweis: Der kostenlose E-Mail-Versand von Supabase ist auf wenige E-Mails pro Stunde begrenzt –
   für eine Person reicht das.

## 4. Projekt mit der App verbinden

In Supabase stehen:

- **Project URL** (z. B. `https://abcdefgh.supabase.co`) – unter **Project Settings → Data API** bzw. auf der Projektübersicht
- **Publishable Key** (beginnt mit `sb_publishable_`) – unter **Project Settings → API Keys**.
  Ältere Projekte zeigen unter „Legacy API Keys“ noch den **anon**-Key (beginnt mit `eyJ`); der funktioniert auch,
  wird von Supabase aber bis Ende 2026 abgelöst.

> Niemals den **Secret Key** (`sb_secret_…`) bzw. den alten **service_role**-Key verwenden oder weitergeben –
> beide umgehen alle Schutzregeln. Die App lehnt sie ab.

Der Publishable Key ist öffentlich gedacht: Er steckt in jeder Web-App, die Supabase nutzt. Geschützt sind
Deine Daten durch Row Level Security (jeder sieht nur eigene Zeilen) und die Ende-zu-Ende-Verschlüsselung.

**Variante A (empfohlen, dann auf jedem Gerät automatisch):** Im GitHub-Repository unter
**Settings → Secrets and variables → Actions → Variables** zwei Repository-Variablen anlegen:

| Name | Wert |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Publishable Key (`sb_publishable_…`) |

Danach unter **Actions → Deploy to GitHub Pages → Run workflow** neu veröffentlichen.

**Variante B:** Die beiden Werte in der App unter **Einstellungen → Synchronisierung** eintragen
(auf jedem Gerät einzeln).

## 5. In der App anmelden

1. **Einstellungen → Synchronisierung** → E-Mail-Adresse → **Code senden**.
2. Code aus der E-Mail eingeben → **Anmelden**.
3. **Erstes Gerät:** Sync-Passwort festlegen (mind. 10 Zeichen, gut merken oder im Passwortmanager
   speichern). Deine Aufgaben werden hochgeladen.
4. **Weitere Geräte** (z. B. iPhone): App öffnen → gleiche E-Mail → Code → **dasselbe** Sync-Passwort.
   Ein Gerät ohne eigene Aufgaben übernimmt den Stand aus der Cloud; ein Gerät mit Aufgaben führt
   seine Aufgaben mit der Cloud zusammen.

## 6. Fremde Registrierungen abschalten (empfohlen)

Nachdem Du Dich einmal angemeldet hast: **Authentication → Sign In / Providers** →
**„Allow new users to sign up“** ausschalten. Deine eigene Anmeldung funktioniert weiter; Fremde können
in Deinem Projekt keine Konten mehr anlegen (sehen könnten sie Deine Daten ohnehin nicht).

## Gut zu wissen

- **Offline:** Die App arbeitet immer lokal. Änderungen ohne Netz werden gesammelt und übertragen,
  sobald wieder eine Verbindung besteht.
- **Konflikte:** Wird dieselbe Aufgabe auf zwei Geräten geändert, gewinnt die neuere Änderung
  (pro Aufgabe bzw. Spalte/Board).
- **Pausiertes Projekt:** Supabase pausiert kostenlose Projekte nach etwa 7 Tagen ohne Nutzung. Die Daten
  bleiben erhalten; im Supabase-Dashboard **Restore project** klicken. Bis dahin arbeitet die App lokal weiter.
- **Sync-Passwort vergessen:** Die Cloud-Kopie ist dann nicht mehr lesbar. Lokale Daten und Backups
  bleiben nutzbar. Lösung: In Supabase im Table Editor die Tabelle `records` leeren, dann in der App
  abmelden, neu anmelden und ein neues Sync-Passwort festlegen.
- **Abmelden** beendet den Sync auf einem Gerät; die lokalen Daten bleiben.
