const SPREADSHEET_ID     = 'https://docs.google.com/spreadsheets/d/1-1Rmllu_ZXUI9E7ehNq8_m9NcMxMz9o4nSEdOKBOTww/edit?usp=drivesdk';
const DASHBOARD_PASSWORD = 'oracle2026';

// ── Receive a new lead (called by app.js with mode:no-cors) ─────────────────────

function doPost(e) {
  try {
    const data  = JSON.parse(e.postData.contents);
    const sheet = getOrCreateSheet();

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp','Email','Name','Company','Role','Hotel URL','Score','Grade','Source']);
      sheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#1a3828').setFontColor('#4ee8b4');
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      new Date().toISOString(),
      data.email   || '',
      data.name    || '',
      data.company || '',
      data.role    || '',
      data.hotelUrl|| '',
      data.score   || '',
      data.grade   || '',
      data.source  || '',
    ]);

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message });
  }
}

// ── Serve leads to the dashboard (JSONP-capable) ─────────────────────────────

function doGet(e) {
  const cb  = e.parameter.callback || '';
  const pwd = e.parameter.password || '';

  if (pwd !== DASHBOARD_PASSWORD) {
    return respond(cb, { error: 'unauthorized' });
  }

  try {
    const sheet  = getOrCreateSheet();
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return respond(cb, { leads: [], total: 0 });

    const headers = values[0];
    const leads   = values.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[String(h)] = row[i]; });
      return obj;
    });

    return respond(cb, { leads, total: leads.length });
  } catch (err) {
    return respond(cb, { error: err.message });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────────────

function getOrCreateSheet() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheetByName('Leads') || ss.getActiveSheet();
}

function respond(callback, data) {
  const payload = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(`${callback}(${payload})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
