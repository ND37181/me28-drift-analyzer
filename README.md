# ME2.8 Drift Analyzer

**KFZ Dietrich — Diagnostic Tool für Bosch ME2.8 Flash-Dateien**

Ein Browser-basiertes Analyse-Tool für Bosch ME2.8 ECU Flash-Dateien (M113/M112 Motoren). Entwickelt auf Basis von Reverse-Engineering-Arbeit an realen Drift-Projekten.

---

## Features

### Automatische SW-Erkennung
| SW-Nummer | Motor | Generation |
|-----------|-------|------------|
| 87200000 | 5.0L | Gen1 (37/00) — mit Adressversatz-Korrektur |
| 88200000 | 5.5L | Gen2 (37/01) |
| 88800000 | 5.0L | Gen3 (37/02) |

### Analysierte Parameter

**NMAX Hard-Limiter**
- NMAXAT, NMAXD, NMAXGNL, NMAXK, NMAXR, NMAXWF

**Soft-Limiter Block**
- FWNMAXWF, FWNTOEL, FWTNMAXK, FWTRAMP
- FWVMAXD, FWVMAXR, FWWNMAXD, FWWNMAXKA, FWWNMAXKH, FWWNMAXR
- KLAMDRED, VMAXOG[0-7]

**Geschwindigkeitsbegrenzer**
- KSVMAX[0-5]

**Schubabschaltung (SAS)**
- SWSCHUB3, SWSCHUB4

**Wandlerschutz**
- VNMAXRF (Automatikgetriebe)

**ASR**
- TMASR (Aktivierungstemperatur)

**Kennfelder**
- KFAGR (EGR/Abgasrückführung) — Nullprüfung
- KFMDRED (CAN-ASR Drehmomenttabelle) — 0xFFFF-Prüfung
- Sekundäre Torque-Tabelle
- KFZW, KFZWZA (Zündwinkel — Durchschnitt + Qualitätsbewertung)

### Mirror-Integrität
- Byte-genaue Prüfung Primary ↔ Mirror1 ↔ Mirror2
- Einzelparameter Mirror-Status mit Ist/Soll-Werten

### Qualitäts-Score
- 0–100% Gesamtbewertung
- Sofortige Fehlerliste mit konkreten Abweichungen

---

## Verwendung

**Online:** [GitHub Pages Link nach Deployment]

**Lokal:**
```bash
git clone https://github.com/[user]/me28-drift-analyzer
cd me28-drift-analyzer
npm install
npm run dev
```

Dann `.bin` oder `.FLS` Datei (512KB / 524288 Bytes) in das Tool ziehen.

---

## Technische Grundlage

Die Parameter-Adressen und Drift-Sollwerte basieren auf umfangreichem Reverse Engineering:

- **KFMDRED** (CAN-ASR Torque-Reduction) @ `0x10D52` — in vielen Drift-Tunes vergessen, verursacht ABS-Eingriffe in Kurven
- **Adressversatz 87200000**: `+0x027C` für alle bekannten Parameteradressen
- **Mirror-Struktur**: Primary, Mirror1 (+0x8000), Mirror2 (+0x60000)
- **Zündwinkel-Faktor**: 1 raw = 0.75°

Getestet mit:
- `88800000` / 37/02 (M113 5.0L, Drift-Fahrzeug 1 & 2)
- `88200000` / 37/01 (M113 5.5L, Drift-Fahrzeug 2)
- `87200000` / 37/00 (M113 5.0L Automatik, Referenz)

---

## Datenschutz

Alle Analysen laufen **vollständig im Browser**. Es werden keine Flash-Daten übertragen oder gespeichert.

---

## Entwicklung

**KFZ Dietrich** — Hardegsen-Gladebeck  
Spezialisiert auf komplexe Diagnose, ECU-Programmierung und Mercedes-Benz Systeme.
