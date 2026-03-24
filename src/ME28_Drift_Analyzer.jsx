/**
 * ME2.8 / ME2.8.1 Drift Analyzer
 * © 2026 KFZ Dietrich, Nils Dietrich. Alle Rechte vorbehalten.
 * Unbefugte Nutzung, Vervielfältigung oder Weitergabe ist untersagt.
 * Nur für den internen Gebrauch bestimmt.
 */
import { useState, useCallback, useRef } from "react";

const M1 = 0x8000;
const M2 = 0x60000;

const SW_VARIANTS = {
  "87200000": { label:"87200000", engine:"5.0L",   gen:"Gen1 (37/00)", addrShift:-0x027C, nmaxShift:0,     is281:false },
  "88200000": { label:"88200000", engine:"5.5L",   gen:"Gen2 (37/01)", addrShift:0,       nmaxShift:0,     is281:false },
  "88200001": { label:"88200001", engine:"5.5L",   gen:"Gen2-B",       addrShift:0,       nmaxShift:0,     is281:false },
  "88800000": { label:"88800000", engine:"5.0L",   gen:"Gen3 (37/02)", addrShift:0,       nmaxShift:0x20C, is281:false },
  "88620000": { label:"88620000", engine:"5.0L",   gen:"Gen4 (S/CL500)", addrShift:0,      nmaxShift:0,     is281:false, is8862:true },
  // ME2.8.1 AMG-Varianten (8490K000, 8150K000, 8412K000 etc.)
  "_ME281":   { label:"ME2.8.1",  engine:"5.5L K", gen:"ME2.8.1 AMG",  addrShift:0,       nmaxShift:0,     is281:true  },
};

const REGIONS = [
  { start:0x00000, end:0x07FFF, name:"Programmcode A",            risk:"code",   color:"#4a4a4a" },
  { start:0x08000, end:0x0FFFF, name:"Programmcode B",            risk:"code",   color:"#4a4a4a" },
  { start:0x10000, end:0x1049F, name:"Klopferkennung (KEF*)",     risk:"low",    color:"#94a3b8" },
  { start:0x104A0, end:0x105E7, name:"Klopf-Messfenster",         risk:"low",    color:"#94a3b8" },
  { start:0x105E8, end:0x10627, name:"EGR (KFAGR)",               risk:"drift",  color:"#34d399" },
  { start:0x10628, end:0x10CFF, name:"Klopf / Diagnose",          risk:"low",    color:"#94a3b8" },
  { start:0x10D00, end:0x10DFF, name:"CAN-ASR Torque (KFMDRED)",  risk:"drift",  color:"#ff3c3c" },
  { start:0x10E00, end:0x117D2, name:"Drehmomentkennfelder",       risk:"medium", color:"#f59e0b" },
  { start:0x117D3, end:0x126E3, name:"Lambda / Einspritzung",     risk:"medium", color:"#60a5fa" },
  { start:0x126E4, end:0x12863, name:"Zuendwinkel KFZWZA",        risk:"timing", color:"#fbbf24" },
  { start:0x12864, end:0x12DC1, name:"Zuendwinkel KFZW",          risk:"timing", color:"#fbbf24" },
  { start:0x12DC2, end:0x12DDF, name:"NMAX Hard-Limiter",         risk:"drift",  color:"#ff3c3c" },
  { start:0x12DE0, end:0x132A1, name:"Misc Kennfelder",           risk:"low",    color:"#94a3b8" },
  { start:0x132A2, end:0x132A5, name:"Schubabschaltung (SAS)",    risk:"drift",  color:"#ff3c3c" },
  { start:0x132A6, end:0x13B9F, name:"Lambda / Misc",             risk:"low",    color:"#94a3b8" },
  { start:0x13BA0, end:0x13BA3, name:"Wandlerschutz (VNMAX*)",    risk:"drift",  color:"#f472b6" },
  { start:0x13BA4, end:0x15133, name:"Misc Kennfelder",           risk:"low",    color:"#94a3b8" },
  { start:0x15134, end:0x1513F, name:"Geschw.-Begrenzer (KSVMAX)",risk:"drift",  color:"#ff3c3c" },
  { start:0x15140, end:0x15547, name:"Pedal / Fahrerwunsch",      risk:"medium", color:"#60a5fa" },
  { start:0x15548, end:0x16547, name:"Misc Kennfelder",           risk:"low",    color:"#94a3b8" },
  { start:0x16548, end:0x16548, name:"TMASR ASR-Temperatur",      risk:"drift",  color:"#f472b6" },
  { start:0x16549, end:0x16B05, name:"Diverse",                   risk:"low",    color:"#94a3b8" },
  { start:0x16B06, end:0x16B50, name:"Soft-Limiter Block",        risk:"drift",  color:"#ff3c3c" },
  { start:0x16B51, end:0x17FFF, name:"Misc Kennfelder",           risk:"low",    color:"#94a3b8" },
  { start:0x18000, end:0x1FFFF, name:"Mirror 1",                  risk:"mirror", color:"#2a2a3a" },
  { start:0x20000, end:0x6FFFF, name:"ROM / Programmcode",        risk:"code",   color:"#707070" },
  { start:0x70000, end:0x77FFF, name:"Mirror 2",                  risk:"mirror", color:"#2a2a3a" },
  { start:0x78000, end:0x7FFFF, name:"Boot / Checksummen",        risk:"info",   color:"#909090" },
];

const RISK_LABEL = { drift:"DRIFT", timing:"TIMING", medium:"KENNFELD", low:"NEBEN", code:"CODE", mirror:"MIRROR", info:"INFO" };
const RISK_COLOR = { drift:"#ff3c3c", timing:"#fbbf24", medium:"#f59e0b", low:"#555", code:"#444", mirror:"#333", info:"#60a5fa" };


// ═══════════════════════════════════════════════════════════════
// INTERNATIONALISIERUNG (i18n)
// ═══════════════════════════════════════════════════════════════

const LANGS = {
  DE: {
    title:          "ME2.8 / ME2.8.1 DRIFT ANALYZER",
    subtitle:       "Bosch ME2.8 · M113 · M113K · Echtzeit-Analyse",
    tuneLabel:      "TUNE / PRÜFLING",
    refLabel:       "REFERENZ / VERGLEICH",
    dropHint:       ".bin / .FLS / 512KB",
    btnAnalyze:     "ANALYSIEREN",
    btnClear:       "ZURÜCKSETZEN",
    loading:        "Analysiere...",
    tabOverview:    "ÜBERSICHT",
    tabParams:      "PARAMETER",
    tabMaps:        "KENNFELDER",
    tabDiff:        "DIFF",
    scoreLabel:     "QUALITÄTS-SCORE",
    scorePassing:   "Drift-tauglich",
    scoreFailing:   "Nacharbeit nötig",
    catNMAX:        "NMAX HARD-LIMITER",
    catSOFT:        "SOFT-LIMITER",
    catVMAX:        "GESCHW.-BEGRENZER",
    catSAS:         "SCHUBABSCHALTUNG",
    catATF:         "WANDLERSCHUTZ",
    catASR:         "ASR TEMPERATUR",
    catSAFE:        "🔒 SICHERHEITSFUNKTIONEN (nicht ändern)",
    catEGR:         "ABGASRUECKFUEHRUNG",
    catCAN_ASR:     "CAN-ASR DREHMOMENTTABELLEN",
    catSAFE_MAP:    "🔒 SICHERHEITS-KENNFELDER (nicht ändern)",
    catIGN:         "ZUENDWINKEL",
    statusOk:       "OK",
    statusBad:      "FEHLER",
    statusStock:    "STOCK",
    mirrorOk:       "Mirror ✓",
    mirrorBad:      "Mirror ✗",
    exportJSON:     "JSON Export",
    exportJSONd:    "Maschinenlesbar / alle Werte / fuer Weiterverarbeitung",
    exportTXT:      "Text Protokoll",
    exportTXTd:     "Druckbares Pruefprotokoll / plain text",
    collectTitle:   "📂 DATEI ZUR WEITERENTWICKLUNG BEITRAGEN",
    collectDesc:    "Durch Klick auf 'Jetzt beitragen' stimmst du zu, dass diese Flash-Datei samt Analyseergebnis anonym zur Weiterentwicklung des ME2.8 Drift Analyzers gespeichert wird. Betreiber: KFZ Dietrich, Hardegsen-Gladebeck. Die Datei wird ausschließlich für interne Forschungszwecke verwendet.",
    collectBtn:     "✓ JETZT BEITRAGEN",
    collectSending: "⏳ Wird übertragen...",
    collectDone:    "✓ Erfolgreich gespeichert — Danke!",
    collectError:   "✗ Fehler beim Übertragen. Bitte später erneut versuchen.",
    collectDupe:    "⚠ Diese Datei ist bereits in der Sammlung vorhanden.",
    errSize:        "Ungültige Dateigröße",
    errExpected:    "erwartet 524288",
    footerInternal: "NUR FÜR DEN INTERNEN GEBRAUCH · KEIN ÖFFENTLICHES ANGEBOT · KEINE GEWÄHRLEISTUNG",
    footerBetreiber:"Betreiber: KFZ Dietrich · Hardegsen-Gladebeck · nils@kfz-dietrich.de · © 2026 Alle Rechte vorbehalten",
    sollLabel:      "Soll:",
    rangeLabel:     "Bereich:",
    consentText:    "Ich stimme zu, dass diese Flash-Datei nach der Analyse anonym zur Weiterentwicklung des ME2.8 Drift Analyzers gespeichert wird. (Pflichtfeld)",
    consentRequired:"⚠ Zustimmung erforderlich",
  },
  EN: {
    title:          "ME2.8 / ME2.8.1 DRIFT ANALYZER",
    subtitle:       "Bosch ME2.8 · M113 · M113K · Real-Time Analysis",
    tuneLabel:      "TUNE / TARGET FILE",
    refLabel:       "REFERENCE / COMPARE",
    dropHint:       ".bin / .FLS / 512KB",
    btnAnalyze:     "ANALYZE",
    btnClear:       "RESET",
    loading:        "Analyzing...",
    tabOverview:    "OVERVIEW",
    tabParams:      "PARAMETERS",
    tabMaps:        "MAPS",
    tabDiff:        "DIFF",
    scoreLabel:     "QUALITY SCORE",
    scorePassing:   "Drift-ready",
    scoreFailing:   "Rework needed",
    catNMAX:        "NMAX HARD-LIMITER",
    catSOFT:        "SOFT-LIMITER",
    catVMAX:        "SPEED LIMITER",
    catSAS:         "OVERRUN CUTOFF",
    catATF:         "TORQUE CONVERTER",
    catASR:         "ASR TEMPERATURE",
    catSAFE:        "🔒 SAFETY FUNCTIONS (do not modify)",
    catEGR:         "EXHAUST GAS RECIRCULATION",
    catCAN_ASR:     "CAN-ASR TORQUE TABLES",
    catSAFE_MAP:    "🔒 SAFETY MAPS (do not modify)",
    catIGN:         "IGNITION TIMING",
    statusOk:       "OK",
    statusBad:      "ERROR",
    statusStock:    "STOCK",
    mirrorOk:       "Mirror ✓",
    mirrorBad:      "Mirror ✗",
    exportJSON:     "JSON Export",
    exportJSONd:    "Machine-readable / all values / for further processing",
    exportTXT:      "Text Report",
    exportTXTd:     "Printable inspection report / plain text",
    collectTitle:   "📂 CONTRIBUTE FILE TO COLLECTION",
    collectDesc:    "By clicking 'Contribute now' you agree that this flash file and its analysis result will be stored anonymously for the development of the ME2.8 Drift Analyzer. Operator: KFZ Dietrich, Hardegsen-Gladebeck. The file will be used exclusively for internal research purposes.",
    collectBtn:     "✓ CONTRIBUTE NOW",
    collectSending: "⏳ Uploading...",
    collectDone:    "✓ Saved successfully — Thank you!",
    collectError:   "✗ Upload failed. Please try again later.",
    collectDupe:    "⚠ This file is already in the collection.",
    errSize:        "Invalid file size",
    errExpected:    "expected 524288",
    footerInternal: "FOR INTERNAL USE ONLY · NOT A PUBLIC OFFERING · NO WARRANTY",
    footerBetreiber:"Operator: KFZ Dietrich · Hardegsen-Gladebeck · nils@kfz-dietrich.de · © 2026 All rights reserved",
    sollLabel:      "Target:",
    rangeLabel:     "Range:",
    consentText:    "I agree that this flash file will be stored anonymously after analysis for further development of the ME2.8 Drift Analyzer. (Required)",
    consentRequired:"⚠ Consent required",
  },
  FR: {
    title:          "ME2.8 / ME2.8.1 DRIFT ANALYZER",
    subtitle:       "Bosch ME2.8 · M113 · M113K · Analyse en temps réel",
    tuneLabel:      "FICHIER TUNE / CIBLE",
    refLabel:       "RÉFÉRENCE / COMPARAISON",
    dropHint:       ".bin / .FLS / 512KB",
    btnAnalyze:     "ANALYSER",
    btnClear:       "RÉINITIALISER",
    loading:        "Analyse en cours...",
    tabOverview:    "APERÇU",
    tabParams:      "PARAMÈTRES",
    tabMaps:        "CARTOGRAPHIES",
    tabDiff:        "DIFF",
    scoreLabel:     "SCORE QUALITÉ",
    scorePassing:   "Prêt pour le drift",
    scoreFailing:   "Révision nécessaire",
    catNMAX:        "LIMITEUR NMAX",
    catSOFT:        "LIMITEUR SOUPLE",
    catVMAX:        "LIMITEUR DE VITESSE",
    catSAS:         "COUPURE EN DÉCÉLÉRATION",
    catATF:         "PROTECTION CONVERTISSEUR",
    catASR:         "TEMPÉRATURE ASR",
    catSAFE:        "🔒 FONCTIONS DE SÉCURITÉ (ne pas modifier)",
    catEGR:         "RECIRCULATION DES GAZ",
    catCAN_ASR:     "TABLES COUPLE CAN-ASR",
    catSAFE_MAP:    "🔒 CARTOGRAPHIES DE SÉCURITÉ (ne pas modifier)",
    catIGN:         "AVANCE À L'ALLUMAGE",
    statusOk:       "OK",
    statusBad:      "ERREUR",
    statusStock:    "STOCK",
    mirrorOk:       "Miroir ✓",
    mirrorBad:      "Miroir ✗",
    exportJSON:     "Export JSON",
    exportJSONd:    "Lisible par machine / toutes valeurs",
    exportTXT:      "Rapport texte",
    exportTXTd:     "Rapport d'inspection imprimable",
    collectTitle:   "📂 CONTRIBUER LE FICHIER À LA COLLECTION",
    collectDesc:    "En cliquant sur 'Contribuer', vous acceptez que ce fichier flash soit stocké anonymement pour le développement de l'analyseur. Opérateur: KFZ Dietrich, Hardegsen-Gladebeck. Le fichier sera utilisé exclusivement à des fins de recherche interne.",
    collectBtn:     "✓ CONTRIBUER",
    collectSending: "⏳ Envoi en cours...",
    collectDone:    "✓ Enregistré avec succès — Merci!",
    collectError:   "✗ Échec de l'envoi. Réessayez plus tard.",
    collectDupe:    "⚠ Ce fichier est déjà dans la collection.",
    errSize:        "Taille de fichier invalide",
    errExpected:    "attendu 524288",
    footerInternal: "USAGE INTERNE UNIQUEMENT · PAS D'OFFRE PUBLIQUE · SANS GARANTIE",
    footerBetreiber:"Opérateur: KFZ Dietrich · Hardegsen-Gladebeck · nils@kfz-dietrich.de · © 2026 Tous droits réservés",
    sollLabel:      "Cible:",
    rangeLabel:     "Plage:",
    consentText:    "J'accepte que ce fichier flash soit stocké anonymement après l'analyse pour le développement. (Obligatoire)",
    consentRequired:"⚠ Consentement requis",
  },
};

const DEFAULT_LANG = "DE";

const COLLECTOR_URL = "https://script.google.com/macros/s/AKfycbyeX6eYd2LnOTuY2VjizVjR4MGKq2FEwhQ_Ds8WBKRPb-LctPHqt0g532JfHph9KLVH/exec";

const PARAMS = [
  // ── NMAX ── ME2.8: addr+nmaxShift | ME2.8.1: addr281 direkt
  { id:"NMAXAT",    addr:0x12DC2, addr281:0x12B5E, addr8862:0x12FCE, size:2, cat:"NMAX", label:"NMAXAT",    unit:"rpm",  drift_soll:6600, soll281:0xFFFF, stock_range:[100,300],  nmaxParam:true },
  { id:"NMAXD",     addr:0x12DC4, addr281:0x12B60, addr8862:0x12FD0, size:2, cat:"NMAX", label:"NMAXD",     unit:"rpm",  drift_soll:6600, soll281:0xFFFF, stock_range:[80,200],   nmaxParam:true },
  { id:"NMAXGNL",   addr:0x12DC6, addr281:0x12B62, addr8862:0x12FD2, size:2, cat:"NMAX", label:"NMAXGNL",   unit:"rpm",  drift_soll:6600, soll281:0xFFFF, stock_range:[80,200],   nmaxParam:true },
  { id:"NMAXK",     addr:0x12DC8, addr281:0x12B64, addr8862:0x12FD4, size:2, cat:"NMAX", label:"NMAXK",     unit:"rpm",  drift_soll:6600, soll281:0xFFFF, stock_range:[80,200],   nmaxParam:true },
  { id:"NMAXR",     addr:0x12DCA, addr281:0x12B66, addr8862:0x12FD6, size:2, cat:"NMAX", label:"NMAXR",     unit:"rpm",  drift_soll:6600, soll281:0xFFFF, stock_range:[80,200],   nmaxParam:true },
  { id:"NMAXWF",    addr:0x12DDC, addr281:0x12B78, addr8862:0x12FE8, size:2, cat:"NMAX", label:"NMAXWF",    unit:"rpm",  drift_soll:6500, soll281:0xFFFF, stock_range:[60,120],   nmaxParam:true },
  // ── Soft-Limiter ── ME2.8: 0x16B0x | ME2.8.1: 0x14Bxx
  { id:"FWNMAXWF",  addr:0x16B06, addr281:0x14B6C, addr8862:0x157BC, size:2, cat:"SOFT", label:"FWNMAXWF",  unit:"rpm",  drift_soll:6500, soll281:0xFFFF, stock_range:[4000,5200] },
  { id:"FWNTOEL",   addr:0x16B08, addr281:0x14B6E, addr8862:0x157BE, size:2, cat:"SOFT", label:"FWNTOEL",   unit:"rpm",  drift_soll:6500, soll281:0xFFFF, stock_range:[4000,5200] },
  { id:"FWTNMAXK",  addr:0x16B12, addr281:0x14B78, addr8862:0x157C8, size:2, cat:"SOFT", label:"FWTNMAXK",  unit:"ms",   drift_soll:200,  soll281:0xFFFF, stock_range:[1000,5000] },
  { id:"FWTRAMP",   addr:0x16B14, addr281:0x14B7A, addr8862:0x157CA, size:2, cat:"SOFT", label:"FWTRAMP",   unit:"ms",   drift_soll:200,  soll281:0xFFFF, stock_range:[1000,5000] },
  { id:"FWVMAXD",   addr:0x16B16, addr281:0x14B7C, addr8862:0x157CC, size:2, cat:"SOFT", label:"FWVMAXD",   unit:"",     drift_soll:0,    soll281:0xFFFF, stock_range:[1,9999] },
  { id:"FWVMAXR",   addr:0x16B18, addr281:0x14B80, addr8862:0x157CE, size:2, cat:"SOFT", label:"FWVMAXR",   unit:"",     drift_soll:0,    soll281:0xFFFF, stock_range:[1,9999] },
  { id:"FWWNMAXD",  addr:0x16B1A, addr281:0x14B82, addr8862:0x157D0, size:2, cat:"SOFT", label:"FWWNMAXD",  unit:"rpm",  drift_soll:6400, soll281:0xFFFF, stock_range:[4000,5500] },
  { id:"FWWNMAXKA", addr:0x16B1C, addr281:0x14B84, addr8862:0x157D2, size:2, cat:"SOFT", label:"FWWNMAXKA", unit:"rpm",  drift_soll:6600, soll281:0xFFFF, stock_range:[4000,5500] },
  { id:"FWWNMAXKH", addr:0x16B1E, addr281:0x14B86, addr8862:0x157D4, size:2, cat:"SOFT", label:"FWWNMAXKH", unit:"rpm",  drift_soll:6600, soll281:0xFFFF, stock_range:[4000,5500] },
  { id:"FWWNMAXR",  addr:0x16B20, addr281:0x14B88, addr8862:0x157D6, size:2, cat:"SOFT", label:"FWWNMAXR",  unit:"rpm",  drift_soll:6200, soll281:0xFFFF, stock_range:[4000,5500] },
  { id:"KLAMDRED",  addr:0x16B22, addr281:0x14B8A, addr8862:0x157D8, size:2, cat:"SOFT", label:"KLAMDRED",  unit:"",     drift_soll:0,    soll281:0,      stock_range:[1,9999] },
  // VMAXOG: ME2.8 @ 0x16B32 | ME2.8.1 @ 0x14B9A
  ...Array.from({length:8},(_,i)=>({ id:"VMAXOG"+i, addr:0x16B32+i*2, addr281:0x14B9A+i*2, addr8862:0x157E8+i*2, size:2, cat:"SOFT", label:"VMAXOG["+i+"]", unit:"", drift_soll:0xFFFF, soll281:0xFFFF, stock_range:[0,5000] })),
  // KSVMAX: nur ME2.8 (nicht in ME2.8.1 A2L)
  ...Array.from({length:6},(_,i)=>({ id:"KSVMAX"+i, addr:0x15134+i*2, size:2, cat:"VMAX", label:"KSVMAX["+i+"]", unit:"km/h*10", drift_soll:0xFFFF, stock_range:[1500,2000], me28Only:true })),
  // SAS: nur ME2.8
  { id:"SWSCHUB3",  addr:0x132A2,  addr8862:0x13252, size:2, cat:"SAS",  label:"SWSCHUB3",  unit:"",    drift_soll:0,   stock_range:[1,9999], me28Only:true },
  { id:"SWSCHUB4",  addr:0x132A4,  addr8862:0x13254, size:2, cat:"SAS",  label:"SWSCHUB4",  unit:"",    drift_soll:0,   stock_range:[1,9999], me28Only:true },
  // VNMAXRF: ME2.8 @ 0x13BA2 | ME2.8.1 @ 0x13B84
  { id:"VNMAXRF",   addr:0x13BA2,  addr281:0x13B84, addr8862:0x13DAE, size:1, cat:"ATF",  label:"VNMAXRF",   unit:"",    drift_soll:0,   soll281:0,      stock_range:[1,255] },
  // TMASR: ME2.8 = direkt °C (soll 255) | ME2.8.1 = invertiertes NTC (soll 0!)
  { id:"TMASR",     addr:0x16548,  addr281:0x15472, addr8862:0x164F8, size:1, cat:"ASR",  label:"TMASR",     unit:"raw", drift_soll:255, soll281:0,      stock_range:[25,80], nmaxParam:true },
  // FWVMAX: NUR ME2.8.1 — absoluter Vmax-Begrenzer (Byte, 0xFF = 306 km/h = aus)
  { id:"FWVMAX",    addr:0x14F6B,  size:1, cat:"VMAX", label:"FWVMAX",    unit:"",    drift_soll:255, soll281:255,    stock_range:[50,200], me281Only:true },

  // NMOTMAX: Absoluter Drehzahl-Override (nur 88620000) — 1 Byte, ×25 rpm/raw
  // raw=255 = 6375 rpm (Maximum), stock 88620000 = 168 raw = 4200 rpm!
  { id:"NMOTMAX", addr8862:0x12FFA, size:1, cat:"NMAX", label:"NMOTMAX",
    unit:"rpm", drift_soll:255, soll281:null, stock_range:[100,200], me8862Only:true },

  // ── SAFETY-MONITOR (nur ME2.8 88x00000) ─────────────────────────────────────
  // Diese Parameter NICHT ändern — schützen Antriebsstrang und Motor
  // Angezeigt mit Schloss-Symbol, nur Plausibilitätsprüfung
  { id:"DZWENH",    addr:0x15A63,  size:1, cat:"SAFE", label:"DZWENH",    unit:"°",   safe_range:[10,60], safe_note:"ZW-Rücknahme hartes WE (21°=OK)", me28Only:true },
  { id:"DZWENW",    addr:0x15A64,  size:1, cat:"SAFE", label:"DZWENW",    unit:"°",   safe_range:[10,60], safe_note:"ZW-Rücknahme weiches WE (31°=OK)", me28Only:true },
  { id:"DZWENWH",   addr:0x15A65,  size:1, cat:"SAFE", label:"DZWENWH",   unit:"°",   safe_range:[10,60], safe_note:"ZW-Rücknahme WE Handschalter (24°=OK)", me28Only:true },
  { id:"ETA_ARLSD", addr:0x10312,  size:2, cat:"SAFE", label:"ETA_ARLSD", unit:"",    safe_range:[3000,15000], safe_note:"ZW-Wirkungsgrad Anti-Ruckel", me28Only:true },
  { id:"KLVL",      addr:0x12805,  size:2, cat:"SAFE", label:"KLVL",      unit:"",    safe_range:[25000,42000], safe_note:"Vollast-Anfettungsfaktor", me28Only:true },
  { id:"FVLMX",     addr:0x1037A,  size:2, cat:"SAFE", label:"FVLMX",     unit:"",    safe_range:[1200,3000], safe_note:"Vollast-Anfettung Obergrenze", me28Only:true },
];

const MAPS = [
  { id:"KFAGR",   addr:0x105E8, addr8862:0x10608, size:64,  cat:"EGR",     label:"KFAGR",  desc:"AGR [8x8]",            check:"all_zero" },
  { id:"KFMDRED", addr:0x10D52, size:74,  cat:"CAN_ASR", label:"KFMDRED",desc:"CAN-ASR Torque [37W]", check:"ffff_word", wc:37 },
  { id:"KFTORQ2", addr:0x153C8, size:24,  cat:"CAN_ASR", label:"Torque2",desc:"Torque2 [12W]",         check:"ffff_word", wc:12 },
  { id:"KFZW",    addr:0x12864, addr8862:0x128C4, size:256, cat:"IGN",      label:"KFZW",   desc:"Zuendwinkel [16x16]",  check:"timing" },
  { id:"KFZWZA",  addr:0x126E4, addr8862:0x12A44, size:256, cat:"IGN",      label:"KFZWZA", desc:"Zuendwinkel ZA [16x16]",check:"timing" },
  // ── Safety-Kennfelder (nur ME2.8.1, addr281) ─────────────────────────────
  // KFZWTMA: Kaltstart-ZW-Vorverstellung. Letzte Zeile (warm) muss = 0 sein
  { id:"KFZWTMA", addr281:0x1256E, size:256, cat:"SAFE_MAP", label:"KFZWTMA",
    desc:"Kaltstart ZW-Korrektur [16x16]", check:"safe_warmrow", me281Only:true },
  // KFZWDY: ZW bei Lastdynamik. Letzte Zeile (warm) muss = 0 sein
  { id:"KFZWDY",  addr281:0x1252E, size:256, cat:"SAFE_MAP", label:"KFZWDY",
    desc:"ZW Lastdynamik [16x16]", check:"safe_warmrow", me281Only:true },
  // KFATMZW: Abgastemperatur-ZW-Schutz. Ø > 20 raw = Katalysatorschutz aktiv
  { id:"KFATMZW", addr281:0x10746, size:256, cat:"SAFE_MAP", label:"KFATMZW",
    desc:"Abgastemperatur-Schutz ZW [16x16]", check:"safe_avgmin", safe_min:20, me281Only:true },
];

const ru16 = (b,a) => (a+1<b.length) ? b[a]|(b[a+1]<<8) : 0;
const ru8  = (b,a) => (a<b.length)   ? b[a] : 0;

function detectSW(buf) {
  const s = String.fromCharCode(...Array.from(buf.slice(0x7FFB0,0x7FFC0)).filter(b=>b>31&&b<127));
  for (const [k,v] of Object.entries(SW_VARIANTS)) {
    if (k.startsWith("_")) continue;
    if (s.includes(k)) return {...v, raw:s.trim()};
  }
  // ME2.8.1 erkennen: enthält "ME2.8.1" oder "K000" im Versionsstring
  if (s.includes("ME2.8.1") || /\d{4}K\d{3}/.test(s)) {
    const m = s.match(/(\d{4}K\d{3})/);
    const label = m ? m[1] : "ME2.8.1";
    return {...SW_VARIANTS["_ME281"], label, raw:s.trim()};
  }
  return {label:"UNKNOWN",engine:"?",gen:"?",addrShift:0,is281:false,raw:s.trim()};
}
function getPartNr(buf) {
  return String.fromCharCode(...Array.from(buf.slice(0x7FFE9,0x7FFF5)).filter(b=>(b>47&&b<58)||(b>64&&b<91)||(b>96&&b<123)));
}
function mirrorCheck(buf) {
  let d12=0, d13=0;
  for (let i=0;i<0x8000;i++) {
    if (buf[0x10000+i] !== buf[0x10000+i+M1]) d12++;
    if (0x10000+i+M2 < buf.length && buf[0x10000+i] !== buf[0x10000+i+M2]) d13++;
  }
  return {d12, d13, ok: d12<6500 && d13<6500};
}

function classifyAddr(addr) {
  for (const r of REGIONS) if (addr>=r.start && addr<=r.end) return r;
  return {name:"Unbekannt",risk:"low",color:"#909090"};
}

function computeDiff(ref, tune) {
  const GAP=32, blocks=[];
  let cur=null;
  for (let i=0; i<Math.min(ref.length,tune.length); i++) {
    if (ref[i]!==tune[i]) {
      if (!cur) cur={start:i,end:i,changed:1};
      else { cur.end=i; cur.changed++; }
    } else if (cur && (i-cur.end)>GAP) {
      blocks.push({...cur, total:cur.end-cur.start+1});
      cur=null;
    }
  }
  if (cur) blocks.push({...cur, total:cur.end-cur.start+1});
  return blocks.map(b=>({
    ...b,
    pct: Math.round(b.changed/(b.end-b.start+1)*100),
    region: classifyAddr(b.start),
  })).sort((a,b)=>{
    const o={drift:0,timing:1,medium:2,low:3,mirror:4,code:5,info:6};
    return (o[a.region.risk]||9)-(o[b.region.risk]||9);
  });
}

function analyzeParam(buf, p, shift, ref, nmaxShift, is281, sw) {
  // ME2.8.1-only params: überspringen wenn nicht is281
  if (p.me281Only && !is281) return {valid:false};
  // ME2.8-only params: überspringen wenn ME2.8.1
  if (p.me28Only  &&  is281) return {valid:false};
  // 88620000-only params: nur für diese SW-Variante
  if (p.me8862Only && !(sw && sw.is8862)) return {valid:false};

  let addr, usedShift=0;
  const is8862 = !is281 && (sw && sw.is8862);
  if (is281 && p.addr281 != null) {
    // ME2.8.1: direkte Adresse aus A2L
    addr = p.addr281;
  } else if (is8862 && p.addr8862 != null) {
    // 88620000: eigene Adresstabelle aus A2L
    addr = p.addr8862;
  } else {
    // ME2.8: Basis-Adresse + globaler Shift
    addr = p.addr + shift;
    // 88800000 NMAX-Block sitzt 0x20C höher
    if (p.nmaxParam && nmaxShift) {
      const sa = p.addr + shift + nmaxShift;
      if (sa >= 0 && sa+p.size <= buf.length) { addr = sa; usedShift = nmaxShift; }
    }
  }
  if (addr<0 || addr+p.size>buf.length) return {valid:false};

  const value    = p.size===2 ? ru16(buf,addr) : ru8(buf,addr);
  const m1v      = p.size===2 ? ru16(buf,addr+M1) : ru8(buf,addr+M1);
  const m2v      = p.size===2 ? ru16(buf,addr+M2) : ru8(buf,addr+M2);
  const refValue = ref ? (p.size===2 ? ru16(ref,addr) : ru8(ref,addr)) : null;
  const mirrorOk = value===m1v && value===m2v;

  // Variantenspezifischer Soll-Wert
  const soll = (is281 && p.soll281 != null) ? p.soll281 : p.drift_soll;

  // 0xFFFF auf Limiter = deaktiviert = OK (außer wenn soll selbst 0xFFFF)
  const isDisabled  = value===0xFFFF && soll!==0xFFFF;
  // KSVMAX: >5000 = effektiv deaktiviert
  const isHighSpeed = p.cat==="VMAX" && value > 5000 && p.id.startsWith("KSVMAX");
  // FWVMAX ME2.8.1: 0xFF = max 306 km/h = deaktiviert
  const isFwvmaxOff = p.id==="FWVMAX" && value===0xFF;

  // SAFE-Parameter: Plausibilitätsprüfung statt Drift-Soll
  if (p.cat==="SAFE") {
    const inRange = p.safe_range && value>=p.safe_range[0] && value<=p.safe_range[1];
    const phys = p.unit==="°" ? (value*0.75).toFixed(1)+"°" : String(value);
    return {valid:true,value,m1:m1v,m2:m2v,mirrorOk,isDriftOk:inRange,isStock:false,
            status:inRange?"ok":"bad", soll:null, refValue, note:phys, usedShift};
  }

  const isDriftOk = value===soll || isDisabled || isHighSpeed || isFwvmaxOff;
  const isStock   = !isDriftOk && value>=p.stock_range[0] && value<=p.stock_range[1];
  const status    = isDriftOk?"ok" : isStock?"stock" : "bad";

  let note = null;
  if (isDisabled)   note = "0xFFFF=deaktiviert";
  else if (isHighSpeed) note = `${(value*0.1).toFixed(0)}km/h`;
  else if (isFwvmaxOff) note = "0xFF=306km/h=aus";
  else if (p.id==="TMASR" && is281) note = value===0?"NTC-Min=aus":"NTC-aktiv";
  else if (p.id==="FWVMAX" && is281 && !isFwvmaxOff) note = `${(value*306.122/255).toFixed(0)}km/h`;

  return {valid:true,value,m1:m1v,m2:m2v,mirrorOk,isDriftOk,isStock,status,soll,refValue,note,usedShift};
}

function analyzeMap(buf, m, shift, ref, is281, sw) {
  // ME2.8.1-only Maps: überspringen wenn nicht is281
  if (m.me281Only && !is281) return {valid:false};

  // Adresse je nach Variante
  const is8862 = !is281 && (typeof sw !== 'undefined' && sw && sw.is8862);
  const addr = (is281 && m.addr281!=null) ? m.addr281
             : (is8862 && m.addr8862!=null) ? m.addr8862
             : (m.addr!=null ? m.addr+shift : -1);
  if (addr<0 || addr+m.size>buf.length) return {valid:false};

  // Safety-Kennfelder: letzte Zeile (warm) muss 0 sein
  if (m.check==="safe_warmrow") {
    const warmRow = Array.from(buf.slice(addr+240, addr+256)); // letzte Zeile 16x16
    const warmAvg = warmRow.reduce((a,b)=>a+b,0)/warmRow.length;
    const ok = warmAvg === 0;
    return {valid:true, status:ok?"ok":"bad",
            detail:`Warme Zeile: Ø ${(warmAvg*0.75).toFixed(1)}° (Soll: 0°)`};
  }
  // Safety-Kennfelder: Mindest-Durchschnitt
  if (m.check==="safe_avgmin") {
    const vals = Array.from(buf.slice(addr, addr+m.size));
    const avg  = vals.reduce((a,b)=>a+b,0)/vals.length;
    const ok = avg >= (m.safe_min||0);
    return {valid:true, status:ok?"ok":"bad",
            detail:`Ø ${avg.toFixed(1)} raw (Soll >= ${m.safe_min||0})`};
  }
  if (m.check==="all_zero") {
    const nz = Array.from(buf.slice(addr,addr+m.size)).filter(x=>x!==0).length;
    return {valid:true, status:nz===0?"ok":"bad", detail:`${nz}/${m.size}B != 0`};
  }
  if (m.check==="ffff_word") {
    const nb = Array.from({length:m.wc}).filter((_,i)=>ru16(buf,addr+i*2)!==0xFFFF).length;
    return {valid:true, status:nb===0?"ok":"bad", detail:`${nb}/${m.wc}W != 0xFFFF`};
  }
  if (m.check==="timing") {
    const vals = Array.from(buf.slice(addr,addr+m.size));
    const avg  = vals.reduce((a,b)=>a+b,0)/vals.length;
    const zeros = vals.filter(v=>v===0).length;
    const refVals = ref ? Array.from(ref.slice(addr,addr+m.size)) : null;
    const m1d = vals.filter((_,i)=>buf[addr+i]!==buf[addr+M1+i]).length;
    const m2d = vals.filter((_,i)=>buf[addr+i]!==buf[addr+M2+i]).length;
    return {
      valid:true, status:zeros>200?"bad":avg>15?"ok":"info",
      detail:`Ø ${(avg*0.75).toFixed(1)} Grad`,
      mirrorOk:m1d===0&&m2d===0, zeros, avg, vals, refVals,
    };
  }
  return {valid:false};
}

function runAnalysis(buf, ref) {
  const sw     = detectSW(buf);
  const shift  = sw.addrShift||0;
  const partNr = getPartNr(buf);
  const mirror = mirrorCheck(buf);
  const nmaxShift = sw.nmaxShift||0;
  const is281    = sw.is281||false;
  const params = PARAMS.map(p=>({...p,result:analyzeParam(buf,p,shift,ref,nmaxShift,is281,sw)}));
  const maps   = MAPS.map(m=>({...m,result:analyzeMap(buf,m,shift,ref,is281,sw)}));
  const diff   = ref ? computeDiff(ref,buf) : null;
  const okC    = params.filter(p=>p.result.status==="ok").length;
  const badC   = params.filter(p=>p.result.status==="bad").length;
  const mapOk  = maps.filter(m=>m.result.status==="ok").length;
  const mapBad = maps.filter(m=>m.result.status==="bad").length;
  const total  = params.filter(p=>p.result.valid).length + maps.filter(m=>m.result.valid).length;
  const score  = Math.round(((okC+mapOk)/total)*100);
  return {sw,partNr,mirror,params,maps,diff,score,okC,badC,mapOk,mapBad};
}

function buildExportJSON(an, tuneName, refName) {
  return JSON.stringify({
    tool:"ME2.8 Drift Analyzer v2", generated:new Date().toISOString(),
    files:{tune:tuneName,ref:refName||null},
    sw:{label:an.sw.label,engine:an.sw.engine,gen:an.sw.gen,partNr:an.partNr},
    score:an.score,
    mirror:{d12:an.mirror.d12,d13:an.mirror.d13,ok:an.mirror.ok},
    params:an.params.map(p=>({
      id:p.id,cat:p.cat,label:p.label,value:p.result.valid?p.result.value:null,
      refValue:p.result.valid?p.result.refValue:null,
      drift_soll:p.drift_soll,status:p.result.valid?p.result.status:null,
      mirrorOk:p.result.valid?p.result.mirrorOk:null,
    })),
    maps:an.maps.map(m=>({id:m.id,label:m.label,status:m.result.valid?m.result.status:null,detail:m.result.valid?m.result.detail:null})),
    diff:an.diff?an.diff.map(b=>({
      start:"0x"+b.start.toString(16).toUpperCase().padStart(5,"0"),
      end:"0x"+b.end.toString(16).toUpperCase().padStart(5,"0"),
      size:b.total,changed:b.changed,pct:b.pct,
      region:b.region.name,risk:b.region.risk,
    })):null,
  }, null, 2);
}

function buildExportText(an, tuneName, refName, T) {
  const paramLabel = T ? T.tabParams : "PARAMETER";
  const mapsLabel  = T ? T.tabMaps   : "KENNFELDER";
  const L=[...["=".repeat(55),"  ME2.8 DRIFT ANALYZER - PRUEFPROTOKOLL","  KFZ Dietrich","=".repeat(55),
    "Erstellt:   "+new Date().toLocaleString("de-DE"),
    "Datei:      "+tuneName, refName?"Referenz:   "+refName:"",
    "","SOFTWARE",
    "  SW:       "+an.sw.label+" ("+an.sw.engine+" / "+an.sw.gen+")",
    "  Teilenr.: "+(an.partNr||"-"),
    "","SCORE: "+an.score+"%","",
    "MIRROR","  P<>M1: "+an.mirror.d12+"B  P<>M2: "+an.mirror.d13+"B  "+(an.mirror.ok?"OK":"KORRUPT!"),
    "",paramLabel,
    ...an.params.filter(p=>p.result.valid).map(p=>{
      const r=p.result;
      const v=r.value===0xFFFF?"0xFFFF":String(r.value);
      const rf=r.refValue!==null?" [Ref:"+(r.refValue===0xFFFF?"0xFFFF":r.refValue)+"]":"";
      const st=r.status==="ok"?"OK":r.status==="stock"?"STOCK":"FEHLER";
      return "  ["+st+"] "+p.label.padEnd(12)+" "+v.padEnd(8)+p.unit+rf+(!r.mirrorOk?" [MIRROR!]":"");
    }),
    "",mapsLabel,
    ...an.maps.filter(m=>m.result.valid).map(m=>"  ["+(m.result.status==="ok"?"OK":"FEHLER")+"] "+m.label.padEnd(12)+" "+m.result.detail),
    "",
    ...(an.diff?[
      "DIFF ("+an.diff.length+" Bloecke)",
      ...an.diff.filter(b=>b.region.risk!=="mirror"&&b.region.risk!=="code").map(b=>
        "  ["+b.region.risk.toUpperCase().padEnd(6)+"] 0x"+b.start.toString(16).toUpperCase().padStart(5,"0")+" "+b.total+"B  "+b.region.name
      ),"",
    ]:[]),
    "=".repeat(55),
  ]];
  return L.join("\n");
}

function downloadFile(content, filename, type) {
  const b=new Blob([content],{type}),u=URL.createObjectURL(b),a=document.createElement("a");
  a.href=u;a.download=filename;a.click();URL.revokeObjectURL(u);
}

const SC={ok:"#00ff88",bad:"#ff3c3c",stock:"#f59e0b",unknown:"#444",info:"#60a5fa"};

function Badge({status,children}) {
  const c=SC[status]||"#444";
  return <span style={{display:"inline-block",padding:"1px 6px",borderRadius:3,fontSize:9,fontFamily:"monospace",letterSpacing:1,background:c+"22",color:c,border:"1px solid "+c+"44"}}>{children||(status||"?").toUpperCase()}</span>;
}
function MDot({ok}) {
  return <span title={ok?"Mirror OK":"Mirror INKONSISTENT!"} style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:ok?"#00ff88":"#ff3c3c",marginLeft:4,verticalAlign:"middle"}}/>;
}

function ScoreRing({score}) {
  const r=34,circ=2*Math.PI*r,dash=(score/100)*circ;
  const c=score>=80?"#00ff88":score>=50?"#f59e0b":"#ff3c3c";
  return (
    <svg width={86} height={86}>
      <circle cx={43} cy={43} r={r} fill="none" stroke="#1a1a1a" strokeWidth={7}/>
      <circle cx={43} cy={43} r={r} fill="none" stroke={c} strokeWidth={7}
        strokeDasharray={dash+" "+circ} strokeLinecap="round"
        strokeDashoffset={circ/4}/>
      <text x={43} y={47} textAnchor="middle" fill={c} style={{fontSize:19,fontFamily:"monospace",fontWeight:700}}>{score}</text>
      <text x={43} y={58} textAnchor="middle" fill="#444" style={{fontSize:8,fontFamily:"monospace"}}>%</text>
    </svg>
  );
}

function TimingMap({vals,refVals,label}) {
  if(!vals||!vals.length) return null;
  const lo=Math.min(...vals),hi=Math.max(...vals)||1;
  const cellBg=(v)=>{
    if(refVals) {
      const i=vals.indexOf(v); const d=v-(refVals[i]||0);
      if(d===0) return "#141414";
      return d>0?"rgba(0,255,136,"+(Math.min(Math.abs(d)/20,1)*0.85)+")":"rgba(255,60,60,"+(Math.min(Math.abs(d)/20,1)*0.85)+")";
    }
    const t=(v-lo)/(hi-lo);
    if(t<0.33) return "hsl("+(220-t*100)+",60%,"+(25+t*20)+"%)";
    if(t<0.66) return "hsl("+(100-t*200)+",70%,40%)";
    return "hsl("+(Math.max(0,30-t*30))+",85%,47%)";
  };
  return (
    <div style={{marginBottom:24}}>
      <div style={{fontSize:9,color:"#ff6b2b",letterSpacing:2,marginBottom:8}}>{label}</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(16,1fr)",gap:2,maxWidth:528}}>
        {vals.map((v,i)=>{
          const d=refVals?v-refVals[i]:null;
          const alpha=d!==null?Math.min(Math.abs(d)/20,1)*0.8:0;
          const bg=d===null?cellBg(v):d===0?"#141414":d>0?"rgba(0,200,100,"+alpha+")":"rgba(220,50,50,"+alpha+")";
          const ti="[r"+Math.floor(i/16)+" c"+(i%16)+"] "+(v*0.75).toFixed(1)+"G"+(d!==null?" D"+(d>=0?"+":"")+( d*0.75).toFixed(1):"");
          return (
            <div key={i} title={ti}
              style={{background:bg,
                height:22,borderRadius:2,display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:7,color:"rgba(255,255,255,0.65)",border:"1px solid #111",cursor:"default"}}>
              {(v*0.75).toFixed(0)}
            </div>
          );
        })}
        })}
      </div>
      <div style={{display:"flex",gap:14,marginTop:5,fontSize:8,color:"#787878"}}>
        {refVals
          ? <><span style={{color:"#00ff88"}}>gruen = mehr Vorzuendung</span><span style={{color:"#ff3c3c"}}>rot = weniger</span></>
          : <><span style={{color:"hsl(220,60%,30%)"}}>dunkel = niedrig</span><span style={{color:"hsl(0,85%,47%)"}}>hell = hoch</span></>}
      </div>
    </div>
  );
}

function DropZone({label,onFile,file,color,icon}) {
  const [drag,setDrag]=useState(false);
  const inp=useRef();
  return (
    <div onClick={()=>inp.current.click()}
      onDrop={e=>{e.preventDefault();setDrag(false);onFile(e.dataTransfer.files[0]);}}
      onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
      style={{border:"2px dashed "+(drag?color:"#1e1e1e"),borderRadius:8,padding:"18px 14px",
        textAlign:"center",cursor:"pointer",background:drag?color+"0a":"#0d0d0d",flex:1,minWidth:0,transition:"all 0.15s"}}>
      <div style={{fontSize:20,marginBottom:5}}>{icon}</div>
      <div style={{fontSize:9,color,letterSpacing:2,marginBottom:4}}>{label}</div>
      {file?<div style={{fontSize:9,color:"#00ff88"}}>✓ {file.name}</div>
            :<div style={{fontSize:9,color:"#666666"}}>.bin / .FLS / 512KB</div>}
      <input ref={inp} type="file" accept=".bin,.FLS,.fls" style={{display:"none"}} onChange={e=>onFile(e.target.files[0])}/>
    </div>
  );
}

function PRow({p, T}) {
  const r=p.result;
  if(!r.valid) return null;
  const isSafe = p.cat==="SAFE";
  const v=r.value===0xFFFF?"0xFFFF":String(r.value);
  const rv=r.refValue!==null?(r.refValue===0xFFFF?"0xFFFF":String(r.refValue)):null;
  const delta=(r.refValue!==null&&r.value!==null&&r.value!==undefined)?r.value-r.refValue:null;
  const vc=r.status==="ok"?"#00ff88":r.status==="bad"?"#ff3c3c":"#f59e0b";
  const noteStr=r.note?" "+r.note:"";
  return (
    <div style={{display:"grid",gridTemplateColumns:"110px 75px 65px 55px 1fr 68px",alignItems:"center",
      padding:"4px 0",borderBottom:"1px solid #0e0e0e",fontSize:10,
      background:isSafe?"rgba(255,200,50,0.03)":"transparent"}}>
      <span style={{fontFamily:"monospace",color:isSafe?"#c8a000":"#d0d0d0"}}>{isSafe?"🔒 ":""}{p.label}</span>
      <span style={{fontFamily:"monospace",color:vc}}>{v}<span style={{color:"#666666",fontSize:8}}> {p.unit}</span>{r.note&&<span style={{color:"#909090",fontSize:8}}> {r.note}</span>}{isSafe&&p.safe_note&&<div style={{fontSize:7,color:"#8a7000",marginTop:1}}>{p.safe_note}</div>}</span>
      {rv?<span style={{color:"#666666",fontSize:9}}>Ref:{rv}</span>:<span/>}
      {delta!==null&&delta!==0?<span style={{color:delta>0?"#00ff88":"#ff3c3c",fontSize:9}}>{delta>0?"+":""}{delta}</span>:<span/>}
      <span style={{color:"#585858",fontSize:9}}>{isSafe?`Bereich:${p.safe_range[0]}-${p.safe_range[1]}`:`${isSafe?T.rangeLabel:T.sollLabel}${isSafe?p.safe_range[0]+"-"+p.safe_range[1]:(p.drift_soll===0xFFFF?"0xFFFF":p.drift_soll)}`}</span>
      <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:3}}>
        <Badge status={r.status}/><MDot ok={r.mirrorOk}/>
      </div>
    </div>
  );
}

const CAT_DEFS_FN = (T) => ({
  NMAX:{label:T.catNMAX,color:"#ff6b2b"},
  SOFT:{label:T.catSOFT,color:"#f59e0b"},
  VMAX:{label:T.catVMAX,color:"#a78bfa"},
  SAS:{label:T.catSAS,color:"#34d399"},
  ATF:{label:T.catATF,color:"#60a5fa"},
  ASR:{label:T.catASR,color:"#f472b6"},
  SAFE:{label:T.catSAFE,color:"#c8a000"},
});
const MAP_CAT_DEFS_FN = (T) => ({
  EGR:{label:T.catEGR,color:"#94a3b8"},
  CAN_ASR:{label:T.catCAN_ASR,color:"#ff3c3c"},
  SAFE_MAP:{label:T.catSAFE_MAP,color:"#c8a000"},
  IGN:{label:T.catIGN,color:"#fbbf24"},
});

export default function App() {
  const [lang,setLang]=useState(()=>localStorage.getItem("me28_lang")||DEFAULT_LANG);
  const T = LANGS[lang] || LANGS[DEFAULT_LANG];
  const changeLang = (l) => { setLang(l); localStorage.setItem("me28_lang",l); };
  const [tuneFile,setTuneFile]=useState(null);
  const [refFile,setRefFile]=useState(null);
  const [tuneBuf,setTuneBuf]=useState(null);
  const [refBuf,setRefBuf]=useState(null);
  const [analysis,setAnalysis]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(null);
  const [tab,setTab]=useState("overview");
  const [consent,setConsent]=useState(false);
  const [uploadState,setUploadState]=useState(null);

  // Upload zur Dateisammlung
  async function uploadToCollection(result) {
    const r = result || analysis;
    if (!tuneBuf || !r) return;
    setUploadState("uploading");
    try {
      const hashBuffer = await crypto.subtle.digest("SHA-256", tuneBuf);
      const sha256     = Array.from(new Uint8Array(hashBuffer))
                          .map(b=>b.toString(16).padStart(2,"0")).join("");

      // Clientseitiger Duplicate-Check via localStorage
      const seen = JSON.parse(localStorage.getItem("me28_seen")||"[]");
      if (seen.includes(sha256)) { setUploadState("duplicate"); return; }

      const bytes = new Uint8Array(tuneBuf);
      let binary = "";
      bytes.forEach(b => binary += String.fromCharCode(b));
      const base64 = btoa(binary);

      const payload = {
        accepted:   true,
        file:       base64,
        sha256:     sha256,
        filename:   tuneFile.name,
        sw:         r.sw.label,
        score:      r.score,
        engine:     r.sw.engine,
        mirrorOk:   r.mirror?.ok || false,
        analysis:   {
          score:    r.score,
          sw:       r.sw.label,
          partNr:   r.partNr,
          okCount:  r.okCount,
          badCount: r.badCount,
        },
      };

      // URLSearchParams = "simple" request → kein CORS-Preflight nötig
      // Apps Script empfängt via e.parameter.data
      const form = new URLSearchParams();
      form.append("data", JSON.stringify(payload));
      await fetch(COLLECTOR_URL, {
        method: "POST",
        mode:   "no-cors",
        body:   form,
      });
      // no-cors = opaque response, kein Status-Check möglich → immer "done"
      const seen2 = JSON.parse(localStorage.getItem("me28_seen")||"[]");
      seen2.push(sha256);
      if (seen2.length > 500) seen2.splice(0, seen2.length-500); // max 500 einträge
      localStorage.setItem("me28_seen", JSON.stringify(seen2));
      setUploadState("done");
    } catch(err) {
      console.error("Upload error:", err);
      setUploadState("error");
    }
  }

  const load=(file,isRef)=>{
    if(!file)return;
    const rd=new FileReader();
    rd.onload=e=>{
      const buf=new Uint8Array(e.target.result);
      if(buf.length!==524288){setError(file.name+": "+buf.length+"B -- erwartet 524288");return;}
      if(isRef){setRefFile(file);setRefBuf(buf);setAnalysis(null);}
      else{setTuneFile(file);setTuneBuf(buf);setAnalysis(null);setUploadState(null);}
    };
    rd.readAsArrayBuffer(file);
  };

  const analyze=()=>{
    if(!tuneBuf||!consent)return;
    setLoading(true);setError(null);
    setTimeout(()=>{
      try{const r=runAnalysis(tuneBuf,refBuf||null);setAnalysis(r);setTab("overview");
        uploadToCollection(r);
      }
      catch(ex){setError("Fehler: "+ex.message);}
      setLoading(false);
    },60);
  };

  const reset=()=>{setTuneFile(null);setRefFile(null);setTuneBuf(null);setRefBuf(null);setAnalysis(null);setError(null);setUploadState(null);};

  const TABS=analysis
    ? ["overview","params","kennfelder","timing","diff","export"].filter(t=>t!=="diff"||analysis.diff)
    : [];

  return (
    <div style={{minHeight:"100vh",background:"#080808",color:"#e8e8e8",fontFamily:"'JetBrains Mono',monospace",
      backgroundImage:"radial-gradient(ellipse at 15% 15%,#0a1a0a 0%,transparent 55%),radial-gradient(ellipse at 85% 85%,#0a0a1a 0%,transparent 55%)"}}>

      {/* Header */}
      <div style={{borderBottom:"1px solid #141414",background:"#040404ee",backdropFilter:"blur(8px)",
        padding:"0 22px",position:"sticky",top:0,zIndex:20,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 0"}}>
          <div style={{width:24,height:24,background:"#ff6b2b18",border:"1px solid #ff6b2b44",borderRadius:4,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>⚡</div>
          <div>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:3,color:"#ff6b2b"}}>ME2.8 DRIFT ANALYZER</div>
            <div style={{fontSize:8,color:"#909090",letterSpacing:2}}>v2 · ZWEI-DATEI-VERGLEICH · KFZ DIETRICH</div>

          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {/* Sprach-Switcher */}
          <div style={{display:"flex",gap:3}}>
            {Object.keys(LANGS).map(l=>(
              <button key={l} onClick={()=>changeLang(l)}
                style={{background:lang===l?"#ff6b2b22":"transparent",
                  border:"1px solid "+(lang===l?"#ff6b2b66":"#1e1e1e"),
                  color:lang===l?"#ff6b2b":"#505050",
                  padding:"3px 7px",borderRadius:3,cursor:"pointer",
                  fontSize:8,letterSpacing:1,fontFamily:"monospace",
                  fontWeight:lang===l?"700":"400"}}>
                {l}
              </button>
            ))}
          </div>
          {analysis&&<button onClick={reset}
            style={{background:"transparent",border:"1px solid #1a1a1a",
            color:"#686868",padding:"4px 12px",borderRadius:4,cursor:"pointer",
            fontSize:9,letterSpacing:1,fontFamily:"monospace"}}>
            {T.btnClear}
          </button>}
        </div>
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"18px 22px"}}>

        {/* File load area */}
        {!analysis&&(
          <div style={{marginBottom:18}}>
            <div style={{display:"flex",gap:10,marginBottom:10}}>
              <DropZone label={T.tuneLabel} onFile={f=>load(f,false)} file={tuneFile} color="#ff6b2b" icon="⚙"/>
              <DropZone label={T.refLabel} onFile={f=>load(f,true)} file={refFile} color="#60a5fa" icon="📋"/>
            </div>
            {tuneBuf&&(
              <div>
                <label style={{display:"flex",alignItems:"flex-start",gap:10,background:"#0d1a0d",
                  border:"1px solid "+(consent?"#00ff8844":"#ff3c3c44"),borderRadius:4,
                  padding:"10px 12px",marginBottom:8,cursor:"pointer",userSelect:"none"}}>
                  <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}
                    style={{marginTop:2,accentColor:"#00ff88",cursor:"pointer",flexShrink:0}}/>
                  <span style={{fontSize:8,color:consent?"#a0c0a0":"#909090",lineHeight:1.5}}>
                    {T.consentText}
                  </span>
                </label>
                {!consent&&<div style={{fontSize:7,color:"#ff3c3c",marginBottom:6,letterSpacing:1}}>
                  {T.consentRequired}
                </div>}
                <button onClick={analyze} disabled={!consent}
                  style={{width:"100%",background:consent?"#ff6b2b":"#1a1a1a",border:"none",
                    color:consent?"#000":"#404040",padding:"10px",borderRadius:6,
                    cursor:consent?"pointer":"not-allowed",fontSize:11,
                    fontFamily:"monospace",letterSpacing:3,fontWeight:700,transition:"all 0.2s"}}>
                  {T.btnAnalyze}{refBuf?" (mit Referenz-Vergleich)":""}
                </button>
              </div>
            )}
          </div>
        )}

        {loading&&<div style={{textAlign:"center",padding:56}}>
          <div style={{fontSize:22,animation:"spin 0.8s linear infinite",marginBottom:10}}>⚙</div>
          <div style={{fontSize:10,color:"#ff6b2b",letterSpacing:3}}>ANALYSIERE...</div>
        </div>}

        {error&&<div style={{background:"#110606",border:"1px solid #ff3c3c33",borderRadius:7,padding:"12px 16px",marginBottom:14}}>
          <div style={{color:"#ff3c3c",fontSize:10,marginBottom:3}}>FEHLER</div>
          <div style={{fontSize:9,color:"#b0b0b0"}}>{error}</div>
        </div>}

        {analysis&&(<>
          {/* Summary */}
          <div style={{display:"grid",gridTemplateColumns:"76px 1fr",gap:14,background:"#0b0b0b",
            border:"1px solid #181818",borderRadius:8,padding:14,marginBottom:14,alignItems:"center"}}>
            <div style={{textAlign:"center"}}><ScoreRing score={analysis.score}/>
              <div style={{fontSize:7,color:"#a0a0a0",letterSpacing:2}}>SCORE</div></div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
              <div>
                <div style={{fontSize:8,color:"#a0a0a0",letterSpacing:2,marginBottom:4}}>SOFTWARE</div>
                <div style={{fontSize:13,color:"#ff6b2b",fontWeight:700}}>{analysis.sw.label}</div>
                <div style={{fontSize:9,color:"#707070"}}>{analysis.sw.engine} / {analysis.sw.gen}</div>
              {analysis.sw.is281&&<div style={{fontSize:7,background:"#ff6b2b22",color:"#ff6b2b",padding:"1px 5px",borderRadius:2,marginTop:3,letterSpacing:1}}>ME2.8.1 AMG</div>}
              </div>
              <div>
                <div style={{fontSize:8,color:"#a0a0a0",letterSpacing:2,marginBottom:4}}>TEILENUMMER</div>
                <div style={{fontSize:10,color:"#b0b0b0",fontFamily:"monospace"}}>{analysis.partNr||"---"}</div>
              </div>
              <div>
                <div style={{fontSize:8,color:"#a0a0a0",letterSpacing:2,marginBottom:4}}>PARAMETER</div>
                <div style={{fontSize:10,color:"#909090"}}>
                  <span style={{color:"#00ff88"}}>{analysis.okC} OK</span>
                  {" "}<span style={{color:"#f59e0b"}}>{analysis.params.filter(p=>p.result.status==="stock").length} St</span>
                  {" "}<span style={{color:"#ff3c3c"}}>{analysis.badC} Err</span>
                </div>
              </div>
              <div>
                <div style={{fontSize:8,color:"#a0a0a0",letterSpacing:2,marginBottom:4}}>MIRROR</div>
                <div style={{fontSize:9,color:analysis.mirror.ok?"#00ff88":analysis.mirror.d12<8000?"#f59e0b":"#ff3c3c"}}>
                  {analysis.mirror.ok?"OK":analysis.mirror.d12<8000?"NORMAL":"FEHLER"}
                </div>
                <div style={{fontSize:8,color:"#707070"}}>M1:{analysis.mirror.d12}B M2:{analysis.mirror.d13}B</div>
              </div>
            </div>
          </div>

          {/* Alerts */}
          {(analysis.badC>0||!analysis.mirror.ok||analysis.mapBad>0)&&(
            <div style={{background:"#0e0606",border:"1px solid #ff3c3c20",borderRadius:7,
              padding:"9px 13px",marginBottom:12}}>
              <div style={{fontSize:8,color:"#ff3c3c",letterSpacing:2,marginBottom:5}}>KRITISCHE PROBLEME</div>
              {analysis.params.filter(p=>p.result.status==="bad").map(p=>(
                <div key={p.id} style={{fontSize:9,color:"#ff6b2b",marginBottom:2}}>
                  {p.label}: ist {p.result.value} / soll {p.drift_soll===0xFFFF?"0xFFFF":p.drift_soll}
                  {!p.result.mirrorOk?" [MIRROR!]":""}
                </div>
              ))}
              {analysis.maps.filter(m=>m.result.status==="bad").map(m=>(
                <div key={m.id} style={{fontSize:9,color:"#ff6b2b",marginBottom:2}}>{m.label}: {m.result.detail}</div>
              ))}
              {!analysis.mirror.ok&&<div style={{fontSize:9,color:"#ff3c3c",marginTop:2}}>Mirror: {analysis.mirror.d12}B (M1) / {analysis.mirror.d13}B (M2)</div>}
            </div>
          )}

          {/* Tabs */}
          <div style={{display:"flex",borderBottom:"1px solid #141414",marginBottom:12}}>
            {TABS.map(t=>(
              <button key={t} onClick={()=>setTab(t)} style={{background:"transparent",border:"none",
                padding:"6px 14px",cursor:"pointer",fontSize:9,letterSpacing:2,fontFamily:"monospace",
                color:tab===t?"#ff6b2b":"#888888",
                borderBottom:tab===t?"2px solid #ff6b2b":"2px solid #333333",transition:"all 0.1s"}}>
                {t==="diff"?"DIFF ("+analysis.diff.length+")":
                  t==="overview"?T.tabOverview:
                  t==="params"?T.tabParams:
                  t==="kennfelder"?T.tabMaps:
                  t==="timing"?"TIMING":
                  t==="export"?"EXPORT":
                  t.toUpperCase()}
              </button>
            ))}
          </div>

          {/* OVERVIEW */}
          {tab==="overview"&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
              {Object.entries(CAT_DEFS_FN(T)).map(([cat,{label,color}])=>{
                const ps=analysis.params.filter(p=>p.cat===cat&&p.result.valid);
                if(!ps.length)return null;
                const ok=ps.filter(p=>p.result.status==="ok").length;
                const bad=ps.filter(p=>p.result.status==="bad").length;
                const st=bad>0?"bad":ok===ps.length?"ok":"stock";
                return(
                  <div key={cat} style={{border:"1px solid "+SC[st]+"22",borderLeft:"3px solid "+SC[st],
                    borderRadius:6,padding:"9px 11px",background:"#0b0b0b"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                      <span style={{fontSize:8,letterSpacing:2,color}}>{label}</span>
                      <Badge status={st}/>
                    </div>
                    <div style={{fontSize:9,color:"#707070"}}>
                      <span style={{color:"#00ff88"}}>{ok}</span>/{ps.length} OK
                      {bad>0&&<span style={{color:"#ff3c3c"}}> / {bad} Fehler</span>}
                    </div>
                  </div>
                );
              })}
              {Object.entries(MAP_CAT_DEFS_FN(T)).map(([cat,{label,color}])=>{
                const ms=analysis.maps.filter(m=>m.cat===cat&&m.result.valid);
                if(!ms.length)return null;
                const ok=ms.filter(m=>m.result.status==="ok").length;
                const bad=ms.filter(m=>m.result.status==="bad").length;
                const st=bad>0?"bad":ok===ms.length?"ok":"stock";
                return(
                  <div key={cat} style={{border:"1px solid "+SC[st]+"22",borderLeft:"3px solid "+SC[st],
                    borderRadius:6,padding:"9px 11px",background:"#0b0b0b"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                      <span style={{fontSize:8,letterSpacing:2,color}}>{label}</span>
                      <Badge status={st}/>
                    </div>
                    <div style={{fontSize:9,color:"#707070"}}>
                      {ms.map(m=><span key={m.id} style={{marginRight:8,color:m.result.status==="ok"?"#00ff88":"#ff3c3c"}}>
                        {m.label}: {m.result.detail}
                      </span>)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* PARAMS */}
          {tab==="params"&&Object.entries(CAT_DEFS_FN(T)).map(([cat,{label,color}])=>{
            const ps=analysis.params.filter(p=>p.cat===cat&&p.result.valid);
            if(!ps.length)return null;
            return(
              <div key={cat} style={{border:"1px solid "+color+"22",borderLeft:"3px solid "+color,borderRadius:6,marginBottom:11}}>
                <div style={{padding:"6px 11px",background:color+"10",fontSize:8,color,letterSpacing:2,fontWeight:700}}>{label}</div>
                <div style={{padding:"6px 11px"}}>{ps.map(p=><PRow key={p.id} p={p} T={T}/>)}</div>
              </div>
            );
          })}

          {/* KENNFELDER */}
          {tab==="kennfelder"&&Object.entries(MAP_CAT_DEFS_FN(T)).map(([cat,{label,color}])=>{
            const ms=analysis.maps.filter(m=>m.cat===cat&&m.result.valid);
            if(!ms.length)return null;
            return(
              <div key={cat} style={{border:"1px solid "+color+"22",borderLeft:"3px solid "+color,borderRadius:6,marginBottom:11}}>
                <div style={{padding:"6px 11px",background:color+"10",fontSize:8,color,letterSpacing:2,fontWeight:700}}>{label}</div>
                <div style={{padding:"6px 11px"}}>
                  {ms.map(m=>(
                    <div key={m.id} style={{display:"grid",gridTemplateColumns:"110px 1fr 80px",alignItems:"center",
                      padding:"4px 0",borderBottom:"1px solid #0e0e0e",fontSize:10}}>
                      <span style={{fontFamily:"monospace",color:"#e8e8e8"}}>{m.label}</span>
                      <span style={{color:"#606060",fontSize:9}}>{m.desc} / {m.result.detail}</span>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:3}}>
                        <Badge status={m.result.status}/>
                        {m.result.mirrorOk!==undefined&&<MDot ok={m.result.mirrorOk}/>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* TIMING */}
          {tab==="timing"&&(
            <div>
              <div style={{fontSize:9,color:"#666666",marginBottom:14,lineHeight:1.8}}>
                {analysis.diff?"Farbe = Delta zur Referenz: gruen = mehr Vorzuendung, rot = weniger. Tooltip = absoluter Wert."
                  :"Absoluter Zuendwinkelwert. Dunkel = weniger Vorzuendung. 1 raw = 0.75 Grad."}
              </div>
              {analysis.maps.filter(m=>m.cat==="IGN"&&m.result.valid&&m.result.vals).map(m=>(
                <TimingMap key={m.id} label={m.label+" -- "+m.result.detail} vals={m.result.vals} refVals={m.result.refVals}/>
              ))}
            </div>
          )}

          {/* DIFF */}
          {tab==="diff"&&analysis.diff&&(
            <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:14}}>
                {Object.entries(RISK_LABEL).map(([risk,lbl])=>{
                  const cnt=analysis.diff.filter(b=>b.region.risk===risk).length;
                  if(!cnt)return null;
                  const c=RISK_COLOR[risk];
                  return(
                    <div key={risk} style={{background:c+"0e",border:"1px solid "+c+"2a",borderRadius:5,padding:"8px 10px",textAlign:"center"}}>
                      <div style={{fontSize:20,color:c,fontWeight:700}}>{cnt}</div>
                      <div style={{fontSize:8,color:c,letterSpacing:1,marginTop:2}}>{lbl}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{fontSize:8,color:"#909090",letterSpacing:2,marginBottom:7,display:"grid",
                gridTemplateColumns:"12px 120px 80px 50px 1fr",gap:8}}>
                <span/><span>ADRESSE</span><span>GESAMT/DIFF</span><span>TYP</span><span>REGION</span>
              </div>
              {analysis.diff.filter(b=>b.region.risk!=="mirror"&&b.region.risk!=="code").map((b,i)=>{
                const c=RISK_COLOR[b.region.risk]||"#555";
                return(
                  <div key={i} style={{display:"grid",gridTemplateColumns:"12px 120px 80px 50px 1fr",
                    alignItems:"center",padding:"4px 0",borderBottom:"1px solid #0e0e0e",fontSize:9,gap:8}}>
                    <div style={{width:3,height:12,background:c,borderRadius:2}}/>
                    <span style={{fontFamily:"monospace",color:"#909090",fontSize:8}}>
                      0x{b.start.toString(16).toUpperCase().padStart(5,"0")}-0x{b.end.toString(16).toUpperCase().padStart(5,"0")}
                    </span>
                    <span style={{color:"#787878",fontSize:8}}>{b.total}B/{b.changed}B</span>
                    <span style={{fontSize:7,padding:"1px 4px",borderRadius:3,letterSpacing:1,
                      background:c+"22",color:c,border:"1px solid "+c+"44",whiteSpace:"nowrap"}}>
                      {RISK_LABEL[b.region.risk]||"?"}
                    </span>
                    <span style={{color:"#e8e8e8"}}>{b.region.name}</span>
                  </div>
                );
              })}
              {analysis.diff.filter(b=>b.region.risk==="mirror"||b.region.risk==="code").length>0&&(
                <div style={{marginTop:10,fontSize:8,color:"#909090"}}>
                  + {analysis.diff.filter(b=>b.region.risk==="mirror"||b.region.risk==="code").length} Bloecke in Code/Mirror (ausgeblendet)
                </div>
              )}
            </div>
          )}

          {/* EXPORT */}
          {tab==="export"&&(
            <div>
              
              {/* ── Datei zur Sammlung beitragen ── */}
              <div style={{marginBottom:14,padding:"10px 12px",background:"#0d1a0d",
                border:"1px solid #1a3a1a",borderRadius:4}}>
                <div style={{fontSize:9,color:"#00ff88",letterSpacing:2,marginBottom:6}}>
                  {T.collectTitle}
                </div>
                <div style={{fontSize:8,color:"#909090",marginBottom:8,lineHeight:1.5}}>
                  {T.collectDesc}
                </div>
                {(uploadState===null)&&(
                  <button onClick={()=>uploadToCollection()}
                    style={{background:"#003300",border:"1px solid #00ff88",color:"#00ff88",
                      padding:"5px 14px",fontSize:8,borderRadius:3,cursor:"pointer",
                      letterSpacing:1}}>
                    {T.collectBtn}
                  </button>
                )}
                {uploadState==="uploading"&&(
                  <div style={{fontSize:8,color:"#f59e0b"}}>{T.collectSending}</div>
                )}
                {uploadState==="done"&&(
                  <div style={{fontSize:8,color:"#00ff88"}}>{T.collectDone}</div>
                )}
                {uploadState==="error"&&(
                  <div style={{fontSize:8,color:"#ff3c3c"}}>{T.collectError}</div>
                )}
                {uploadState==="duplicate"&&(
                  <div style={{fontSize:8,color:"#f59e0b"}}>{T.collectDupe}</div>
                )}
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                {[
                  {t:T.exportJSON,i:"{}",d:T.exportJSONd,
                    fn:()=>downloadFile(buildExportJSON(analysis,tuneFile?.name,refFile?.name),"ME28_"+tuneFile?.name?.replace(/\.[^.]+$/,"")+"_Score"+Math.round(analysis.score)+"pct.json","application/json")},
                  {t:T.exportTXT,i:"=",d:T.exportTXTd,
                    fn:()=>downloadFile(buildExportText(analysis,tuneFile?.name,refFile?.name,T),"ME28_Protokoll_"+tuneFile?.name?.replace(/\.[^.]+$/,"")+"_Score"+Math.round(analysis.score)+"pct.txt","text/plain")},
                ].map(({t,i,d,fn})=>(
                  <div key={t} style={{background:"#0b0b0b",border:"1px solid #181818",borderRadius:8,padding:18,textAlign:"center"}}>
                    <div style={{fontSize:26,marginBottom:8,color:"#ff6b2b"}}>{i}</div>
                    <div style={{fontSize:11,color:"#e8e8e8",marginBottom:5}}>{t}</div>
                    <div style={{fontSize:8,color:"#585858",marginBottom:14}}>{d}</div>
                    <button onClick={fn} style={{background:"#ff6b2b",border:"none",color:"#000",
                      padding:"7px 18px",borderRadius:4,cursor:"pointer",fontSize:9,
                      fontFamily:"monospace",letterSpacing:2,fontWeight:700}}>
                      HERUNTERLADEN
                    </button>
                  </div>
                ))}
              </div>
              <div style={{background:"#0b0b0b",border:"1px solid #181818",borderRadius:8,padding:12}}>
                <div style={{fontSize:7,color:"#909090",letterSpacing:2,marginBottom:6}}>VORSCHAU</div>
                <pre style={{fontSize:8,color:"#707070",lineHeight:1.6,overflow:"auto",maxHeight:250,
                  whiteSpace:"pre",fontFamily:"monospace",margin:0}}>
                  {buildExportText(analysis,tuneFile?.name,refFile?.name,T).split("\n").slice(0,25).join("\n")}
                </pre>
              </div>
            </div>
          )}
        </>)}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box}
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-track{background:#080808}
        ::-webkit-scrollbar-thumb{background:#1e1e1e;border-radius:2px}
      `}</style>
    </div>
  );
}
