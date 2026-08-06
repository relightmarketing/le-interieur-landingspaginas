// Google Apps Script — L&E Interieur aanvraagformulieren
// Deploy als Web App: Execute as "Me", Who has access "Anyone"
// Koppel dit script aan de Google Sheet "Google Ads aanvragen" (tabs: keukenrenovatie, keuken nieuw, maatkasten)

const ONTVANGER = "arthur@relightmarketing.com, jos@leneinterieur.be";

// Meta Conversions API (server-side)
const META_PIXEL_ID   = "886954613675038";
const META_API_VERSION = "v25.0";
// De access token staat veilig in Script-eigenschappen (Projectinstellingen → Scripteigenschappen),
// onder de sleutel META_CAPI_TOKEN — niet in deze code.

const SHEET_TABS = {
  'Keukenrenovatie': 'keukenrenovatie',   // ← exacte tabnaam in jouw Sheet
  'Keukens':         'keuken nieuw',       // ← exacte tabnaam in jouw Sheet
  'Maatkasten':      'maatkasten'          // ← wordt automatisch aangemaakt bij de eerste aanvraag
};

// Attributie-kolommen (toegevoegd 2026-08-06). Staan ACHTERAAN, zodat bestaande
// tabs en historische rijen niet verschuiven.
const BRON_KOLOMMEN = ["Bron", "Campagne", "Click ID", "Landingspagina"];

const KOLOMMEN = {
  'Keukenrenovatie': ["Datum", "Naam", "Telefoon", "E-mail", "Stad/Gemeente", "Type renovatie", "Bericht"].concat(BRON_KOLOMMEN),
  'Keukens':         ["Datum", "Naam", "Telefoon", "E-mail", "Stad/Gemeente", "Project type",   "Bericht"].concat(BRON_KOLOMMEN),
  'Maatkasten':      ["Datum", "Naam", "Telefoon", "E-mail", "Stad/Gemeente", "Type kast",      "Bericht"].concat(BRON_KOLOMMEN)
};

// Fallback voor tabs die niet in KOLOMMEN staan (o.a. 'Homepage', die automatisch ontstaat)
const STANDAARD_KOLOMMEN = ["Datum", "Naam", "Telefoon", "E-mail", "Stad/Gemeente", "Type", "Bericht"].concat(BRON_KOLOMMEN);

// Wat we per pagina aan Meta doorgeven in de Conversions API
const CAPI_CONTENT = {
  'Keukenrenovatie': { content_name: 'Keukenrenovatie — gratis adviesgesprek', content_category: 'Keukenrenovatie' },
  'Keukens':         { content_name: 'Keukens — gratis 3D-ontwerp',            content_category: 'Keukens' },
  'Maatkasten':      { content_name: 'Maatkasten — gratis 3D-ontwerp',         content_category: 'Maatkasten' }
};

function doPost(e) {
  try {
    const data = e.parameter;
    logNaarSheet(data);
    stuurMail(data);
    if (data.event_id) stuurMetaCapi(data);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Zorgt dat de kop-rij álle verwachte kolommen heeft.
//
// Waarom dit bestaat: in juni 2026 schreef dit script 6 waarden weg in tabs met
// 7 kolommen, waardoor elke rij één kolom opschoof. Dat was niet zichtbaar tot
// iemand de Sheet opende. Het aantal weggeschreven waarden en het aantal
// kolommen moeten dus altijd gelijk lopen — deze functie bewaakt dat, ook voor
// tabs die al bestonden vóór er kolommen bijkwamen.
function zorgVoorKolommen(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    return;
  }

  const breedte = Math.max(sheet.getLastColumn(), 1);
  const huidig  = sheet.getRange(1, 1, 1, breedte).getValues()[0];

  if (huidig.length < headers.length) {
    const ontbreekt = headers.slice(huidig.length);
    sheet.getRange(1, huidig.length + 1, 1, ontbreekt.length)
         .setValues([ontbreekt])
         .setFontWeight("bold");
  }
}

function logNaarSheet(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabNaam = SHEET_TABS[data.pagina] || data.pagina || 'Overig';
  let sheet = ss.getSheetByName(tabNaam);

  if (!sheet) {
    sheet = ss.insertSheet(tabNaam);
  }

  const headers = KOLOMMEN[data.pagina] || STANDAARD_KOLOMMEN;
  zorgVoorKolommen(sheet, headers);

  // Volgorde MOET gelijklopen met `headers` hierboven.
  sheet.appendRow([
    new Date(),
    data.naam     || "",
    data.telefoon || "",
    data.email    || "",
    data.stad     || "",
    data.type     || "",
    data.bericht  || "",
    data.bron     || "Direct / onbekend",
    data.campagne || "",
    data.click_id || "",
    data.landing  || ""
  ]);
}

function stuurMail(data) {
  const onderwerp = `Nieuwe aanvraag — ${data.pagina || "website"}: ${data.naam || "onbekend"}`;
  const body = `
Nieuwe aanvraag via info.leneinterieur.be

Naam:      ${data.naam     || "-"}
Telefoon:  ${data.telefoon || "-"}
E-mail:    ${data.email    || "-"}
Stad/Gem.: ${data.stad     || "-"}
Type:      ${data.type     || "-"}
Bericht:   ${data.bericht  || "-"}
Pagina:    ${data.pagina   || "-"}
Tijdstip:  ${new Date().toLocaleString("nl-BE")}

--- Waar komt deze lead vandaan ---
Bron:      ${data.bron     || "Direct / onbekend"}
Campagne:  ${data.campagne || "-"}
Click ID:  ${data.click_id || "-"}
Landing:   ${data.landing  || "-"}
  `.trim();

  GmailApp.sendEmail(ONTVANGER, onderwerp, body);
}

function doGet(e) {
  try {
    Logger.log('doGet aangeroepen');
    Logger.log('e.parameter: ' + JSON.stringify(e.parameter));
    const data = e.parameter;
    if (data && data.naam) {
      Logger.log('Data geldig, verwerken...');
      logNaarSheet(data);
      stuurMail(data);
      if (data.event_id) stuurMetaCapi(data);
      Logger.log('Klaar');
    } else {
      Logger.log('Geen geldige data ontvangen: ' + JSON.stringify(data));
    }
  } catch (err) {
    Logger.log('FOUT: ' + err.message);
  }
  return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
}

// ── Meta Conversions API: stuurt server-side een gehashte, gededupliceerde Lead ──
function stuurMetaCapi(data) {
  try {
    const token = PropertiesService.getScriptProperties().getProperty('META_CAPI_TOKEN');
    if (!token) { Logger.log('META_CAPI_TOKEN ontbreekt — CAPI overgeslagen'); return; }

    const userData = {};
    if (data.email)    userData.em = [sha256(normEmail(data.email))];
    if (data.telefoon) userData.ph = [sha256(normPhone(data.telefoon))];

    const naam = (data.naam || "").trim();
    if (naam) {
      const delen = naam.split(/\s+/);
      userData.fn = [sha256(delen[0].toLowerCase())];
      if (delen.length > 1) userData.ln = [sha256(delen.slice(1).join(" ").toLowerCase())];
    }
    if (data.stad) userData.ct = [sha256(normCity(data.stad))];   // stad/gemeente → betere matching
    if (data.fbp) userData.fbp = data.fbp;   // niet hashen
    if (data.fbc) userData.fbc = data.fbc;   // niet hashen

    const event = {
      event_name: "Lead",
      event_time: Math.floor(Date.now() / 1000),
      action_source: "website",
      event_id: data.event_id,                                 // dedup met de browser-pixel
      event_source_url: data.event_source_url || "https://info.leneinterieur.be/keukens",
      user_data: userData,
      custom_data: CAPI_CONTENT[data.pagina] || { content_name: data.pagina || "Website", content_category: data.pagina || "Website" }
    };

    const payload = { data: [event] };
    // Tijdens testen: haal de volgende regel uit commentaar en zet je testcode uit Events Manager erin.
    // payload.test_event_code = "TEST76055";

    const url = "https://graph.facebook.com/" + META_API_VERSION + "/" + META_PIXEL_ID +
                "/events?access_token=" + encodeURIComponent(token);

    const resp = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    Logger.log("Meta CAPI " + resp.getResponseCode() + ": " + resp.getContentText());
  } catch (err) {
    Logger.log("Meta CAPI fout: " + err.message);
  }
}

function normEmail(v) {
  return String(v).trim().toLowerCase();
}

function normPhone(v) {
  let d = String(v).replace(/[^0-9]/g, "");
  if (d.indexOf("0") === 0) d = "32" + d.substring(1);   // BE: 0... → 32...
  return d;
}

// Meta-spec voor 'ct': kleine letters, geen accenten, geen spaties/leestekens.
// Bv. "Sint-Truiden" → "sinttruiden", "Luik " → "luik".
function normCity(v) {
  return String(v)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function sha256(str) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? "0" + v : v;
  }).join("");
}
