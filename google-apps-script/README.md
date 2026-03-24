# Flash File Collector — Installationsanleitung

## Schritt 1 — Google Drive Ordner anlegen

1. Gehe zu https://drive.google.com
2. Neuen Ordner anlegen: "ME2.8 Flash Collection"
3. Den Ordner öffnen
4. Die **Ordner-ID** aus der URL kopieren:
   ```
   https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrS
                                          ^^^^^^^^^^^^^^^^^^^^
                                          das ist die Ordner-ID
   ```

## Schritt 2 — Google Sheets anlegen

1. Gehe zu https://sheets.google.com
2. Neue leere Tabelle anlegen: "ME2.8 Flash Log"
3. Die **Sheets-ID** aus der URL kopieren:
   ```
   https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrS/edit
                                          ^^^^^^^^^^^^^^^^^^^^
                                          das ist die Sheets-ID
   ```

## Schritt 3 — Apps Script einrichten

1. Gehe zu https://script.google.com
2. Klicke "Neues Projekt"
3. Benenne es: "ME2.8 Drift Collector"
4. Lösche den vorhandenen Code komplett
5. Kopiere den gesamten Inhalt von `collector.gs` hinein
6. Ersetze in der CONFIG die beiden IDs:
   ```javascript
   DRIVE_FOLDER_ID: "deine-ordner-id-hier",
   SHEETS_ID:       "deine-sheets-id-hier",
   ```
7. Speichern (Strg+S)

## Schritt 4 — Als Web App deployen

1. Klicke oben rechts auf "Deployen" → "Neue Deployment"
2. Klicke auf das Zahnrad-Symbol → "Web App"
3. Einstellungen:
   - Beschreibung: "ME2.8 Collector v1"
   - Ausführen als: **Ich** (dein Google-Account)
   - Zugriff: **Jeder** (damit das Tool von außen posten kann)
4. Klicke "Deployen"
5. Google fragt nach Berechtigungen → "Zugriff erlauben" klicken
6. Die **Web App URL** kopieren — sieht so aus:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

## Schritt 5 — URL ins Tool eintragen

Diese URL musst du ins Drift Analyzer Tool eintragen.
Gib sie Nils Dietrich / KFZ Dietrich weiter für die Tool-Integration.

## Schritt 6 — Testen

Die URL im Browser aufrufen (GET-Request):
```
https://script.google.com/macros/s/AKfycb.../exec
```
Antwort sollte sein:
```json
{"status": 200, "message": "ME2.8 Collector aktiv", "version": "1.0"}
```

## Was wird gespeichert?

### Google Drive (Ordner "ME2.8 Flash Collection")
```
2026-03-24_14-30-00_88800000_Score87pct_M113_Drift_v6.bin
```

### Google Sheets (Tabelle "ME2.8 Flash Log")
| Datum/Zeit | Dateiname | SW-Variante | Score | Motor | Mirror OK | Drive-URL |
|---|---|---|---|---|---|---|
| 2026-03-24_14:30 | ... | 88800000 | 87 | 5.0L | Ja | Link |
