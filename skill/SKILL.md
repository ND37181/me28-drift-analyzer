---
name: me28-drift-analyzer
description: >
  Analysiert Bosch ME2.8 und ME2.8.1 Flash-Dateien (.bin/.FLS, 524288 Bytes) auf Drift-Tuning-Qualität.
  IMMER verwenden wenn der Nutzer eine ME2.8, ME2.8.1, M113, M113K oder M112 Flash-Datei analysieren,
  bewerten oder vergleichen möchte — auch bei Begriffen wie "ECU prüfen", "Tune bewerten",
  "Drift-Parameter checken", "Flash vergleichen", "was hat der Tuner gemacht", oder wenn
  eine .bin/.FLS Datei hochgeladen wird die 524288 Bytes groß ist.
  Erkennt automatisch ME2.8 (88x/87x) UND ME2.8.1 AMG (84xx/81xx/84xxK) über Versionsstring.
  Prüft alle Drift-relevanten Parameter (NMAX, Soft-Limiter, KSVMAX, SAS, ASR, EGR,
  KFMDRED CAN-ASR, Zündwinkel, FWVMAX) mit Mirror-Check und Qualitätsbewertung.
  Enthält Safety-Monitor für Sicherheitsfunktionen die NICHT geändert werden dürfen
  (DZWEN, ARLSD, Vollast-Lambda).
---

# ME2.8 / ME2.8.1 Drift Analyzer Skill

## Übersicht

Dieses Skill analysiert Bosch ME2.8 und ME2.8.1 Flash-Dateien auf Drift-Tuning-Vollständigkeit.
Basis: Reverse-Engineering an realen M113 Drift-Projekten (5.0L Sauger, 5.5L Kompressor AMG).
A2L-Referenzen: 8412K000.a2l (ME2.8.1 AMG, Mercedes-AMG GmbH) für Adressverifikation.

## Unterstützte ECU-Varianten

| SW-Nummer     | Motor      | ECU-Gen   | Fahrzeuge                    | is281 |
|---------------|------------|-----------|------------------------------|-------|
| 87200000      | 5.0L M113  | ME2.8 Gen1 | SL500 R129, S500 W140 alt   | nein  |
| 88200000      | 5.5L M113  | ME2.8 Gen2 | S55, CL55, E55 (früh)       | nein  |
| 88200001      | 5.5L M113  | ME2.8 Gen2 | S55, CL55                   | nein  |
| 88800000      | 5.0L M113  | ME2.8 Gen3 | SL500, E500, diverse        | nein  |
| 88620000      | 5.0L M113  | ME2.8 Gen4 | S500 W220, CL500 C215       | nein  |
| 84xxK/81xxK   | 5.5L M113K | ME2.8.1   | SL55, E55, CLS55, C55 AMG   | ja    |

ME2.8.1 wird erkannt wenn Versionsstring "ME2.8.1" oder "K000" enthält.

---

## Adressvarianten: ME2.8 vs ME2.8.1

**ME2.8 (88x00000)** nutzt andere Adressen als **ME2.8.1 (8x00/8x12K)**:

| Parameter   | ME2.8 Adresse | ME2.8.1 Adresse | Versatz  |
|-------------|---------------|-----------------|----------|
| NMAXAT      | 0x12DC2       | 0x12B5E         | -612     |
| NMAXD       | 0x12DC4       | 0x12B60         | -612     |
| NMAXGNL     | 0x12DC6       | 0x12B62         | -612     |
| NMAXK       | 0x12DC8       | 0x12B64         | -612     |
| NMAXR       | 0x12DCA       | 0x12B66         | -612     |
| NMAXWF      | 0x12DDC       | 0x12B78         | -612     |
| FWNMAXWF    | 0x16B06       | 0x14B6C         | -8090    |
| FWNTOEL     | 0x16B08       | 0x14B6E         | -8090    |
| FWTNMAXK    | 0x16B12       | 0x14B78         | -8090    |
| FWTRAMP     | 0x16B14       | 0x14B7A         | -8090    |
| FWVMAXD     | 0x16B16       | 0x14B7C         | -8090    |
| FWVMAXR     | 0x16B18       | 0x14B80         | -8088    |
| FWWNMAXD    | 0x16B1A       | 0x14B82         | -8088    |
| FWWNMAXKA   | 0x16B1C       | 0x14B84         | -8088    |
| FWWNMAXKH   | 0x16B1E       | 0x14B86         | -8088    |
| FWWNMAXR    | 0x16B20       | 0x14B88         | -8088    |
| KLAMDRED    | 0x16B22       | 0x14B8A         | -8088    |
| VMAXOG[0-7] | 0x16B32+i×2  | 0x14B9A+i×2     | -8088    |
| VNMAXRF     | 0x13BA2       | 0x13B84         | -30      |
| TMASR       | 0x16548       | 0x15472         | -4310    |

**Zusätzlich ME2.8.1-exklusiv:**

| Parameter | Adresse ME2.8.1 | Drift-Soll    | Beschreibung                        |
|-----------|-----------------|---------------|-------------------------------------|
| FWVMAX    | 0x14F6B         | 0xFF          | Absoluter Vmax-Begrenzer (Byte)     |

FWVMAX: raw 0xFF = 306 km/h = effektiv deaktiviert. SL55 stock = 133 raw = **159 km/h** — aktiv!

**Nur in ME2.8 vorhanden** (me28Only):

| Parameter   | Adresse  | Beschreibung                         |
|-------------|----------|--------------------------------------|
| KSVMAX[0-5] | 0x15134+ | Geschwindigkeitslimiter ×0.1 km/h   |
| SWSCHUB3    | 0x132A2  | Schubabschaltung Enable              |
| SWSCHUB4    | 0x132A4  | Schubabschaltung Hysterese           |

---

## TMASR — KRITISCHER UNTERSCHIED ME2.8 vs ME2.8.1

| Variante | Adresse  | Kodierung          | Drift-Soll | Beschreibung                    |
|----------|----------|--------------------|------------|----------------------------------|
| ME2.8    | 0x16548  | Direkt °C (uint8)  | **255**    | 255 = ASR niemals durch Temp    |
| ME2.8.1  | 0x15472  | NTC-Invers (uint8) | **0**      | 0 = Niedrigste Temp = ASR nie  |

ME2.8.1 nutzt CMO_TMP (invertierte NTC-Kennlinie): raw=0 → höchste Temperaturschwelle → ASR greift nie durch Temperatur ein. raw=255 → niedrigste Schwelle → ASR ab Kaltstart aktiv.
SL55 stock = raw 180 (~80°C ASR-Aktivierung) → für Drift muss auf **0** gesetzt werden.

---

## Mirror-Spezifik ME2.8

### Adressversatz 88800000 (5.0L Gen3)
NMAX-Block und TMASR liegen +0x20C höher als in 88200000:
- NMAXAT: 0x12DC2 → 0x12FCE
- TMASR: 0x16548 → 0x16754

### Mirror-Grenzwert
ME2.8 Flash hat konstruktionsbedingt ~5700B Unterschiede zwischen Primary und Mirror1
(Lambda, Klopferkennung, Zündwinkel — verschiedene Kalibrierungsbereiche ohne Spiegelung).
Grenzwert: **<6500B** = normal | **>6500B** = fehlerhafter Flash

---

## Vollständige Drift-Paramter-Referenz (ME2.8 Basis 88x00000)

### NMAX Hard-Limiter (uint16, ×1 rpm, Mirror: P=M1=M2)

| Parameter | Adresse  | Drift-Soll | Stock-Range |
|-----------|----------|------------|-------------|
| NMAXAT    | 0x12DC2  | 6600 rpm   | 100–300     |
| NMAXD     | 0x12DC4  | 6600 rpm   | 80–200      |
| NMAXGNL   | 0x12DC6  | 6600 rpm   | 80–200      |
| NMAXK     | 0x12DC8  | 6600 rpm   | 80–200      |
| NMAXR     | 0x12DCA  | 6600 rpm   | 80–200      |
| NMAXWF    | 0x12DDC  | 6500 rpm   | 60–120      |

### Soft-Limiter Block (alle uint16, 0xFFFF=deaktiviert)

| Parameter  | Adresse  | Drift-Soll |
|------------|----------|------------|
| FWNMAXWF   | 0x16B06  | 0xFFFF     |
| FWNTOEL    | 0x16B08  | 0xFFFF     |
| FWTNMAXK   | 0x16B12  | 0xFFFF     |
| FWTRAMP    | 0x16B14  | 0xFFFF     |
| FWVMAXD    | 0x16B16  | 0xFFFF     |
| FWVMAXR    | 0x16B18  | 0xFFFF     |
| FWWNMAXD   | 0x16B1A  | 0xFFFF     |
| FWWNMAXKA  | 0x16B1C  | 0xFFFF     |
| FWWNMAXKH  | 0x16B1E  | 0xFFFF     |
| FWWNMAXR   | 0x16B20  | 0xFFFF     |
| KLAMDRED   | 0x16B22  | 0          |
| VMAXOG[0-7]| 0x16B32  | 0xFFFF je  |

### Geschwindigkeitsbegrenzer (nur ME2.8)

| Parameter   | Adresse         | Drift-Soll | Faktor    |
|-------------|-----------------|------------|-----------|
| KSVMAX[0-5] | 0x15134+i×2     | 0xFFFF     | ×0.1 km/h |

Werte >5000 (= >500 km/h) gelten ebenfalls als effektiv deaktiviert.

### Schubabschaltung / Wandlerschutz

| Parameter | Adresse | Größe  | Drift-Soll | Hinweis              |
|-----------|---------|--------|------------|----------------------|
| SWSCHUB3  | 0x132A2 | uint16 | 0          | nur ME2.8            |
| SWSCHUB4  | 0x132A4 | uint16 | 0          | nur ME2.8            |
| VNMAXRF   | 0x13BA2 | uint8  | 0          | ME2.8: 0x13BA2       |
| VNMAXRF   | 0x13B84 | uint8  | 0          | ME2.8.1: 0x13B84     |

### ASR Temperatur

| Variante  | Parameter | Adresse | Drift-Soll | Anmerkung           |
|-----------|-----------|---------|------------|---------------------|
| ME2.8     | TMASR     | 0x16548 | 255        | Direkt °C           |
| ME2.8.1   | TMASR     | 0x15472 | 0          | NTC-invertiert!     |

---

## Kennfeld-Prüfungen

### KFAGR — Abgasrückführung [64 Bytes]
- ME2.8 Adresse: `0x105E8`
- Drift-Soll: Alle 64 Bytes = 0x00
- Mirror: P, M1, M2 alle nullen!

### KFMDRED — CAN-ASR Torque-Reduction [37 × uint16]
- ME2.8 Adresse: `0x10D52`
- Drift-Soll: Alle 37 Wörter = 0xFFFF
- Mirror: P, +M1, +M2
- **Kritisch:** Wenn nicht 0xFFFF → ABS regelt Drehmoment in Kurven herunter!
- Nicht in ME2.8.1-A2L gefunden → vermutlich anders gelöst oder KLAMDRED (0x14B8A)

### Sekundäre Torque-Tabelle [12 × uint16]
- Adresse: `0x153C8`
- Drift-Soll: Alle 12 Wörter = 0xFFFF
- Mirror: P, +M1, +M2

### KFZW — Zündwinkel Hauptkennfeld [16×16 = 256 Bytes]
- ME2.8 (88x00000): `0x12864`
- ME2.8.1 (8x12K): `0x1242E` (via A2L 8412K000)
- Faktor: 1 raw = 0.75°
- Qualitätsprüfung: avg > 15 raw → Status OK | avg < 15 oder >200 Nullzellen → prüfen

---

## 🔒 Safety-Monitor Paramter (NICHT ÄNDERN)

Diese Parameter schützen Antriebsstrang und Motor. Nur Plausibilitätsprüfung.

| Parameter   | Adresse  | Sicherer Bereich | Physikalisch  | Funktion                              |
|-------------|----------|------------------|---------------|---------------------------------------|
| DZWENH      | 0x15A63  | 10–60 raw        | ~7.5–45°      | ZW-Rücknahme hartes Wiedereinsetzen  |
| DZWENW      | 0x15A64  | 10–60 raw        | ~7.5–45°      | ZW-Rücknahme weiches Wiedereinsetzen |
| DZWENWH     | 0x15A65  | 10–60 raw        | ~7.5–45°      | ZW-Rücknahme WE Handschalter         |
| ETA_ARLSD   | 0x10312  | 3000–15000       | Wirkungsgrad  | ZW-Wirkungsgrad Anti-Ruckel           |
| KLVL        | 0x12805  | 25000–42000      | λ-Faktor      | Vollast-Anfettungskurve               |
| FVLMX       | 0x1037A  | 1200–3000        | λ-Obergrenze  | Vollast-Anfettung Obergrenze          |

**DZWEN-Erklärung:** Beim schnellen Gas geben nach Schub (typisch im Drift) nimmt die ECU den
Zündwinkel kurz zurück (21–31°) um den Drehmomentstoß zu dämpfen. Deaktivieren = Risiko
für Kurbelwelle und Differenzial. Diese Parameter bleiben aktiv.

**KLVL/FVLMX-Erklärung:** Bestimmen die Kraftstoffanreicherung unter Vollast.
Zu magere Einstellung = thermischer Motorschaden. Nur auf Prüfstand mit Lambda-Sonde ändern.

Diese Parameter nur in ME2.8 (88x00000) auswerten — ME2.8.1 hat andere Adressen dort.

### 🔒 Safety-Kennfelder (nur ME2.8.1, SAFE_MAP Kategorie)

| Kennfeld  | ME2.8.1 Adresse | Prüflogik                | Funktion                          |
|-----------|-----------------|--------------------------|-----------------------------------|
| KFZWTMA   | 0x1256E         | warm_row_avg == 0        | Kaltstart ZW-Vorverstellung       |
| KFZWDY    | 0x1252E         | warm_row_avg == 0        | ZW-Korrektur bei Lastdynamik      |
| KFATMZW   | 0x10746         | avg >= 20 raw            | Abgastemperatur-Schutz via ZW     |

**KFZWTMA:** Additiver ZW-Offset für kalten Motor. Letzte Zeile (Betriebstemperatur) = 0 = normal.
Wenn letzte Zeile ≠ 0 → Zündwinkel wird dauerhaft beeinflusst → Motorschutz-Problem.

**KFZWDY:** ZW-Korrektur bei dynamischen Lastwechseln (Gas geben). Letzte Zeile warm = 0 = normal.
Nicht ändern — schützt beim Durchtreten gegen mechanische Überlastung.

**KFATMZW:** Reduziert ZW um Abgastemperatur zu begrenzen (Katalysatorschutz).
Ø < 20 raw → Schutz inaktiv → Katalysator und Abgasanlage ungeschützt.

---

## Bewertungslogik

```python
def get_status(value, drift_soll, stock_range, cat):
    if cat == "SAFE":
        return "ok" if safe_range[0] <= value <= safe_range[1] else "bad"
    
    # 0xFFFF auf Limiter-Param = deaktiviert = OK
    if value == 0xFFFF and drift_soll != 0xFFFF:
        return "ok"
    # KSVMAX > 5000 = effektiv deaktiviert
    if cat == "VMAX" and value > 5000:
        return "ok"
    if value == drift_soll:
        return "ok"
    if stock_range[0] <= value <= stock_range[1]:
        return "stock"
    return "bad"
```

**Qualitäts-Score:**
```
score = (ok_params + ok_maps) / (total_valid_params + total_valid_maps) * 100
```

- **≥ 90%** → Vollständig drift-tauglich
- **70–89%** → Drift-tauglich, kleine Mängel
- **50–69%** → Teilweise angepasst, Nacharbeit nötig
- **< 50%** → Nicht rennstreckentauglich

---

## Häufige Fehler & Diagnose

| Symptom | Ursache | Parameter |
|---------|---------|-----------|
| ABS regelt Leistung in Kurven | KFMDRED nicht deaktiviert | `0x10D52` → 0xFFFF |
| Motor läuft nicht hoch | NMAX zu niedrig oder korrupt | `0x12DC2`–`0x12DCA` |
| Schubabschalten beim Driften | SAS aktiv | `0x132A2`/`0x132A4` → 0 |
| ASR greift nach 2 Min ein (ME2.8) | TMASR zu niedrig | `0x16548` → 255 |
| ASR greift sofort ein (ME2.8.1) | TMASR falsch kodiert | `0x15472` → 0 (invertiert!) |
| SL55 bei 159 km/h abgeregelt | FWVMAX aktiv | `0x14F6B` → 0xFF |
| NMAX-Werte Datenmüll | Falsche SW-Variante oder 88800000 | nmaxShift +0x20C prüfen |
| Tacho tot nach ABS-Abklemmen | Hardware: ABS-CAN → Kombi | Nicht im ECU lösbar |
| Mirror-Inkonsistenz | Fehlerhafter Flash-Vorgang | Neue Datei beschaffen |
| DZWEN außerhalb Bereich | Manipuliertes/korruptes Flash | Safety-Alarm prüfen |
| KLVL = 0 oder sehr niedrig | Fehlerhafte Kalibrierung | Motorschaden-Risiko! |

---

## Workflow: Neues Drift-File erstellen

```
1. Original-Flash beschaffen (4B Mirror = sauber)
2. SW-Variante identifizieren (ME2.8 oder ME2.8.1?)
3. Safety-Parameter prüfen (DZWEN, KLVL, FVLMX in Range?)
4. Drift-Parameter setzen:
   ME2.8:   NMAX+nmaxShift, SoftLimit, KSVMAX, SWSCHUB, VNMAXRF, TMASR→255
            KFAGR→0, KFMDRED→0xFFFF, Torque2→0xFFFF
   ME2.8.1: NMAX(addr281), SoftLimit(addr281), VNMAXRF(addr281)
            TMASR→0 (invertiert!), FWVMAX→0xFF
5. Mirror-Konsistenz sicherstellen (alle geänderten Param in P+M1+M2)
6. Analyzer-Score ≥ 90% anstreben
```

---

## Bekannte Adress-Besonderheiten

- **87200000**: Versatz -0x027C für alle bekannten Adressen.
- **88800000**: NMAX-Block und TMASR liegen +0x20C höher (nmaxShift).
- **88620000** (S500 W220, CL500): Eigene Adresstabelle — KEIN einheitlicher Versatz! Blöcke liegen an verschiedenen Adressen.
  NMAX @ 0x12FCE, SoftLimiter @ 0x157BC, SWSCHUB @ 0x13252, TMASR @ 0x164F8, VNMAXRF @ 0x13DAE
  KFAGR @ 0x10608 (≠ 0x105E8!), KFZW @ 0x128C4. Verifiziert via A2L ME2_8_88620000.A2L.
- **KFZWOPT** (`0x1645C` ME2.8 / `0x155F0` ME2.8.1): Optimaler ZW-Kennfeld — Referenz.
- **KFZWZA** (`0x126E4` ME2.8 / `0x125AE` ME2.8.1): ZW bei ZAS-Betrieb. Im SL55 = 0.
- **SWSCHUB4**: Wert `0xFF02` ist normaler Stock-Wert für 5.5L ECU, zählt als "Stock".
- **A2L 8412K000**: Gültig für ME2.8.1 AMG (SL55, E55, CLS55). Adressen verifiziert.
- **A2L Sauger (ME2.8)**: Keine öffentlich verfügbare — Adressen durch Reverse Engineering.

---

---

## Vollständige A2L-Analyse — Abgelehnte Parameter (dokumentiert)

Alle drei A2L-Dateien wurden vollständig durchsucht (8.183 Parameter total).
Folgende Kandidaten wurden untersucht und **bewusst nicht ins Tool übernommen**:

### Notlauf-Funktionen (nur bei Sensor-Ausfall aktiv)
| Parameter  | Beschreibung                              | Grund für Ablehnung               |
|------------|-------------------------------------------|-----------------------------------|
| DKMAXKL    | DK-Begrenzung im DK-Poti-Notfahren       | Greift nur bei defektem DK-Sensor |
| DWDKSBAMX  | max. Soll/Ist DK-Winkel-Abweichung       | DK-Überwachungsdiagnose           |
| DFSEFON    | max. plausible FSE-Abweichung            | Sensor-Plausibilitätsdiagnose     |
| ELMRVMAX   | max. reversible Umschaltungen Ersatzbetrieb | Notlauf-Zähler                 |

### AT-spezifische Kupplungssteuerung (irrelevant für Drift)
| Parameter  | Beschreibung                              | Grund für Ablehnung               |
|------------|-------------------------------------------|-----------------------------------|
| EBG_MAX    | Einschaltbegrenzungs-Maximalmoment        | Nur bei Handschalter-Anfahren     |
| DFH_EBG    | Geschwindigkeitsschwelle Einschaltbegrenzung | Kupplung, AT irrelevant        |

### Bereits inaktiv — kein Safety Monitor nötig
| Parameter  | Beschreibung                              | Wert / Grund                      |
|------------|-------------------------------------------|-----------------------------------|
| KLPMAX     | DK-Begrenzung Leistungsbegrenzung (Kurve)| v5=32762 = 100% DK = inaktiv      |
| N_M_UGH    | Schubabschaltung Untergrenze Handschalter| v5=0 = deaktiviert                |
| FWBRMASK1/2| Steuermaske Drehzahlbegrenzung           | Fahrzeugkonfig-Bits, nicht ändern |

### Komfort-Funktionen (kein Drift-Einfluss)
| Parameter  | Beschreibung                              | Grund für Ablehnung               |
|------------|-------------------------------------------|-----------------------------------|
| FWBD1/FWBD2| Md-Reduzierrampen Fahrervorgabe          | Normale Pedalkennlinien-Rampen    |
| FWBNOA/U   | Drehzahlschwellen Fahrervorgabe-Md-Begr. | Komfort-Funktion AT               |
| FGR/Tempomat| Alle Tempomat-Parameter                 | Deaktiviert bei manuellem Fahren  |
| CWLLEW     | ZW-Regler in P/N dauerhaft              | Nur in Fahrstufe P oder N aktiv   |

### Unklare Kodierung — zu riskant
| Parameter  | Beschreibung                              | Grund für Ablehnung               |
|------------|-------------------------------------------|-----------------------------------|
| ~~NMOTMAX~~| ~~Maximaldrehzahlschwelle~~               | ~~Korrigiert: siehe unten~~      |
| KFZWMDB/A  | Dauerzündwinkel-Kennfelder               | Mirror-Fehler + unplausible Werte |
| KFZWOPT_UM | Opt. ZW Funktionsüberwachung             | Nur intern für Überwachung        |

### Allgemeine Kategorie-Ablehnungen
- **133 Diagnose-Sperrzeiten** (Freigabe/Sperre-Schwellen): OBD-spezifisch, kein Drift-Einfluss
- **Alle ZAS-Parameter** (N0TZAS, N1TZAS etc.): Zylinderabschaltung, für Drift irrelevant
- **Alle AGR-Parameter** (außer KFAGR Map): EGR-Diagnose-Schwellen
- **Alle Klima-Parameter**: Kompressor-Steuerung und Moment-Kompensation

---

## ⚠ Korrektur: NMOTMAX (88620000 spezifisch)

NMOTMAX ist ein **1-Byte Parameter** mit NQ25-Kodierung (×25 rpm/raw), kein 16-Bit Wert.
Früherer Analysefehler: `ru16()` statt `ru8()` verwendet → falsche Interpretation.

| Eigenschaft | Wert |
|---|---|
| Adresse (88620000) | 0x12FFA |
| Größe | 1 Byte |
| Konversion | NQ25: raw × 25 rpm |
| Stock 88620000 | raw=168 = **4.200 rpm** |
| Drift-Soll | raw=255 = **6.375 rpm** (Maximum) |
| Kategorie | NMAX-Limiter (absoluter Override) |

**Kritisch für 88620000-Drift-Files:** NMOTMAX = 4.200 rpm liegt unter dem gesetzten
NMAX von 6.600 rpm — der Motor würde trotz korrektem NMAX-Tuning bei 4.200 rpm abregeln!
NMOTMAX muss auf **255 raw** gesetzt werden.

NMOTMAX ist nicht in der 8412K000.A2L (ME2.8.1) enthalten → nur für SW 88620000.

---

## Fazit: Tool-Vollständigkeit

Nach Analyse von **8.183 Parametern** aus 3 A2L-Dateien (Stand März 2026):

✅ **Alle sinnvoll prüf- und änderbaren Drift-Parameter sind erfasst**
✅ **Alle relevanten Safety-Parameter sind im Safety Monitor**
✅ **Alle Ablehnungen sind begründet dokumentiert**
✅ **4 SW-Varianten ME2.8 + ME2.8.1 mit verifizierten Adressen**

Für das React/Browser-Tool: https://nd37181.github.io/me28-drift-analyzer/
