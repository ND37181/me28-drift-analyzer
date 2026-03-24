/**
 * ME2.8 Drift Analyzer — Flash File Collector
 * © 2026 KFZ Dietrich, Nils Dietrich
 *
 * Google Apps Script Web App
 * Empfängt Flash-Dateien vom Drift Analyzer Tool und speichert
 * sie in Google Drive + loggt Metadaten in Google Sheets.
 */

// ═══════════════════════════════════════════════════════════════
// KONFIGURATION — hier anpassen
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  // Google Drive Ordner-ID (aus der URL deines Drive-Ordners)
  // Beispiel: https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrS
  //                                                  ^^^^^^^^^^^^^^^^^^^^^ das ist die ID
  DRIVE_FOLDER_ID: "1Lo8LXGeL4yBkI4fC3UFZazvynnmJoCGG",

  // Google Sheets ID für Metadaten-Log
  // Beispiel: https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrS/edit
  SHEETS_ID: "1QYk8oN7UGw2Ftw6Um9WtP2I7hbByQeil223OIQA3xCg",

  // Maximale Dateigröße (600KB = 512KB Flash + Puffer)
  MAX_FILE_SIZE: 600000,
};

// ═══════════════════════════════════════════════════════════════
// HAUPTFUNKTION — wird bei jedem POST aufgerufen
// ═══════════════════════════════════════════════════════════════

function doPost(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    const data = JSON.parse(e.postData.contents);

    // Pflichtfelder prüfen
    if (!data.file || !data.filename || !data.sw || data.score === undefined) {
      return respond(output, 400, "Fehlende Pflichtfelder");
    }

    // Zustimmung prüfen
    if (!data.accepted) {
      return respond(output, 403, "Nutzungsbedingungen nicht akzeptiert");
    }

    // Datei aus Base64 dekodieren
    const fileBytes = Utilities.base64Decode(data.file);

    // Größenprüfung
    if (fileBytes.length > CONFIG.MAX_FILE_SIZE) {
      return respond(output, 413, "Datei zu groß");
    }

    // Duplikatprüfung via SHA-256
    if (data.sha256 && isDuplicate(data.sha256)) {
      return respond(output, 409, "Datei bereits vorhanden", { sha256: data.sha256 });
    }

    // Dateiname zusammenbauen: Datum_SW_ScoreXXpct_Originalname
    const timestamp = Utilities.formatDate(
      new Date(), "Europe/Berlin", "yyyy-MM-dd_HH-mm-ss"
    );
    const safeFilename = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const finalFilename =
      timestamp + "_" + data.sw +
      "_Score" + Math.round(data.score) + "pct_" +
      safeFilename;

    // In Google Drive speichern
    const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    const blob = Utilities.newBlob(
      fileBytes, "application/octet-stream", finalFilename
    );
    const savedFile = folder.createFile(blob);

    // Metadaten in Google Sheets loggen
    logToSheets({
      timestamp,
      filename:         finalFilename,
      originalFilename: data.filename,
      sw:               data.sw,
      score:            data.score,
      engine:           data.engine  || "unbekannt",
      mirrorOk:         data.mirrorOk || false,
      sha256:           data.sha256  || "",
      analysisJson:     JSON.stringify(data.analysis || {}),
      fileId:           savedFile.getId(),
      fileUrl:          savedFile.getUrl(),
    });

    return respond(output, 200, "Gespeichert", {
      saved: finalFilename,
    });

  } catch (err) {
    return respond(output, 500, "Fehler: " + err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// GOOGLE SHEETS LOG
// ═══════════════════════════════════════════════════════════════

function logToSheets(meta) {
  try {
    const ss    = SpreadsheetApp.openById(CONFIG.SHEETS_ID);
    let   sheet = ss.getSheetByName("Flash-Log");

    // Sheet mit Header anlegen wenn noch nicht vorhanden
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
  } catch (err) {
    // Sheets-Fehler nicht werfen — Datei wurde trotzdem gespeichert
    console.log("Sheets-Log Fehler: " + err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// DUPLIKATPRÜFUNG — prüft SHA-256 gegen bestehende Einträge
// ═══════════════════════════════════════════════════════════════

function isDuplicate(sha256) {
  try {
    const ss    = SpreadsheetApp.openById(CONFIG.SHEETS_ID);
    const sheet = ss.getSheetByName("Flash-Log");
    if (!sheet) return false;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return false;

    // SHA-256 Spalte = Spalte 8
    const hashes = sheet.getRange(2, 8, lastRow - 1, 1).getValues();
    return hashes.some(row => row[0] === sha256);
  } catch {
    return false; // Im Zweifel: nicht als Duplikat werten
  }
}

// ═══════════════════════════════════════════════════════════════
// GET — Healthcheck (zum Testen ob das Script läuft)
// ═══════════════════════════════════════════════════════════════

function doGet() {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  return respond(output, 200, "ME2.8 Collector aktiv", {
    version:   "1.0",
    betreiber: "KFZ Dietrich"
  });
}

// ═══════════════════════════════════════════════════════════════
// HILFSFUNKTION
// ═══════════════════════════════════════════════════════════════

function respond(output, status, message, extra) {
  output.setContent(JSON.stringify({
    status,
    message,
    ...(extra || {})
  }));
  return output;
}
