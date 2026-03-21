---
name: me28-drift-analyzer
description: >
  Analysiert Bosch ME2.8 Flash-Dateien (.bin/.FLS, 524288 Bytes) auf Drift-Tuning-Qualität.
  IMMER verwenden wenn der Nutzer eine ME2.8, ME2.8.1 oder M113/M112 Flash-Datei analysieren,
  bewerten oder vergleichen möchte — auch bei Begriffen wie "ECU prüfen", "Tune bewerten",
  "Drift-Parameter checken", "Flash vergleichen", "was hat der Tuner gemacht", oder wenn
  eine .bin/.FLS Datei hochgeladen wird die 524288 Bytes groß ist.
  Erkennt SW-Varianten (87200000/88200000/88800000), prüft alle Drift-relevanten Parameter
  (NMAX, Soft-Limiter, KSVMAX, SAS, ASR, EGR, KFMDRED CAN-ASR, Zündwinkel) mit Mirror-Check
  und gibt eine Qualitätsbewertung mit konkreten Fehlern aus.
---

# ME2.8 Drift Analyzer Skill

## Übersicht

Dieses Skill analysiert Bosch ME2.8 Flash-Dateien auf Drift-Tuning-Vollständigkeit und -Qualität.
Basis: Reverse-Engineering-Arbeit an realen M113 Drift-Projekten (5.0L und 5.5L).

## Vorbedingungen

- Flash-Datei muss exakt **524288 Bytes** (512KB) sein
- Formate: `.bin`, `.FLS`
- Unterstützte SW-Varianten: 87200000, 88200000, 88200001, 88800000

---

## Workflow

### 1. Datei einlesen

```python
with open(filepath, 'rb') as f:
    buf = bytearray(f.read())

assert len(buf) == 524288, f"Ungültige Größe: {len(buf)}"
```

### 2. SW-Variante erkennen

Lese Versionsstring @ `0x7FFB0` (20 Bytes), suche nach SW-Nummer:

| SW-Nummer | Motor | Adressversatz (shift) |
|-----------|-------|-----------------------|
| 87200000  | 5.0L  | -0x027C               |
| 88200000  | 5.5L  | 0                     |
| 88200001  | 5.5L  | 0                     |
| 88800000  | 5.0L  | 0                     |

Der Adressversatz wird auf **alle** Parameteradressen addiert.

Bosch Teilenummer: ASCII-Bytes @ `0x7FFE9`–`0x7FFF5` (alphanumerisch filtern)

### 3. Mirror-Konstanten

```
M1 = 0x8000   # Mirror 1 Offset
M2 = 0x60000  # Mirror 2 Offset
```

Alle Parameter müssen in Primary, Mirror1 (+M1), Mirror2 (+M2) identisch sein.

### 4. Mirror-Integrität (Gesamtprüfung)

```python
diff_m1 = sum(1 for i in range(0x8000) if buf[0x10000+i] != buf[0x10000+i+M1])
diff_m2 = sum(1 for i in range(0x8000) if buf[0x10000+i] != buf[0x10000+i+M2])
# Grenzwert: < 100 Bytes Differenz = OK
```

> ⚠ Mehr als 100 Bytes Differenz → möglicherweise korruptes Flash, **nicht verwenden**

---

## Parameter-Referenz

Alle Adressen für SW 88x00000 (Basisreferenz). Bei 87200000: `addr - 0x027C`.

### NMAX Hard-Limiter

| Parameter | Adresse  | Größe | Drift-Soll | Stock-Range  | Beschreibung         |
|-----------|----------|-------|-----------|--------------|----------------------|
| NMAXAT    | 0x12DC2  | uint16 | 6600 rpm  | 100–300      | Automatik-Limiter    |
| NMAXD     | 0x12DC4  | uint16 | 6600 rpm  | 80–200       | Drive-Limiter        |
| NMAXGNL   | 0x12DC6  | uint16 | 6600 rpm  | 80–200       | Gang N/L             |
| NMAXK     | 0x12DC8  | uint16 | 6600 rpm  | 80–200       | Kick-down            |
| NMAXR     | 0x12DCA  | uint16 | 6600 rpm  | 80–200       | Rückwärts            |
| NMAXWF    | 0x12DDC  | uint16 | 6500 rpm  | 60–120       | Wählhebel frei       |

### Soft-Limiter Block

| Parameter  | Adresse  | Größe  | Drift-Soll   |
|------------|----------|--------|--------------|
| FWNMAXWF   | 0x16B06  | uint16 | 6500 rpm     |
| FWNTOEL    | 0x16B08  | uint16 | 6500 rpm     |
| FWTNMAXK   | 0x16B12  | uint16 | 200 ms       |
| FWTRAMP    | 0x16B14  | uint16 | 200 ms       |
| FWVMAXD    | 0x16B16  | uint16 | 0            |
| FWVMAXR    | 0x16B18  | uint16 | 0            |
| FWWNMAXD   | 0x16B1A  | uint16 | 6400 rpm     |
| FWWNMAXKA  | 0x16B1C  | uint16 | 6600 rpm     |
| FWWNMAXKH  | 0x16B1E  | uint16 | 6600 rpm     |
| FWWNMAXR   | 0x16B20  | uint16 | 6200 rpm     |
| KLAMDRED   | 0x16B22  | uint16 | 0            |
| VMAXOG[0]  | 0x16B32  | uint16 | 0xFFFF       |
| VMAXOG[1]  | 0x16B34  | uint16 | 0xFFFF       |
| VMAXOG[2]  | 0x16B36  | uint16 | 0xFFFF       |
| VMAXOG[3]  | 0x16B38  | uint16 | 0xFFFF       |
| VMAXOG[4]  | 0x16B3A  | uint16 | 0xFFFF       |
| VMAXOG[5]  | 0x16B3C  | uint16 | 0xFFFF       |
| VMAXOG[6]  | 0x16B3E  | uint16 | 0xFFFF       |
| VMAXOG[7]  | 0x16B40  | uint16 | 0xFFFF       |

### Geschwindigkeitsbegrenzer

| Parameter  | Adresse         | Drift-Soll | Faktor  |
|------------|-----------------|-----------|---------|
| KSVMAX[0]  | 0x15134         | 0xFFFF    | ×0.1 km/h |
| KSVMAX[1]  | 0x15136         | 0xFFFF    | ×0.1 km/h |
| KSVMAX[2]  | 0x15138         | 0xFFFF    | ×0.1 km/h |
| KSVMAX[3]  | 0x1513A         | 0xFFFF    | ×0.1 km/h |
| KSVMAX[4]  | 0x1513C         | 0xFFFF    | ×0.1 km/h |
| KSVMAX[5]  | 0x1513E         | 0xFFFF    | ×0.1 km/h |

### Schubabschaltung (SAS)

| Parameter | Adresse  | Drift-Soll | Hinweis                        |
|-----------|----------|-----------|--------------------------------|
| SWSCHUB3  | 0x132A2  | 0         | Enable-Flag, muss = 0          |
| SWSCHUB4  | 0x132A4  | 0         | Hysterese, muss = 0            |

### Wandlerschutz (Automatikgetriebe)

| Parameter | Adresse  | Größe | Drift-Soll |
|-----------|----------|-------|-----------|
| VNMAXRF   | 0x13BA2  | uint8 | 0         |

### ASR Temperatur-Threshold

| Parameter | Adresse  | Größe | Drift-Soll | Stock    |
|-----------|----------|-------|-----------|---------|
| TMASR     | 0x16548  | uint8 | 255 (°C)  | 25–80°C |

---

## Kennfeld-Prüfungen

### KFAGR — Abgasrückführung [8×8 = 64 Bytes]
- Adresse: `0x105E8`
- **Drift-Soll**: Alle 64 Bytes = 0x00
- Kein Mirror erforderlich (einmalig)

### KFMDRED — CAN-ASR Torque-Reduction [37 × uint16]
- Adresse: `0x10D52`, Länge: 74 Bytes
- **Drift-Soll**: Alle 37 Wörter = 0xFFFF
- Mirror-Check: Primary, +M1, +M2
- **Kritisch:** Wenn nicht 0xFFFF → ABS regelt Drehmoment in Kurven herunter!

### Sekundäre Torque-Tabelle [12 × uint16]
- Adresse: `0x153C8`, Länge: 24 Bytes
- **Drift-Soll**: Alle 12 Wörter = 0xFFFF
- Mirror-Check erforderlich

### KFZW — Zündwinkel Hauptkennfeld [16×16 = 256 Bytes]
- Adresse: `0x12864`
- Faktor: 1 raw = 0.75°
- Qualitätsprüfung: Wenn > 200 Zellen = 0 → verdächtig leer
- Mirror-Check: Primary, +M1, +M2

### KFZWZA — Zündwinkel ZA [16×16 = 256 Bytes]
- Adresse: `0x126E4`
- Gleiche Prüfung wie KFZW

---

## Bewertungslogik

```python
def get_status(value, drift_soll, stock_range):
    if value == drift_soll:       return "ok"      # Drift korrekt
    if stock_range[0] <= value <= stock_range[1]:
                                   return "stock"   # Original-Wert
    return "bad"                                    # Ungültig/Fehlerhaft
```

**Qualitäts-Score:**
```
score = (ok_params + ok_maps) / (total_params + total_maps) * 100
```

- **≥ 80%** → Drift-tauglich
- **50–79%** → Teilweise angepasst, Nacharbeit nötig
- **< 50%** → Nicht rennstreckentauglich

---

## Häufige Fehler & Diagnose

| Symptom | Ursache | Parameter |
|---------|---------|-----------|
| ABS regelt Leistung in Kurven | KFMDRED nicht deaktiviert | `0x10D52` → 0xFFFF |
| Motor läuft nicht hoch | NMAX zu niedrig oder korrupt | `0x12DC2`–`0x12DCA` |
| Schubabschalten beim Driften | SAS aktiv | `0x132A2`/`0x132A4` → 0 |
| ASR greift nach 2 Min ein | TMASR zu niedrig | `0x16548` → 255 |
| Tacho tot nach ABS-Abklemmen | Hardware: ABS-CAN → Kombi | Nicht im ECU lösbar |
| Mirror-Inkonsistenz | Fehlerhafter Flash-Vorgang | Neue Datei beschaffen |
| NMAX-Werte Datenmüll | Falsche SW-Variante | Adressversatz prüfen |

---

## Ausgabeformat

Strukturiere die Ausgabe so:

```
=== ME2.8 DRIFT ANALYZER ===
SW: 88800000 | 5.0L | Gen3 | TN: 1037350549
Mirror-Integrität: ✓ OK (P↔M1: 0B, P↔M2: 0B)

QUALITÄTS-SCORE: 87% ✓ Drift-tauglich

KRITISCHE PROBLEME:
  ✗ KFMDRED @ 0x10D52: 37/37 Wörter ≠ 0xFFFF → ABS-Eingriff aktiv!

PARAMETER-ÜBERSICHT:
  [NMAX] NMAXAT: 6600✓  NMAXD: 6600✓  ...
  [SOFT] FWNMAXWF: 6500✓  ...
  [SAS]  SWSCHUB3: 0✓  SWSCHUB4: 0✓
  [ASR]  TMASR: 255°C✓
  [EGR]  KFAGR: 64/64 Bytes = 0 ✓
  [ZWK]  KFZW: Ø 42.3° | KFZWZA: Ø 38.1°

MIRROR-STATUS:
  NMAXWF: ! M1=10280 M2=10280 (≠ Primary=6500)
```

---

## Bekannte Adress-Besonderheiten

- **87200000**: Versatz -0x027C für alle bekannten Adressen. NMAX-Block bei `0x12B46` statt `0x12DC2`. SWSCHUB bei `0x13026`. TMASR bei `0x162CC`.
- **KFZWOPT** (`0x1645C`): Mirror2 (`0x7645C`) kann abweichende Kartendaten haben — nur Primary + Mirror1 anpassen.
- **VNMAXDF** (`0x13BA1`): Bei manuellem Getriebeumbau auf 0 setzen (wie VNMAXRF).
- **SWSCHUB4**: Wert `0xFF02` (= -254 signed) ist normaler Stock-Wert für 5.5L ECU.

---

Für das React/Browser-Tool: siehe `references/react-tool.md`
