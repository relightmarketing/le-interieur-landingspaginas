// ══════════════════════════════════════════════════════════════════════════
// STAPPENFORMULIER — één vraag per scherm, elke stap wordt bewaard
// (2026-10, branch funnel-v2). Gedeeld door alle landingspagina's.
//
// Configuratie per pagina via window.LE_STAPPENFORMULIER (zie maatkasten.html):
//   pagina      → 'Maatkasten'           (bepaalt de Sheet-tab, zoals vroeger)
//   gtmEvent    → 'maatkasten_submission' (Google Ads-conversie via GTM, ongewijzigd)
//   capi        → { content_name, content_category } voor de Meta-pixel
//   typeVraag   → de eerste vraag + opties, verschilt per dienst
//
// Hoe het verzendt:
//   - Na elke stap gaat een GET naar het Apps Script met hetzelfde `lead_id`,
//     zodat het script één rij bijwerkt in plaats van er telkens één toe te voegen.
//   - De conversie (GTM-event + Meta Lead) vuurt ÉÉN keer: bij de contactstap.
//     Wie daarna afhaakt, is dus al een lead. Wie ervoor afhaakt, heeft geen
//     contactgegevens achtergelaten.
//
// ⚠ Werkt alleen samen met Code.gs v2 (rij bijwerken op `lead_id`). Het huidige
//   live script zou per stap een nieuwe rij + mail maken. Niet naar `main` mergen
//   vóór Code.gs v2 gedeployed is.
//
// TESTMODUS (localhost, 127.0.0.1, file:// of ?test in de URL):
//   niets naar het Apps Script, geen GTM-conversie, geen Meta-pixel. Alles wordt
//   in de console gelogd met het voorvoegsel [stappenformulier].
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var cfg  = window.LE_STAPPENFORMULIER;
  var root = document.getElementById('stappenformulier');
  if (!cfg || !root) return;

  var TEST = /^(localhost|127\.0\.0\.1|)$/.test(location.hostname) ||
             new URLSearchParams(location.search).has('test');

  var KEYS = 'ABCDEFGHIJ';
  var VRIJ_PREFIX = 'Anders: ';   // zo herken je een zelf ingevuld antwoord in de Sheet

  // ── De vragen. Alleen de eerste verschilt per pagina. ──────────────────────
  var STAPPEN = [
    {
      id: 'type', soort: 'keuze',
      vraag: cfg.typeVraag.vraag,
      hint:  cfg.typeVraag.hint || '',
      opties: cfg.typeVraag.opties
    },
    {
      id: 'stad', soort: 'tekst',
      vraag: 'In welke gemeente woont u?',
      hint: 'Onze showroom staat in Pelt, ons atelier in Peer.',
      velden: [{ naam: 'stad', label: 'Gemeente', type: 'text', placeholder: 'Bv. Lommel',
                 autocomplete: 'address-level2', verplicht: true }]
    },
    {
      id: 'timing', soort: 'keuze',
      vraag: 'Wanneer wilt u ongeveer starten?',
      opties: [
        { label: 'Binnen 3 maanden' },
        { label: 'Over 3 tot 6 maanden' },
        { label: 'Over 6 tot 12 maanden' },
        { label: 'Ik oriënteer me nog' }
      ]
    },
    {
      id: 'fase', soort: 'keuze',
      vraag: 'Hoe ver staat uw project?',
      opties: [
        { label: 'De (ver)bouwing is bezig' },
        { label: 'Ik heb plannen of afmetingen' },
        { label: 'Ik heb een idee, nog niets op papier' }
      ]
    },
    {
      id: 'contact', soort: 'tekst', isLead: true,
      vraag: 'Hoe kunnen we u bereiken?',
      hint: 'We bellen u om een vrijblijvend gesprek in onze showroom in Pelt in te plannen.',
      velden: [
        { naam: 'naam',     label: 'Naam',     type: 'text',  placeholder: 'Jan Janssen',   autocomplete: 'name',  verplicht: true },
        { naam: 'telefoon', label: 'Telefoon', type: 'tel',   placeholder: '0499 00 00 00', autocomplete: 'tel',   verplicht: true, inputmode: 'tel' },
        { naam: 'email',    label: 'E-mail',   type: 'email', placeholder: 'jan@email.be',  autocomplete: 'email', verplicht: true, inputmode: 'email' }
      ],
      privacy: true
    },
    {
      id: 'bericht', soort: 'tekst', laatste: true,
      vraag: 'Wilt u ons nog iets laten weten?',
      hint: 'Niet verplicht. Alles wat helpt om het gesprek goed voor te bereiden.',
      velden: [{ naam: 'bericht', label: 'Uw bericht (optioneel)', type: 'textarea',
                 placeholder: cfg.berichtPlaceholder || 'Bv. afmetingen, stijl, timing...' }]
    }
  ];

  // ── Staat ─────────────────────────────────────────────────────────────────
  var leadId   = 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  var antwoord = {};
  var huidig   = 0;
  var leadVerstuurd = false;
  var bezig    = false;

  // ── Hulpfuncties ──────────────────────────────────────────────────────────
  function el(tag, attrs, kinderen) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (kinderen || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function getCookie(name) {
    var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? m.pop() : '';
  }

  function log() {
    if (window.console) console.log.apply(console, ['[stappenformulier]'].concat([].slice.call(arguments)));
  }

  // Zelfde logica als haalBron() op de pagina's: klik-parameters uit de URL.
  function bron() {
    if (typeof window.haalBron === 'function') return window.haalBron();
    return { bron: 'Direct / onbekend', campagne: '', click_id: '', landing: location.href };
  }

  // ── Verzenden ─────────────────────────────────────────────────────────────
  function verstuur(stap, extra) {
    var b = bron();
    var data = Object.assign({
      v: '2',
      lead_id:   leadId,
      pagina:    cfg.pagina,
      stap:      String(huidig + 1),
      stap_naam: stap.id,
      status:    stap.laatste ? 'volledig' : (leadVerstuurd || stap.isLead ? 'lead' : 'anoniem'),
      bron: b.bron, campagne: b.campagne, click_id: b.click_id, landing: b.landing
    }, antwoord, extra || {});

    if (TEST) { log('verzending (TEST, niet verstuurd):', data); return Promise.resolve(); }

    return fetch(cfg.endpoint + '?' + new URLSearchParams(data).toString(), {
      method: 'GET', mode: 'no-cors', keepalive: true
    }).catch(function (err) { log('verzending mislukt', err); });
  }

  // De conversie. Vuurt één keer, bij de contactstap. Zelfde events en
  // dedup-logica als het oude formulier, zodat GTM en Ads niets merken.
  function vuurConversie(eventId, toestemming) {
    if (TEST) { log('conversie (TEST, niet gevuurd):', cfg.gtmEvent, '+ Meta Lead', eventId || '(geen toestemming)'); return; }

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: cfg.gtmEvent, lead_event_id: eventId });

    if (toestemming && typeof fbq === 'function') {
      var naam = (antwoord.naam || '').trim();
      fbq('init', '886954613675038', {
        em: (antwoord.email || '').trim().toLowerCase(),
        ph: (antwoord.telefoon || '').replace(/[^0-9]/g, ''),
        fn: naam.split(' ')[0] || '',
        ln: naam.split(' ').slice(1).join(' ')
      });
      fbq('track', 'Lead', cfg.capi, { eventID: eventId });
    }
  }

  // ── Validatie ─────────────────────────────────────────────────────────────
  function valideer(veld, waarde) {
    if (veld.verplicht && !waarde) return 'Dit veld is nodig om verder te gaan.';
    if (veld.naam === 'telefoon' && waarde.replace(/[^0-9]/g, '').length < 9) return 'Dit lijkt geen volledig telefoonnummer.';
    if (veld.naam === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(waarde)) return 'Dit lijkt geen geldig e-mailadres.';
    return '';
  }

  // ── Volgende stap ─────────────────────────────────────────────────────────
  function volgende() {
    if (bezig) return;
    var stap = STAPPEN[huidig];

    if (stap.soort === 'tekst') {
      var ok = true;
      stap.velden.forEach(function (v) {
        var input = root.querySelector('[name="' + v.naam + '"]');
        var waarde = (input.value || '').trim();
        var fout = valideer(v, waarde);
        var wrap = input.closest('.sf-field');
        wrap.classList.toggle('has-error', !!fout);
        wrap.querySelector('.sf-error').textContent = fout;
        if (fout && ok) { input.focus(); ok = false; }
        antwoord[v.naam] = waarde;
      });
      if (!ok) return;
    } else if (!antwoord[stap.id]) {
      return;
    }

    var extra = {};
    if (stap.isLead && !leadVerstuurd) {
      // Alleen MET cookie-toestemming gaat er marketing-data naar Meta
      // (browser-pixel én server-side CAPI). Zonder blijft event_id leeg.
      var toestemming = localStorage.getItem('cookie_consent') === 'ja';
      var eventId = null;
      if (toestemming) {
        eventId = 'lead.' + Date.now() + '.' + Math.random().toString(36).slice(2);
        extra = { event_id: eventId, event_source_url: location.href, fbp: getCookie('_fbp'), fbc: getCookie('_fbc') };
      }
      verstuur(stap, extra);
      vuurConversie(eventId, toestemming);
      leadVerstuurd = true;
    } else {
      verstuur(stap);
    }

    if (stap.laatste) { toonEinde(); return; }
    toon(huidig + 1, false);
  }

  // ── Weergave ──────────────────────────────────────────────────────────────
  function toon(index, terug) {
    huidig = index;
    var stap = STAPPEN[index];
    root.innerHTML = '';

    if (TEST) root.appendChild(el('div', { 'class': 'sf-testbadge', text: 'Testmodus · er wordt niets verstuurd' }));

    // Voortgang
    var pct = Math.round((index / STAPPEN.length) * 100);
    var fill = el('div', { 'class': 'sf-bar-fill' });
    root.appendChild(el('div', { 'class': 'sf-progress' }, [
      el('div', { 'class': 'sf-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100',
                  'aria-valuenow': String(pct), 'aria-label': 'Voortgang' }, [fill]),
      el('div', { 'class': 'sf-count', text: (index + 1) + ' / ' + STAPPEN.length })
    ]));
    requestAnimationFrame(function () { fill.style.width = pct + '%'; });

    var qId = 'sf-q-' + stap.id;
    var box = el('div', { 'class': 'sf-step' + (terug ? ' sf-back' : ''), role: 'group', 'aria-labelledby': qId });
    var q = el('h3', { 'class': 'sf-q', id: qId, tabindex: '-1', text: stap.vraag });
    box.appendChild(q);
    if (stap.hint) box.appendChild(el('p', { 'class': 'sf-hint', text: stap.hint }));

    if (stap.soort === 'keuze') {
      var lijst = el('div', { 'class': 'sf-options' });
      var vorig = antwoord[stap.id] || '';
      stap.opties.forEach(function (o, i) {
        var waarde = o.waarde || o.label;
        var knop = el('button', { type: 'button', 'class': 'sf-option', 'data-key': KEYS[i] }, [
          el('span', { 'class': 'sf-key', 'aria-hidden': 'true', text: KEYS[i] }),
          el('span', { text: o.label })
        ]);
        if (o.vrij) {
          // "Iets anders": opent een tekstveld i.p.v. meteen door te gaan
          if (vorig.indexOf(VRIJ_PREFIX) === 0) knop.classList.add('is-selected');
          knop.addEventListener('click', function () { kiesVrij(stap, knop); });
        } else {
          if (vorig === waarde) knop.classList.add('is-selected');
          knop.addEventListener('click', function () { kies(stap, waarde, knop); });
        }
        lijst.appendChild(knop);
      });
      box.appendChild(lijst);

      var vrijeOptie = stap.opties.filter(function (o) { return o.vrij; })[0];
      if (vrijeOptie) {
        var vrijInput = el('input', { type: 'text', id: 'sf-vrij-' + stap.id, name: 'sf-vrij',
                                      placeholder: vrijeOptie.placeholder || 'Omschrijf kort wat u zoekt' });
        if (vorig.indexOf(VRIJ_PREFIX) === 0) vrijInput.value = vorig.slice(VRIJ_PREFIX.length);
        var ok = el('button', { type: 'button', 'class': 'sf-next', text: 'Volgende →' });
        ok.addEventListener('click', function () { bevestigVrij(stap); });
        var vrijBlok = el('div', { 'class': 'sf-other' }, [
          el('div', { 'class': 'sf-field' }, [
            el('label', { 'for': 'sf-vrij-' + stap.id, text: vrijeOptie.label }),
            vrijInput,
            el('div', { 'class': 'sf-error', 'aria-live': 'polite' })
          ]),
          el('div', { 'class': 'sf-nav' }, [ok, el('span', { 'class': 'sf-enter', html: 'of druk op <kbd>Enter ↵</kbd>' })])
        ]);
        if (vorig.indexOf(VRIJ_PREFIX) !== 0) vrijBlok.hidden = true;
        box.appendChild(vrijBlok);
      }
    } else {
      stap.velden.forEach(function (v) {
        var attrs = { id: 'sf-' + v.naam, name: v.naam, placeholder: v.placeholder || '' };
        if (v.autocomplete) attrs.autocomplete = v.autocomplete;
        if (v.inputmode)    attrs.inputmode = v.inputmode;
        if (v.type === 'email') { attrs.autocapitalize = 'off'; attrs.spellcheck = 'false'; }
        var input;
        if (v.type === 'textarea') { attrs.rows = '4'; input = el('textarea', attrs); }
        else { attrs.type = v.type; input = el('input', attrs); }
        input.value = antwoord[v.naam] || '';
        box.appendChild(el('div', { 'class': 'sf-field' }, [
          el('label', { 'for': 'sf-' + v.naam, text: v.label }),
          input,
          el('div', { 'class': 'sf-error', 'aria-live': 'polite' })
        ]));
      });

      var knopTekst = stap.laatste ? 'Verstuur mijn aanvraag' : 'Volgende';
      var next = el('button', { type: 'button', 'class': 'sf-next', text: knopTekst + ' →' });
      next.addEventListener('click', volgende);
      box.appendChild(el('div', { 'class': 'sf-nav' }, [
        next,
        stap.velden[0].type === 'textarea' ? null : el('span', { 'class': 'sf-enter', html: 'of druk op <kbd>Enter ↵</kbd>' })
      ]));

      if (stap.privacy) {
        box.appendChild(el('p', { 'class': 'sf-privacy',
          html: 'We gebruiken uw gegevens enkel om u te contacteren over uw aanvraag. ' +
                '<a href="https://leneinterieur.be/info-voorwaarden/" target="_blank" rel="noopener">Privacybeleid</a>' }));
      }
    }

    root.appendChild(box);

    if (index > 0) {
      var back = el('button', { type: 'button', 'class': 'sf-backbtn', text: '← Vorige vraag' });
      back.addEventListener('click', function () { toon(huidig - 1, true); });
      root.appendChild(back);
    }

    // Focus: op het eerste veld bij tekstvragen, anders op de vraag zelf.
    // Niet bij de eerste weergave, anders springt de pagina naar het formulier.
    if (eersteKeerGetoond) {
      var eerste = box.querySelector('input, textarea');
      (eerste || q).focus({ preventScroll: true });
      if (root.getBoundingClientRect().top < 0) root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    eersteKeerGetoond = true;
  }
  var eersteKeerGetoond = false;

  function kies(stap, waarde, knop) {
    if (bezig) return;
    antwoord[stap.id] = waarde;
    [].forEach.call(root.querySelectorAll('.sf-option'), function (b) { b.classList.remove('is-selected'); });
    knop.classList.add('is-selected');
    // Korte pauze zodat de keuze zichtbaar is, zoals bij Typeform.
    bezig = true;
    setTimeout(function () { bezig = false; volgende(); }, 320);
  }

  // Vrije optie: tegel markeren en het tekstveld tonen. Geen automatische
  // volgende stap; die komt pas bij "Volgende" of Enter.
  function kiesVrij(stap, knop) {
    if (bezig) return;
    [].forEach.call(root.querySelectorAll('.sf-option'), function (b) { b.classList.remove('is-selected'); });
    knop.classList.add('is-selected');
    var blok = root.querySelector('.sf-other');
    blok.hidden = false;
    blok.querySelector('input').focus();
  }

  function bevestigVrij(stap) {
    var input = root.querySelector('.sf-other input');
    var tekst = (input.value || '').trim();
    var wrap = input.closest('.sf-field');
    var fout = tekst ? '' : 'Vul kort in wat u zoekt, of kies een optie hierboven.';
    wrap.classList.toggle('has-error', !!fout);
    wrap.querySelector('.sf-error').textContent = fout;
    if (fout) { input.focus(); return; }
    antwoord[stap.id] = VRIJ_PREFIX + tekst;
    volgende();
  }

  function toonEinde() {
    // Naar de bedankpagina. Veilig: de conversie vuurde al bij de contactstap,
    // dus deze navigatie kan geen tag meer afbreken. Voornaam en pagina gaan via
    // sessionStorage, niet via de URL (dan zou de naam in GA4/Meta-logs staan).
    if (cfg.bedanktUrl) {
      try {
        sessionStorage.setItem('le_aanvraag', JSON.stringify({
          voornaam: (antwoord.naam || '').trim().split(' ')[0],
          pagina:   cfg.pagina
        }));
      } catch (e) {}
      if (TEST) log('doorverwijzing naar', cfg.bedanktUrl);
      location.href = cfg.bedanktUrl;
      return;
    }
    root.innerHTML = '';
    if (TEST) root.appendChild(el('div', { 'class': 'sf-testbadge', text: 'Testmodus · er wordt niets verstuurd' }));
    var voornaam = (antwoord.naam || '').trim().split(' ')[0];
    var q = el('h3', { 'class': 'sf-q', tabindex: '-1', text: 'Bedankt' + (voornaam ? ', ' + voornaam : '') + '. Uw aanvraag is binnen.' });
    root.appendChild(el('div', { 'class': 'sf-step sf-done' }, [
      q,
      // Tijdelijk eindscherm. Wordt vervangen door een redirect naar /bedankt.
      el('p', { text: 'We bellen u op om een vrijblijvend gesprek in onze showroom in Pelt in te plannen.' }),
      el('p', { html: 'Liever zelf bellen? <a href="tel:+3211823828">011 82 38 28</a>' })
    ]));
    q.focus({ preventScroll: true });
  }

  // ── Toetsenbord: A/B/C kiest een optie, Enter gaat verder ─────────────────
  root.addEventListener('keydown', function (e) {
    var stap = STAPPEN[huidig];
    if (!stap) return;
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      if (stap.soort === 'tekst') volgende(); else bevestigVrij(stap);
      return;
    }
    if (e.target.tagName === 'INPUT') return;   // typen in het vrije veld kiest geen optie
    if (stap.soort === 'keuze' && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) {
      var knop = root.querySelector('.sf-option[data-key="' + e.key.toUpperCase() + '"]');
      if (knop) { e.preventDefault(); knop.click(); }
    }
  });

  toon(0, false);
  if (TEST) log('testmodus actief: niets wordt verstuurd. lead_id =', leadId);
})();
