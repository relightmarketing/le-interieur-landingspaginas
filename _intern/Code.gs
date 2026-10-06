// Google Apps Script — L&E Interieur aanvraagformulieren
// Deploy als Web App: Execute as "Me", Who has access "Anyone"
// Koppel dit script aan de Google Sheet "Google Ads aanvragen" (tabs: keukenrenovatie, keuken nieuw, maatkasten)
//
// TWEE SOORTEN AANVRAGEN (sinds v2, oktober 2026):
//   - Oud formulier (geen `v`-parameter): één verzending per aanvraag → rij toevoegen,
//     mail, CAPI. Ongewijzigd, zodat de live pagina's blijven werken tijdens de uitrol.
//   - Stappenformulier (`v=2`): één verzending per stap, allemaal met hetzelfde `lead_id`.
//       · Elke stap → tab "Funnel": één rij per bezoeker, bijgewerkt. Zonder naam, telefoon,
//         e-mail of bericht. Toont waar mensen afhaken.
//       · Zodra er contactgegevens zijn (stap 5) → rij in de tab van de pagina, zoals vroeger.
//         Achteraan de opvolgkolommen van L&E en de scriptkolommen (zie V2_KOLOMMEN).
//         Volgende stappen werken dezelfde rij bij. Eén rij = één lead, dus het tellen blijft gelijk.
//       · Mail aan Arthur + Jos één keer, bij het verzenden van het formulier (laatste stap).
//         Wie na de contactstap afhaakt, staat in de Sheet met Status "Niet afgerond"
//         (rij lichtoranje), zonder mail.
//       · CAPI enkel bij de contactstap (alleen dan stuurt het formulier een event_id mee).
//   - Testaanvragen (`test=1`, via ?test=sheet op de pagina): tab "Test" en "Funnel test",
//     mail enkel naar Arthur, geen CAPI.

const ONTVANGER = "arthur@relightmarketing.com, jos@leneinterieur.be";
const ONTVANGER_TEST = "arthur@relightmarketing.com";

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
  'Maatkasten':      { content_name: 'Maatkasten — gratis 3D-ontwerp',         content_category: 'Maatkasten' },
  'Homepage':        { content_name: 'Homepage — gratis gesprek',              content_category: 'Algemeen' }
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
    if (data && data.v === '2') {
      verwerkStap(data);
      Logger.log('Klaar (v2, stap ' + data.stap + ')');
    } else if (data && data.naam) {
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

// ══════════════════════════════════════════════════════════════════════════
// STAPPENFORMULIER (v2)
// ══════════════════════════════════════════════════════════════════════════

// Extra kolommen achteraan in de tab van elke pagina. De eerste 11 blijven
// exact zoals vroeger, zodat oude rijen en het maandrapport niet verschuiven.
// Eerst de opvolgkolommen die L&E zelf invult (namen exact zoals in de tab
// keukenrenovatie, aangemaakt 06/10/2026 — het script schrijft er nooit in),
// daarna de kolommen die het script vult. Kolommen worden op NAAM gezocht:
// een naam wijzigen in de Sheet = het script maakt een nieuwe kolom aan.
const OPVOLG_KOLOMMEN = ["Afspraak gemaakt", "Opgedaagd?", "Offerte gemaakt?", "gewonnen / verloren"];
const SCRIPT_KOLOMMEN = ["Lead ID", "Status", "Timing", "Fase"];
const V2_KOLOMMEN = OPVOLG_KOLOMMEN.concat(SCRIPT_KOLOMMEN);

// Wat in de kolom Status komt. Het formulier stuurt anoniem / lead / volledig;
// in de Sheet staat leesbare tekst. "Niet afgerond" = contactgegevens gegeven maar
// niet verzonden → GEEN mail. Die rijen kleuren lichtoranje (zie zorgVoorMarkering).
const STATUS_LABEL = { anoniem: "Anoniem", lead: "Niet afgerond", volledig: "Afgerond" };
const MARKEER_KLEUR = "#FCE5CD";   // lichtoranje
function statusLabel(s) { return STATUS_LABEL[s] || STATUS_LABEL.lead; }
function isAfgerond(label) { return label === STATUS_LABEL.volledig || label === "volledig"; }

// De Funnel-tab: geen persoonsgegevens, enkel hoe ver iemand geraakte.
const FUNNEL_KOLOMMEN = ["Gestart", "Bijgewerkt", "Lead ID", "Pagina", "Laatste stap", "Status",
                         "Type", "Stad/Gemeente", "Timing", "Fase", "Bron", "Campagne", "Landingspagina"];

function verwerkStap(data) {
  const test = data.test === '1';
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);   // stappen kunnen snel na elkaar binnenkomen: geen dubbele rijen
  try {
    bewaarFunnel(data, test);

    if (data.naam) {
      const resultaat = bewaarLead(data, test);
      // Eén mail per lead, pas bij het verzenden van het formulier (laatste stap).
      // Wie na de contactstap afhaakt, staat wél in de Sheet (Status "Niet afgerond", rij oranje), maar krijgt geen mail.
      if (data.status === 'volledig' && !isAfgerond(resultaat.vorigeStatus)) stuurMailV2(data, test);
    }
  } finally {
    lock.releaseLock();
  }

  // Buiten de lock: een trage Meta-API mag de volgende stap niet ophouden.
  if (data.naam && data.event_id && !test) stuurMetaCapi(data);
}

// Zoekt de rij met dit lead_id in de opgegeven kolom. Geeft het rijnummer of 0.
function zoekRij(sheet, kolom, leadId) {
  if (!leadId || sheet.getLastRow() < 2) return 0;
  const cel = sheet.getRange(2, kolom, sheet.getLastRow() - 1, 1)
                   .createTextFinder(leadId).matchEntireCell(true).findNext();
  return cel ? cel.getRow() : 0;
}

// Voorkomt dat invoer als formule wordt gelezen (=, +, -, @) en bewaart de
// voorloopnul van telefoonnummers. Vroeger werd "0496..." in de Sheet "496...".
function alsTekst(v) {
  v = String(v || "");
  return /^[=+\-@0]/.test(v) ? "'" + v : v;
}

function bewaarFunnel(data, test) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const naam = test ? 'Funnel test' : 'Funnel';
  const sheet = ss.getSheetByName(naam) || ss.insertSheet(naam);
  zorgVoorKolommen(sheet, FUNNEL_KOLOMMEN);

  const nu = new Date();
  const rij = zoekRij(sheet, 3, data.lead_id);
  const waarden = [
    data.lead_id || "", data.pagina || "", Number(data.stap) || "", statusLabel(data.status),
    alsTekst(data.type), alsTekst(data.stad), data.timing || "", data.fase || "",
    data.bron || "Direct / onbekend", alsTekst(data.campagne), data.landing || ""
  ];

  if (rij) {
    // Kolom A ("Gestart") blijft staan; de rest wordt bijgewerkt.
    sheet.getRange(rij, 2, 1, waarden.length + 1).setValues([[nu].concat(waarden)]);
  } else {
    sheet.appendRow([nu, nu].concat(waarden));
  }
}

// Voegt ontbrekende koppen achteraan toe, op NAAM (niet op aantal kolommen):
// heeft iemand zelf een kolom toegevoegd, dan komen de nieuwe er gewoon achter.
// Geeft de volledige koprij terug.
function zorgVoorKoppenOpNaam(sheet, namen) {
  let koppen = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  const ontbreekt = namen.filter(function (n) { return koppen.indexOf(n) === -1; });
  if (ontbreekt.length) {
    const start = koppen.filter(String).length ? sheet.getLastColumn() + 1 : 1;
    sheet.getRange(1, start, 1, ontbreekt.length).setValues([ontbreekt]).setFontWeight("bold");
    koppen = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  }
  return koppen;
}

// Kleurt elke rij met Status "Niet afgerond" lichtoranje, via voorwaardelijke
// opmaak (de kleur verdwijnt vanzelf zodra de status "Afgerond" wordt).
// Wordt één keer per tab aangemaakt; bestaat de regel al, dan gebeurt er niets.
// Bewust een formule zonder scheidingstekens (; of ,): die verschillen per taal.
function zorgVoorMarkering(sheet, statusKolom, aantalKolommen) {
  if (!statusKolom) return;
  const regels = sheet.getConditionalFormatRules();
  const bestaat = regels.some(function (r) {
    const c = r.getBooleanCondition();
    return c && c.getCriteriaValues().join(" ").indexOf(STATUS_LABEL.lead) !== -1;
  });
  if (bestaat) return;
  const letter = kolomLetter(statusKolom);
  const bereik = sheet.getRange("A:" + kolomLetter(aantalKolommen));   // hele kolommen: ook toekomstige rijen
  regels.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$' + letter + '1="' + STATUS_LABEL.lead + '"')
    .setBackground(MARKEER_KLEUR)
    .setRanges([bereik])
    .build());
  sheet.setConditionalFormatRules(regels);
}

function kolomLetter(n) {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// Schrijft of werkt de leadrij bij in de tab van de pagina.
// Geeft de status vóór deze update terug, zodat de mail maar één keer vertrekt
// (ook als dezelfde laatste stap twee keer binnenkomt).
function bewaarLead(data, test) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabNaam = test ? 'Test' : (SHEET_TABS[data.pagina] || data.pagina || 'Overig');
  const sheet = ss.getSheetByName(tabNaam) || ss.insertSheet(tabNaam);

  zorgVoorKolommen(sheet, KOLOMMEN[data.pagina] || STANDAARD_KOLOMMEN);
  const koppen = zorgVoorKoppenOpNaam(sheet, V2_KOLOMMEN);
  const kol = {};
  SCRIPT_KOLOMMEN.forEach(function (k) { kol[k] = koppen.indexOf(k) + 1; });
  try { zorgVoorMarkering(sheet, kol["Status"], koppen.length); }
  catch (err) { Logger.log("Markering mislukt (lead wordt wel bewaard): " + err.message); }

  // Eerste 11 kolommen: zelfde volgorde als logNaarSheet().
  const kern = [
    alsTekst(data.naam), alsTekst(data.telefoon), alsTekst(data.email), alsTekst(data.stad),
    alsTekst(data.type), alsTekst(data.bericht),
    data.bron || "Direct / onbekend", alsTekst(data.campagne), data.click_id || "", data.landing || ""
  ];

  const rij = zoekRij(sheet, kol["Lead ID"], data.lead_id);
  if (!rij) {
    const nieuweRij = [new Date()].concat(kern);
    while (nieuweRij.length < koppen.length) nieuweRij.push("");
    nieuweRij[kol["Lead ID"] - 1] = data.lead_id;
    nieuweRij[kol["Status"] - 1]  = statusLabel(data.status);
    nieuweRij[kol["Timing"] - 1]  = data.timing || "";
    nieuweRij[kol["Fase"] - 1]    = data.fase || "";
    sheet.appendRow(nieuweRij);
    return { vorigeStatus: "" };
  }

  const vorigeStatus = String(sheet.getRange(rij, kol["Status"]).getValue() || "");
  sheet.getRange(rij, 2, 1, kern.length).setValues([kern]);   // Datum (kolom A) blijft staan
  sheet.getRange(rij, kol["Status"]).setValue(statusLabel(data.status));
  sheet.getRange(rij, kol["Timing"]).setValue(data.timing || "");
  sheet.getRange(rij, kol["Fase"]).setValue(data.fase || "");

  return { vorigeStatus: vorigeStatus };
}

function stuurMailV2(data, test) {
  const onderwerp = (test ? "[TEST] " : "") +
    `Nieuwe aanvraag ${data.pagina || "website"}: ${data.naam || "onbekend"}`;
  const body = `
Nieuwe aanvraag via info.leneinterieur.be

Naam:          ${data.naam     || "-"}
Telefoon:      ${data.telefoon || "-"}
E-mail:        ${data.email    || "-"}
Gemeente:      ${data.stad     || "-"}
Wat:           ${data.type     || "-"}
Wanneer:       ${data.timing   || "-"}
Hoe ver:       ${data.fase     || "-"}
Bericht:       ${data.bericht  || "-"}
Pagina:        ${data.pagina   || "-"}
Tijdstip:      ${new Date().toLocaleString("nl-BE")}

--- Waar komt deze lead vandaan ---
Bron:      ${data.bron     || "Direct / onbekend"}
Campagne:  ${data.campagne || "-"}
Click ID:  ${data.click_id || "-"}
Landing:   ${data.landing  || "-"}
  `.trim();

  GmailApp.sendEmail(test ? ONTVANGER_TEST : ONTVANGER, onderwerp, body);
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
