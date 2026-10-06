# Meta Pixel + Conversions API — stappenplan (keukens-landingspagina)

Pixel-ID: **886954613675038** · Pagina: https://info.leneinterieur.be/keukens
Doel: maximale datakwaliteit voor je Meta-advertenties (browser-pixel + server-side CAPI met deduplicatie, GDPR-conform).

---

## Wat al in de pagina staat (door mij ingebouwd)

- **Browser-pixel** met jouw ID, hoog in de `<head>`.
- **PageView** — bij elke paginaweergave (na toestemming).
- **Lead** — zodra het formulier succesvol wordt verzonden. Met **advanced matching**: e-mail, telefoon, voor- en achternaam uit het formulier worden lokaal in de browser gehasht en meegestuurd, zodat Meta de conversie veel preciezer matcht.
- **Contact** — zodra iemand op een telefoonnummer (`tel:`-link) tikt: in de header, bij het formulier en in de footer.
- Elk conversie-event draagt een uniek **`eventID`** voor deduplicatie met de Conversions API.
- **GDPR-consent**: de pixel start op `revoke` en vuurt pas nadat de bezoeker je cookiebanner accepteert (`grant`). Weigert iemand, dan vuurt niets. Terugkerende bezoekers die eerder accepteerden, worden meteen herkend.

Bijbehorende `dataLayer`-events voor Google/GTM: `keukens_submission` (formulier), `phone_click` (telefoon), `sticky_cta_click` (onderbalk).

Je hoeft hier zelf niets meer aan te coderen. De stappen hieronder doe je in Meta + één keer publiceren.

---

## Beste datakwaliteit voor Meta — checklist

In volgorde van impact:

1. **Conversions API aanzetten** (stap 5) — server-side vangt de events op die de browser mist. Grootste enkele winst (~18% lagere kost per resultaat volgens Meta).
2. **Deduplicatie** — al ingebouwd via `eventID`; controleer in Test Events dat Browser + Server matchen (stap 6).
3. **Advanced matching** — browserkant al ingebouwd op Lead. Zet daarnaast in Events Manager **Automatische advanced matching** aan (dataset → Instellingen → Automatische advanced matching → inschakelen) voor extra velddetectie.
4. **Domein verifiëren + event-prioriteit** (stappen 7–8) — nodig voor correcte attributie sinds iOS.
5. **Eén dataset, juiste standaardevents** — Lead voor formulier, Contact voor telefoon. Gebruik Lead als optimalisatie-event.
6. **Consent** — al conform geregeld; zo blijft je data bruikbaar én rechtmatig.
7. **(Optioneel) Leadwaarde meegeven** — als je weet wat een lead gemiddeld waard is, kun je een `value` + `currency` aan het Lead-event hangen, zodat Meta op waarde i.p.v. aantal kan optimaliseren. Laat het me weten als je dit wil.

---

## Stap 1 — Zet de bijgewerkte pagina live

De pixel werkt alleen op de live pagina. Publiceer `keukens.html` zoals je gewend bent (push naar je repository / je hosting), en controleer daarna dat https://info.leneinterieur.be/keukens de nieuwe versie toont.

## Stap 2 — Controleer dat de pixel vuurt (browser)

1. Installeer in Chrome de extensie **Meta Pixel Helper**.
2. Open je live keukenpagina en **accepteer** de cookiebanner.
3. Klik op het Pixel Helper-icoon: je moet pixel `886954613675038` zien met een **PageView**.
4. Test vóór accepteren ook even: zónder cookie-toestemming hoort er géén PageView te vuren (dat is de GDPR-koppeling die werkt).

## Stap 3 — Controleer het Lead-event

1. Vul op de live pagina het formulier in en verzend het.
2. In Pixel Helper verschijnt nu ook een **Lead**-event.
3. Dit is je conversie — alles wat je in Meta wil optimaliseren hangt hieraan.

## Stap 4 — Bekijk events live in Events Manager

1. Ga naar **Meta Events Manager** → je dataset/pixel `886954613675038`.
2. Tabblad **Testgebeurtenissen (Test Events)**.
3. Vul je pagina-URL in of open de pagina; voer een testbezoek + formulierinzending uit.
4. Je ziet **PageView** en **Lead** binnenkomen, getagd als **Browser**.

## Stap 5 — Zet de Conversions API aan (server-side, gratis één-klik)

Dit is de grootste sprong in datakwaliteit — het vangt events op die de browser-pixel mist (adblockers, cookiebeperkingen, iOS).

**Geen betaalde tool nodig.** Sinds eind april 2026 heeft Meta een gratis, native één-klik-optie. Je hoeft géén developer, géén code, en géén externe dienst (Stape/Zapier) of *Conversions API Gateway* (AWS-hosting) — die zijn alleen voor geavanceerde, custom opzetten.

1. In **Events Manager** → selecteer je dataset/pixel **886954613675038**.
2. Tabblad **Instellingen** (of de melding bovenaan **Overzicht**: "Stel de Conversions API in").
3. Zoek het blok **Conversions API** → **"Conversions API instellen"** → kies de **automatische / Meta-beheerde** optie. **Níét** "Conversions API Gateway" en **níét** "via een partner" — dat zijn de betaalde/technische routes.
4. Bevestig. Meta zet de server-side koppeling zelf op, spiegelt je bestaande events (PageView, Lead, Contact) en dedupliceert automatisch via de `eventID`'s die al in de pagina zitten.

## Stap 6 — Controleer de deduplicatie

1. Terug naar **Testgebeurtenissen**.
2. Doe opnieuw een testinzending.
3. Je hoort nu per Lead **twee** rijen te zien: één **Browser** en één **Server**, met **hetzelfde event-ID** en de status **"gededupliceerd"**.
4. Zo weet je dat browser en server niet dubbel tellen.

## Stap 7 — Verifieer je domein

Nodig voor correcte attributie (Aggregated Event Measurement) sinds de iOS-privacyregels.

1. **Bedrijfsinstellingen (Business Settings)** → **Merkveiligheid** → **Domeinen**.
2. Voeg **leneinterieur.be** toe (dekt ook de subdomein `info.`).
3. Verifieer via **DNS-TXT-record**, een **meta-tag** of **bestandsupload** (DNS is meestal het stabielst).

## Stap 8 — Configureer je webgebeurtenissen (event-prioriteit)

1. In Events Manager → **Aggregated Event Measurement** → **Webgebeurtenissen configureren**.
2. Voeg voor je geverifieerde domein de events toe en zet **Lead** bovenaan in prioriteit (boven PageView).
3. Zo blijft je belangrijkste conversie meetbaar, ook bij gebruikers die tracking beperken.

## Stap 9 — Gebruik Lead als optimalisatie-event in je campagne

1. Maak je campagne aan met doel **Leads / Verkoop (conversies)**.
2. Kies als conversiegebeurtenis **Lead** (pixel `886954613675038`).
3. Laat Meta optimaliseren op Lead — niet op kliks of PageView — voor de beste leads tegen de laagste kost.

---

## Controle & probleemoplossing

- **Diagnostiek-tabblad** in Events Manager toont ontbrekende events, dedup-fouten of parameter-mismatches. Los kritieke waarschuwingen op — ze beïnvloeden je optimalisatie en attributie.
- **Geen PageView in Pixel Helper?** Heb je de cookiebanner geaccepteerd? Zonder toestemming vuurt de pixel bewust niet.
- **Lead vuurt niet?** Controleer of het formulier daadwerkelijk de bevestiging ("Bedankt!") toont — het Lead-event hangt aan een succesvolle verzending.
- **Dubbeltelling (Browser + Server tellen apart)?** Dan matchen de event-ID's niet; controleer in Test Events of beide hetzelfde ID en de status "gededupliceerd" tonen.

## Aandachtspunt: privacy/cookiebeleid

Omdat de Meta-pixel nu marketingcookies plaatst na toestemming, vermeld Meta/Facebook in je cookie- en privacyverklaring (bij `info-voorwaarden`). De technische consent-koppeling staat goed; dit is de juridische tekstkant.
