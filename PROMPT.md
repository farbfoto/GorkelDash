# GorkelDash — Implementierungs-Prompt

Baue eine lokale Web-App namens "GorkelDash" — ein tägliches Dashboard, das sich direkt aus einer Obsidian-Vault speist. Die App startet einen lokalen Express-Server und öffnet automatisch einen Browser.

## Technischer Stack

- Node.js + Express (kein Framework, kein Build-Step)
- Vanilla HTML/CSS/JS (Single-Page, kein React)
- Alle Daten werden vom Server als JSON-API bereitgestellt
- Starte mit: `node server.js`

## Vault-Konfiguration (hardcoded)

- Vault-Pfad: `/Users/kirschniakchristian/Local/CK2024ff`
- Daily Notes Ordner: `05 Regulars/Daily Notes`
- Dateinamen-Muster: `YYYY-MM-DD.md` (z.B. `2026-04-22.md`)
- Weekly Briefing: `weekly-briefing-CWxx-yyyy.md`
- Daily Briefing: `daily-briefing-YYYY-MM-DD.md`

## Struktur einer Daily Note

- Frontmatter mit: `creation date`, `tags: [daily, template]`
- Links zu: Monthly Plan, Weekly Plan, Weekly Briefing, Daily Briefing, Inbox Review
- Sections: `# Review` > `## Health & Movement`, `# Notes` > diverse Subsections
- Tasks: `- [ ] Text ➕ YYYY-MM-DD` (offen) oder `- [x] Text` (erledigt)

## Struktur eines Daily Briefings

- Frontmatter mit: `tags: [daily, briefing]`, `datum`, `wochentag`
- Erste Blockquote-Zeile: Wetter-Callout (`> ☀️ **Wetter ...**`)
- Zweite Blockquote: Tagesüberblick (`> **Tagesüberblick:** ...`)
- `## Termine` mit individuellen `### Emoji Zeit · Titel` Einträgen
- Jeder Termin: Ort, LV-Zeit (optional), Status, Kontext, Tasks

## Dashboard-Bereiche (3 Spalten, Desktop-First)

### Spalte 1: Heute

- Heutiges Datum prominent (Deutsch: "Mittwoch, 22. April 2026")
- Health & Movement Eintrag der Daily Note (falls ausgefüllt)
- Inhalt der heutigen Daily Note: alle `# Notes` Subsections als aufgeklappte Cards

#### Daily Briefing Integration

Lade `daily-briefing-YYYY-MM-DD.md` (falls vorhanden) und zeige:

1. **Wetter-Callout** — oberste Blockquote-Zeile, als farbige Pill/Badge ganz oben
2. **Tagesüberblick** — zweiter Blockquote, kursiver Callout-Block unter dem Datum
3. **Termine** — parse alle `### Emoji HH:MM ... · Titel` Sections:
   - Extrahiere: Uhrzeit (CEST), Titel, Priorität-Emoji, Ort, Kontext, Tasks
   - Timeline-Liste mit farbigen Prioritätsindikatoren (🔴 rot, 🟡 gelb, ⚪ grau)
   - Chronologisch sortiert, aktueller/nächster Termin highlighted
   - Kontext max. 3 Zeilen mit "... mehr" Toggle
4. **Briefing Tasks** — alle `- [ ]` aus dem Daily Briefing als eigene Card

Wenn kein Daily Briefing existiert: grauer Placeholder "Kein Briefing für heute".

### Spalte 2: Tasks der letzten 7 Tage

- Lese alle Daily Notes der letzten 7 Tage
- Extrahiere `- [ ]` (offen) und `- [x]` (erledigt)
- Offene Tasks gruppiert nach Datum (neueste zuerst)
- Erledigte Tasks mit grauem Strikethrough
- Quelle als kleines Badge
- Auch Tasks aus dem aktuellen Weekly Briefing (Sektion "Offene Tasks CW*")

### Spalte 3: Produktivitäts-Übersicht

- **Aktivitäts-Heatmap** (14 Tage als Grid):
  - Grün = Daily Note existiert mit Inhalt
  - Gelb = existiert aber fast leer
  - Grau = kein Eintrag
- **Task-Statistik** (letzte 7 Tage):
  - Anzahl offen/erledigt, Completion Rate als Donut (SVG)
- **Streak**: Tage in Folge mit Daily Note
- **Projekte diese Woche**: Anzahl erwähnter Notiz-Titel

## API Endpoints

- `GET /api/today` — heutige Note + Health & Movement + Notes-Subsections
- `GET /api/briefing?date=YYYY-MM-DD` — Daily Briefing strukturiert:
  ```json
  {
    "weather": "☀️ Wetter ...",
    "overview": "GCN Day 2 — ...",
    "appointments": [
      { "time": "18:00", "title": "...", "priority": "red",
        "location": "...", "context": "...", "tasks": ["..."] }
    ],
    "briefingTasks": ["..."]
  }
  ```
- `GET /api/tasks?days=7` — Tasks der letzten N Tage + Weekly Briefing Tasks
- `GET /api/stats` — Heatmap + Task-Stats + Streak
- `GET /api/note/:date` — beliebige Note

## Markdown-Parsing (kein externer Parser)

Eigener einfacher Parser der:
1. Frontmatter überspringt
2. Wikilinks `[[Name|Alias]]` → `<span class="wikilink">Alias</span>`
3. Tasks `- [ ]` / `- [x]` erkennt
4. Section-Header (#/##/###) erkennt
5. Normalen Text als `<p>`
6. Code-Blöcke und Tabellen als `<pre>` / `<table>`

## UI Design

- Dunkles Theme (Background `#1a1a2e`, Cards `#16213e`, Akzent `#e94560`)
- System-Font-Stack
- Header: Logo "GorkelDash" + Datum + "Aktualisiert: HH:MM"
- Auto-Refresh alle 60s (fetch, kein full reload)
- Refresh-Button oben rechts
- Responsive: unter 900px einspaltig

## Datei-Struktur

```
GorkelDash/
  package.json
  server.js
  public/
    index.html
    style.css
    dashboard.js
```

## Startverhalten

Nach `node server.js`: automatisch `open http://localhost:3000` (macOS).
Im Terminal: welche Vault-Dateien geladen werden.

## Edge Cases

- Keine heutige Note → "Noch kein Eintrag heute" + letzte verfügbare Note anzeigen
- Tasks mit `[[Wikilinks]]` → sauber rendern
- Tage ohne Note in Heatmap → grau (nicht skippen)
- Weekly-Briefing-Tasks separat labeln
- Fehler beim Lesen einzelner Dateien loggen, nicht crashen
