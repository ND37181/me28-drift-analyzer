/**
 * ME2.8 Drift Analyzer — Flash File Collector
 * © 2026 KFZ Dietrich, Nils Dietrich
 */

const CONFIG = {
  DRIVE_FOLDER_ID: "1Lo8LXGeL4yBkI4fC3UFZazvynnmJoCGG",
  SHEETS_ID:       "1QYk8oN7UGw2Ftw6Um9WtP2I7hbByQeil223OIQA3xCg",
  MAX_FILE_SIZE:   600000,
};

// ═══════════════════════════════════════════════════════════════
// TEST-FUNKTION — direkt im Apps Script Editor ausführen!
// Menü: Ausführen → testSheetsAccess
// Ergebnis: in der Ausführungs-Konsole (Strg+Enter oder "Ausführen")
// ═══════════════════════════════════════════════════════════════
function testSheetsAccess() {
  try {
    Logger.log("=== SHEETS TEST ===");
    Logger.log("Öffne Spreadsheet: " + CONFIG.SHEETS_ID);
    
    const ss = SpreadsheetApp.openById(CONFIG.SHEETS_ID);
    Logger.log("Spreadsheet OK: " + ss.getName());
    
    // Sheet suchen
    let sheet = ss.getSheetByName("Flash-Log");
    Logger.log("Flash-Log Sheet: " + (sheet ? "gefunden" : "nicht vorhanden → wird erstellt"));
    
    if (!sheet) {
      sheet = ss.insertSheet("Flash-Log");
      sheet.appendRow([
        "Datum/Zeit", "Gespeicherter Dateiname", "Original-Dateiname",
        "SW-Variante", "Score (%)", "Motor",
        "Mirror OK", "SHA-256", "Analyse-JSON", "Drive-Datei-URL"
      ]);
      sheet.getRange(1, 1, 1, 10).setFontWeight("bold");
      sheet.setFrozenRows(1);
      Logger.log("Sheet erstellt + Header gesetzt");
    }
    
    // Test-Zeile schreiben
    sheet.appendRow([
      "TEST " + new Date().toLocaleString(),
      "TEST_DATEI.bin",
      "original.bin",
      "88200001",
      "87",
      "5.5L",
      "Ja",
      "abc123",
      "{}",
      "https://drive.google.com/test"
    ]);
    Logger.log("Test-Zeile geschrieben ✓");
    Logger.log("Sheet URL: " + ss.getUrl());
    Logger.log("=== TEST ERFOLGREICH ===");
    
  } catch(err) {
    Logger.log("FEHLER: " + err.message);
    Logger.log("Stack: " + err.stack);
  }
}

// ═══════════════════════════════════════════════════════════════
// HAUPTFUNKTION
// ═══════════════════════════════════════════════════════════════
// Simuliert einen echten POST mit Mini-Payload — im Editor ausführen zum Testen
function testPost() {
  const fakeEvent = {
    postData: {
      contents: JSON.stringify({
        accepted:   true,
        file:       btoa("TESTDATEN"),  // kleines Fake-Binary
        sha256:     "test_sha256_" + new Date().getTime(),
        filename:   "test.bin",
        sw:         "88200001",
        score:      87,
        engine:     "5.5L",
        mirrorOk:   true,
        analysis:   { score: 87, sw: "88200001", partNr: "TEST", okCount: 10, badCount: 0 },
      })
    }
  };
  const result = doPost(fakeEvent);
  Logger.log("testPost Ergebnis: " + result.getContent());
}

function doPost(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    Logger.log("doPost aufgerufen");
    const rawBody = e.postData ? e.postData.contents : null;
    Logger.log("Body Länge: " + (rawBody ? rawBody.length : "null"));
    if (!rawBody) return respond(output, 400, "Kein Body empfangen");
    
    const data = JSON.parse(rawBody);

    if (!data.file || !data.filename || !data.sw || data.score === undefined) {
      return respond(output, 400, "Fehlende Pflichtfelder");
    }
    if (!data.accepted) {
      return respond(output, 403, "Zustimmung fehlt");
    }

    const fileBytes = Utilities.base64Decode(data.file);

    if (fileBytes.length > CONFIG.MAX_FILE_SIZE) {
      return respond(output, 413, "Datei zu gross");
    }

    // Duplikat-Check
    if (data.sha256 && isDuplicate(data.sha256)) {
      return respond(output, 409, "Duplikat", { sha256: data.sha256 });
    }

    // Dateiname
    const timestamp   = Utilities.formatDate(new Date(), "Europe/Berlin", "yyyy-MM-dd_HH-mm-ss");
    const safeFilename = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const finalFilename = timestamp + "_" + data.sw + "_Score" + Math.round(data.score) + "pct_" + safeFilename;

    // Drive speichern
    const folder    = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    const blob      = Utilities.newBlob(fileBytes, "application/octet-stream", finalFilename);
    const savedFile = folder.createFile(blob);

    // Sheets loggen
    logToSheets({
      timestamp,
      filename:         finalFilename,
      originalFilename: data.filename,
      sw:               data.sw,
      score:            data.score,
      engine:           data.engine   || "unbekannt",
      mirrorOk:         data.mirrorOk || false,
      sha256:           data.sha256   || "",
      analysisJson:     JSON.stringify(data.analysis || {}),
      fileUrl:          savedFile.getUrl(),
    });

    return respond(output, 200, "Gespeichert", { saved: finalFilename });

  } catch (err) {
    // Fehler als Datei in Drive schreiben (sichtbar für Debugging)
    try {
      DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID)
        .createFile("ERROR_" + new Date().getTime() + ".txt",
          "Fehler: " + err.message + "\nStack: " + err.stack, "text/plain");
    } catch(e2) {}
    return respond(output, 500, "Fehler: " + err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// SHEETS LOG
// ═══════════════════════════════════════════════════════════════
function logToSheets(meta) {
  const ss    = SpreadsheetApp.openById(CONFIG.SHEETS_ID);
  let   sheet = ss.getSheetByName("Flash-Log");

  if (!sheet) {
    sheet = ss.insertSheet("Flash-Log");
    sheet.appendRow([
      "Datum/Zeit", "Gespeicherter Dateiname", "Original-Dateiname",
      "SW-Variante", "Score (%)", "Motor",
      "Mirror OK", "SHA-256", "Analyse-JSON", "Drive-Datei-URL"
    ]);
    sheet.getRange(1, 1, 1, 10).setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(2, 280);
    sheet.setColumnWidth(8, 220);
    sheet.setColumnWidth(9, 400);
    sheet.setColumnWidth(10, 300);
  }

  sheet.appendRow([
    meta.timestamp,
    meta.filename,
    meta.originalFilename,
    meta.sw,
    meta.score,
    meta.engine,
    meta.mirrorOk ? "Ja" : "Nein",
    meta.sha256,
    meta.analysisJson,
    meta.fileUrl,
  ]);
}

// ═══════════════════════════════════════════════════════════════
// DUPLIKAT-CHECK
// ═══════════════════════════════════════════════════════════════
function isDuplicate(sha256) {
  try {
    const ss    = SpreadsheetApp.openById(CONFIG.SHEETS_ID);
    const sheet = ss.getSheetByName("Flash-Log");
    if (!sheet || sheet.getLastRow() < 2) return false;
    const hashes = sheet.getRange(2, 8, sheet.getLastRow() - 1, 1).getValues();
    return hashes.some(row => row[0] === sha256);
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════
// HEALTHCHECK
// ═══════════════════════════════════════════════════════════════
function doGet() {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  return respond(output, 200, "ME2.8 Collector aktiv", { version: "3.1", betreiber: "KFZ Dietrich" });
}

function respond(output, status, message, extra) {
  output.setContent(JSON.stringify({ status, message, ...(extra || {}) }));
  return output;
}
