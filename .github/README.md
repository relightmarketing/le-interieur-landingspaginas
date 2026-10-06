# L&E Interieur — landingspagina's

Statische advertentie-landingspagina's voor **L&E Interieur** (Relight-klant #21).
Live op **https://info.leneinterieur.be** via GitHub Pages.

> **Push naar `main` = meteen live.** Geen build, geen deploy-stap.

## Pagina's

| URL | Bestand | `pagina`-waarde | Sheet-tab | Tracking |
|---|---|---|---|---|
| `/` | `index.html` | `Homepage` | `Homepage` | GTM |
| `/keukens` | `keukens.html` | `Keukens` | `keuken nieuw` | GTM + Meta Pixel + CAPI |
| `/keuken-renovatie` | `keuken-renovatie.html` | `Keukenrenovatie` | `keukenrenovatie` | GTM |
| `/maatkasten` | `maatkasten.html` | `Maatkasten` | `maatkasten` | GTM + Meta Pixel + CAPI |
| `/bedankt` | `bedankt.html` | — | — | enkel PageView, **geen** conversie (`noindex`) |

`keukens.html` en `maatkasten.html` hebben de volledige tracking-stack — gebruik één van die twee
als template voor een nieuwe pagina.

## Formulier → waar gaat het heen

Elk formulier doet een GET naar de Apps Script web-app (`APPS_SCRIPT_URL`, bovenaan het
`<script>`-blok van elke pagina). Die schrijft een rij in de Sheet **"Google Ads aanvragen"**,
mailt naar Arthur + Jos, en stuurt bij cookie-toestemming een server-side `Lead` naar Meta
(gededupliceerd met de browser-pixel via `event_id`).

⚠ **`_intern/Code.gs` in deze repo is een kopie, niet de uitvoerende versie.** Het echte script is
sheet-bound aan de Google Sheet. Wijzig je `_intern/Code.gs`, plak het dan in de Apps Script-editor
**en deploy opnieuw** — anders draait de oude versie door.

De Meta CAPI-token staat in Apps Script → Projectinstellingen → Scripteigenschappen
(`META_CAPI_TOKEN`), niet in deze repo.

## Mappen

| Map | Wat | Publiek? |
|---|---|---|
| `/` (hoofdmap) | De pagina's zelf + `CNAME`. **Bestandsnaam = URL**, dus nooit verplaatsen of hernoemen. | ja |
| `assets/` | Gedeelde CSS/JS die de pagina's laden, o.a. het stappenformulier (`stappenformulier.js` + `.css`) | ja |
| `_intern/` | Werkbestanden: kopie van het Apps Script, notities, bronbeelden | **nee** — GitHub Pages publiceert geen mappen die met `_` beginnen |
| `.github/` | Deze README (blijft zichtbaar op GitHub, niet op de website) | nee |

Nieuwe notities, back-ups of bronbestanden horen in `_intern/`, nooit in de hoofdmap:
alles in de hoofdmap is publiek opvraagbaar via `info.leneinterieur.be/<bestandsnaam>`.
Back-ups van pagina's zijn niet nodig: git bewaart elke versie.

## Vaste ID's

- Google Tag Manager: `GTM-ND5Z382N`
- Meta Pixel: `886954613675038`
- GTM-events: `keukens_submission`, `maatkasten_submission`, `phone_click`, `sticky_cta_click`

## Volledige documentatie

`21. L&E/L&E Interieur/02. Ads & Campaigns/Landingspaginas.md` in de Relight-Drive —
inclusief het stappenplan om een nieuwe dienst-pagina toe te voegen en de openstaande punten.
