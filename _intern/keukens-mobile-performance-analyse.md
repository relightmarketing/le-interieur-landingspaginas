# Technische analyse — keukens.html (mobiele performance)

Pagina: https://info.leneinterieur.be/keukens · Analyse op basis van de broncode in `keukens.html`.
Doel: zo snel en stabiel mogelijk laden op mobiel, zodat Meta- en Google-verkeer maximaal converteert.

Context: Google straft trage mobiele pagina's af in kwaliteitsscore (hogere CPC), en bij Meta-verkeer haakt een groot deel van de bezoekers af als de pagina traag laadt of "verspringt" tijdens het laden. De grootste winst zit hier bij de afbeeldingen.

---

## Kritiek (grootste impact — eerst doen)

### 1. Afbeeldingen worden op volledige WordPress-resolutie geserveerd
Alle foto's behalve het logo laden rechtstreeks van `leneinterieur.be/wp-content/uploads/...` zonder enige verkleining. Dat zijn de volledige originelen (typisch 1500–2500px breed, 300 KB–1,5 MB per stuk), terwijl een mobiel scherm de afbeelding op ±390px toont. Je stuurt dus 4 tot 10 keer meer pixels dan nodig.

Hoe groot het verschil is, blijkt uit een bestand dat al in dit project staat:

- `keuken renovatie voor en na.png` = **2,67 MB**
- dezelfde afbeelding als `.webp` = **83 KB** → ~**32× kleiner**

Oplossing: het logo gebruikt al slim het Photon-CDN van WordPress (`i0.wp.com/...?w=192&ssl=1`). Datzelfde CDN kan élke afbeelding op aanvraag verkleinen én automatisch in WebP serveren. Voor de portfolio-`<img>`-tags wordt dat bijvoorbeeld:

```
https://i0.wp.com/leneinterieur.be/wp-content/uploads/2025/09/27.jpg?w=800&quality=70&ssl=1
```

Voeg `srcset`/`sizes` toe zodat mobiel een kleine versie krijgt en desktop een grotere:

```html
<img
  src="https://i0.wp.com/leneinterieur.be/wp-content/uploads/2025/09/27.jpg?w=800&quality=70&ssl=1"
  srcset="https://i0.wp.com/leneinterieur.be/wp-content/uploads/2025/09/27.jpg?w=480&quality=70&ssl=1 480w,
          https://i0.wp.com/leneinterieur.be/wp-content/uploads/2025/09/27.jpg?w=800&quality=70&ssl=1 800w,
          https://i0.wp.com/leneinterieur.be/wp-content/uploads/2025/09/27.jpg?w=1200&quality=70&ssl=1 1200w"
  sizes="(max-width: 768px) 100vw, 50vw"
  width="800" height="600" alt="..." loading="lazy" decoding="async">
```

Dit raakt de twee portfolio-blokken (samen **13 foto's**, regels ~857–880 en ~1024–1052) en de twee achtergrondfoto's hieronder.

### 2. Hero- en intro-foto staan als CSS-`background-image`
`.hero-img` (regel 154) en `.intro-img` (regel 191) laden hun foto via `background: url(...)`. Twee problemen:

- **Slechte LCP.** De hero-foto is op mobiel een van de grootste elementen, maar als CSS-achtergrond wordt hij pas ontdekt nádat de CSS is ingeladen en geparset. De browser kan hem niet vroeg prioriteren. Dit vertraagt de Largest Contentful Paint — de meetwaarde waar Google het zwaarst op weegt.
- **Geen responsive sizing.** Een CSS-achtergrond kan geen `srcset` gebruiken, dus mobiel krijgt sowieso de volledige `27.jpg`.

Oplossing: vervang de achtergrond-divs door echte `<img>`-elementen met `object-fit: cover` (zelfde visuele resultaat), zodat je `srcset`/`sizes` én `loading`/`fetchpriority` kunt zturen. Geef de hero-afbeelding `fetchpriority="high"` en géén `loading="lazy"` (hij staat boven de vouw); de intro-foto wél `loading="lazy"`.

### 3. Geen preload van de LCP-afbeelding
Omdat de hero-foto cruciaal is voor de laadbeleving, zet je hem bovenaan in de `<head>` op de prioriteitslijst:

```html
<link rel="preload" as="image"
  href="https://i0.wp.com/leneinterieur.be/wp-content/uploads/2025/09/27.jpg?w=800&quality=70&ssl=1"
  fetchpriority="high">
```

(Werkt het best samen met fix #2, wanneer de hero een echte `<img>` is.)

### 4. Geen `width`/`height` op de portfolio-foto's → layout shift (CLS)
De 13 portfolio-`<img>`-tags hebben geen afmetingen. Tijdens het laden "springt" de pagina daardoor, wat slecht scoort op Cumulative Layout Shift en bezoekers stoort — net wanneer ze willen klikken. Geef elke `<img>` een `width` en `height` mee (de verhouding volstaat; CSS `object-fit: cover` houdt de uitsnede correct). `loading="lazy"` staat er al — dat is goed.

---

## Belangrijk (duidelijke winst)

### 5. Google Fonts via `@import` blokkeert de weergave
Regel 36 laadt het lettertype met `@import url('...')` bovenaan de `<style>`. `@import` is de traagste methode: de browser moet eerst de CSS downloaden, dán pas ontdekt hij het font. Verplaats dit naar echte `<link>`-tags in de `<head>`, met preconnect:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600&display=swap">
```

Het `&display=swap` staat al in de URL — goed, dat voorkomt onzichtbare tekst tijdens het laden.

### 6. Overweeg minder font-gewichten
Er worden vier gewichten geladen (300, 400, 500, 600). Elk is een apart bestand. Op een marketingpagina volstaan meestal twee à drie (bv. 300 + 500). Eén gewicht minder = één request en wat KB minder.

### 7. Preconnect naar het afbeeldingsdomein
Alle foto's komen van een extern domein (`leneinterieur.be` / `i0.wp.com`). Zonder preconnect kost de eerste foto extra tijd aan DNS-lookup en TLS-handshake. Voeg toe in de `<head>`:

```html
<link rel="preconnect" href="https://i0.wp.com" crossorigin>
```

---

## Nice-to-have (afronding)

### 8. `decoding="async"` op alle `<img>`
Laat de browser foto's decoderen zonder de hoofdthread te blokkeren. Klein maar gratis.

### 9. Hoeveelheid foto's onder de vouw
De pagina toont 13 portfolio-foto's. Met lazy-loading (al aanwezig) is dat prima, maar overweeg of alle 13 nodig zijn voor conversie — minder gewicht = sneller, en de tweede portfolio-sectie voegt inhoudelijk weinig toe boven de eerste.

### 10. GTM / consent — geen actie nodig
Google Tag Manager laadt al `async` en de consent-mode staat correct vóór GTM. Dit blokkeert de weergave niet en hoeft niet aangepast te worden.

---

## Samengevat: prioriteitenlijst

1. **Afbeeldingen verkleinen via het Photon-CDN** (`i0.wp.com` + `?w=...&quality=70`) met `srcset`/`sizes` — verreweg de grootste winst, raakt alle 15 foto's.
2. **Hero- en intro-achtergrond omzetten naar echte `<img>`** met `object-fit: cover`, zodat ze responsive en prioriteerbaar worden.
3. **Hero-afbeelding preloaden** met `fetchpriority="high"`.
4. **`width`/`height` op alle portfolio-foto's** tegen layout shift (CLS).
5. **Fonts via `<link>` + preconnect** i.p.v. `@import`; eventueel minder gewichten.
6. **Preconnect naar `i0.wp.com`**.
7. `decoding="async"` toevoegen; aantal foto's heroverwegen.

Punten 1 t/m 4 leveren samen het leeuwendeel van de snelheids- en stabiliteitswinst op mobiel. Zeg het maar als je wil dat ik deze daadwerkelijk in `keukens.html` doorvoer — dan pas ik ze toe en kunnen we voor/na vergelijken.
