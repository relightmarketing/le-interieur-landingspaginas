// Google Apps Script — L&E Interieur aanvraagformulieren
// Deploy als Web App: Execute as "Me", Who has access "Anyone"
// Koppel dit script aan de Google Sheet met de 2 tabs

const ONTVANGER = "arthur@relightmarketing.com";

const SHEET_TABS = {
  'Keukenrenovatie': 'keukenrenovatie',   // ← exacte tabnaam in jouw Sheet
  'Keukens':         'keuken nieuw'        // ← exacte tabnaam in jouw Sheet
};

const KOLOMMEN = {
  'Keukenrenovatie': ["Datum", "Naam", "Telefoon", "E-mail", "Type renovatie", "Bericht"],
  'Keukens':         ["Datum", "Naam", "Telefoon", "E-mail", "Project type",   "Bericht"]
};

function doPost(e) {
  try {
    const data = e.parameter;
    logNaarSheet(data);
    stuurMail(data);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function logNaarSheet(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabNaam = SHEET_TABS[data.pagina] || data.pagina || 'Overig';
  let sheet = ss.getSheetByName(tabNaam);

  if (!sheet) {
    sheet = ss.insertSheet(tabNaam);
  }

  // Voeg header toe als sheet leeg is
  if (sheet.getLastRow() === 0) {
    const headers = KOLOMMEN[data.pagina] || ["Datum", "Naam", "Telefoon", "E-mail", "Type", "Bericht"];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }

  sheet.appendRow([
    new Date(),
    data.naam     || "",
    data.telefoon || "",
    data.email    || "",
    data.type     || "",
    data.bericht  || ""
  ]);
}

function stuurMail(data) {
  const onderwerp = `Nieuwe aanvraag — ${data.pagina || "website"}: ${data.naam || "onbekend"}`;
  const body = `
Nieuwe aanvraag via info.leneinterieur.be

Naam:      ${data.naam     || "-"}
Telefoon:  ${data.telefoon || "-"}
E-mail:    ${data.email    || "-"}
Type:      ${data.type     || "-"}
Bericht:   ${data.bericht  || "-"}
Pagina:    ${data.pagina   || "-"}
Tijdstip:  ${new Date().toLocaleString("nl-BE")}
  `.trim();

  GmailApp.sendEmail(ONTVANGER, onderwerp, body);
}

function doGet() {
  return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
}
