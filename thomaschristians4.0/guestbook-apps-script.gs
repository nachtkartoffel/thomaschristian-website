/**
 * Gästebuch-Backend für thomaschristians.de
 * ==========================================
 * Läuft als Google Apps Script Web App, gebunden an ein Google Sheet.
 * Neue Einträge landen mit Status "pending" im Sheet, du bekommst per
 * Mail einen Freigeben-/Ablehnen-Link, und nur freigegebene Einträge
 * werden per GET-Request an die Website ausgeliefert.
 *
 * ─────────────────────────────────────────────────────────────────────
 * EINMALIGES SETUP
 * ─────────────────────────────────────────────────────────────────────
 * 1. Neues Google Sheet anlegen (sheets.new).
 * 2. Im Tabellenblatt unten den Reiter ggf. in "Eintraege" umbenennen
 *    (muss exakt zu SHEET_NAME unten passen), und in Zeile 1 diese
 *    Kopfzeile eintragen:
 *      Zeitstempel | Name | Nachricht | Status | Token
 * 3. Erweiterungen -> Apps Script öffnen. Den Standard-Code darin
 *    komplett löschen und diese ganze Datei hier reinkopieren.
 * 4. OWNER_EMAIL unten auf deine eigene Adresse setzen.
 * 5. Oben rechts "Bereitstellen" -> "Neue Bereitstellung".
 *    - Typ: "Web-App"
 *    - Ausführen als: "Ich" (dein Google-Konto)
 *    - Zugriff: "Jeder" (WICHTIG – sonst kann die Website nicht
 *      zugreifen, da sie ja nicht in deinem Google-Konto eingeloggt ist)
 * 6. Beim ersten Bereitstellen fragt Google nach Berechtigungen (Zugriff
 *    aufs Sheet + E-Mails senden) – bestätigen. Ggf. erscheint eine
 *    "Diese App wurde nicht verifiziert"-Warnung, weil es dein eigenes,
 *    privates Script ist – auf "Erweitert" -> "Trotzdem öffnen" klicken.
 * 7. Die angezeigte Web-App-URL kopieren (endet auf /exec).
 * 8. In index.html nach "GUESTBOOK_API_URL" suchen und dort einfügen:
 *      const GUESTBOOK_API_URL = 'https://script.google.com/macros/s/.../exec';
 *
 * Wenn du den Code hier später änderst: erneut "Bereitstellen" ->
 * "Bereitstellungen verwalten" -> Stift-Symbol -> "Neue Version" wählen
 * (die /exec-URL bleibt dabei gleich).
 *
 * ─────────────────────────────────────────────────────────────────────
 * FREIGRENZEN (privates Google-Konto)
 * ─────────────────────────────────────────────────────────────────────
 * Für ein Portfolio-Gästebuch völlig ausreichend: ca. 100 E-Mails/Tag,
 * ca. 20.000 URL-Aufrufe/Tag. Kein eingebauter Spam-Schutz außer dem
 * Honeypot-Feld auf der Website – bei Bedarf lässt sich hier noch ein
 * einfaches Rate-Limiting pro Zeitfenster ergänzen.
 */

const SHEET_NAME = 'Eintraege';
const OWNER_EMAIL = 'hi@thomaschristians.de'; // <-- auf deine Adresse anpassen
const MAX_NAME_LEN = 40;
const MAX_MSG_LEN = 160;

function getSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error('Tabellenblatt "' + SHEET_NAME + '" nicht gefunden – Reiter-Namen prüfen.');
  }
  return sheet;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function htmlResponse_(html) {
  return HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;padding:40px;font-size:16px;">' + html + '</div>'
  );
}

// ─── Neue Einträge entgegennehmen (POST von der Website) ───────────────
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // Honeypot: unsichtbares Feld auf der Website, das nur Bots
    // ausfüllen. Ist es befüllt, wird der Eintrag stillschweigend
    // ignoriert (kein Fehler zurückgeben, damit Bots nicht merken,
    // dass sie erkannt wurden).
    if (body.website) {
      return jsonResponse_({ ok: true });
    }

    const name = String(body.name || '').trim().slice(0, MAX_NAME_LEN);
    const message = String(body.message || '').trim().slice(0, MAX_MSG_LEN);
    if (!name || !message) {
      return jsonResponse_({ ok: false, error: 'Name oder Nachricht fehlt.' });
    }

    const token = Utilities.getUuid();
    const sheet = getSheet_();
    sheet.appendRow([new Date(), name, message, 'pending', token]);

    sendApprovalEmail_(name, message, token);

    return jsonResponse_({ ok: true });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

function sendApprovalEmail_(name, message, token) {
  const baseUrl = ScriptApp.getService().getUrl();
  const approveUrl = baseUrl + '?action=approve&token=' + encodeURIComponent(token);
  const rejectUrl = baseUrl + '?action=reject&token=' + encodeURIComponent(token);

  const body =
    'Neuer Gästebuch-Eintrag auf thomaschristians.de:\n\n' +
    'Name: ' + name + '\n' +
    'Nachricht: ' + message + '\n\n' +
    'Freigeben:  ' + approveUrl + '\n' +
    'Ablehnen:   ' + rejectUrl + '\n\n' +
    '(Link einfach im Browser öffnen, keine weitere Bestätigung nötig.)';

  MailApp.sendEmail(OWNER_EMAIL, 'Neuer Gästebuch-Eintrag: ' + name, body);
}

// ─── Freigeben/Ablehnen per Klick + öffentliche Liste (GET) ─────────────
function doGet(e) {
  const action = e.parameter.action;

  if (action === 'approve' || action === 'reject') {
    return handleModeration_(e.parameter.token, action === 'approve' ? 'approved' : 'rejected');
  }

  // Standard-Aufruf (von der Website): freigegebene Einträge als JSON
  // zurückgeben, neueste zuerst.
  const sheet = getSheet_();
  const rows = sheet.getDataRange().getValues();
  const entries = [];
  for (let i = 1; i < rows.length; i++) {
    const timestamp = rows[i][0];
    const name = rows[i][1];
    const message = rows[i][2];
    const status = rows[i][3];
    if (status === 'approved') {
      entries.push({
        name: name,
        message: message,
        timestamp: timestamp instanceof Date ? timestamp.toISOString() : String(timestamp)
      });
    }
  }
  entries.reverse(); // neueste zuerst

  return jsonResponse_({ ok: true, entries: entries });
}

function handleModeration_(token, newStatus) {
  if (!token) return htmlResponse_('Kein Token angegeben.');

  const sheet = getSheet_();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][4] === token) {
      sheet.getRange(i + 1, 4).setValue(newStatus); // Spalte D = Status
      const label = newStatus === 'approved' ? 'freigegeben' : 'abgelehnt';
      return htmlResponse_('Eintrag von "' + rows[i][1] + '" wurde ' + label + '.');
    }
  }
  return htmlResponse_('Eintrag nicht gefunden (evtl. schon vorher bearbeitet).');
}
