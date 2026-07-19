# Badge System — Session 77b Handoff

**Date:** 2026-07-19
**Session:** 77b — integrazione dataxiom.it ↔ Badge System implementata (repo `dataxiom-landing`) + materiale lancio LinkedIn pronto
**Status:** ⏳ **Tutto pronto e verificato dall'utente, NON deployato.** Domani (2026-07-20): deploy landing + pubblicazione LinkedIn.

---

## Goal

Collegare la landing aziendale dataxiom.it a Badge System (pagina prodotto dedicata, scelta dall'utente tra 3 proposte mockup) e preparare l'annuncio LinkedIn del lancio.

---

## ⚡ DOMANI (2026-07-20) — sequenza esatta

1. **Deploy landing** (⚠️ SITO GIUSTO: `dataxiom`, non `dataxiom-badge`):
   ```bash
   cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/Landing Page"
   netlify deploy --prod --dir . --site a31a2216-fb06-47e0-b632-a1193a88039a
   ```
2. **Verifica live**: dataxiom.it (card "Il nostro prodotto" dopo i Case Study, nav "Badge System", toggle EN traduce la card) + dataxiom.it/badge-system.html (tema ereditato dalla home, hero nitida, link demo → badge.dataxiom.it/prova-demo)
3. **Check funnel demo** funzionante (rate limit 3/ora/IP, cap 20 demo attive — ok per lancio organico, monitorare i log)
4. **Pubblicazione LinkedIn** (Company Page): testo Variante A + allegato `carosello_badge_system.pdf` da `LinkedIn/2026-07-20_badge-system-launch/`

---

## Dove sono le cose

- **Repo landing**: `/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/Landing Page` → GitHub privato `falletti-diego/dataxiom-landing` (3 commit: recover `b6fd90a`, integrazione `7c7cbaf`, tema+hero `cf3f9b4`). README col contratto operativo.
- **Materiale LinkedIn**: `LinkedIn/2026-07-20_badge-system-launch/` — `post_lancio_badge_system.md` (Variante A scelta + note operative), `carosello_badge_system.pdf` (7 slide 1080×1080), PNG singole slide, sorgente HTML rigenerabile.
- **Mockup delle 3 proposte** (Artifact, per riferimento): sezione integrata / pagina dedicata v2 / hero a due percorsi.

## Cosa è stato fatto

1. **Fase 1 — riorganizzazione**: `Landing Page/` con index.html recuperato BYTE-IDENTICO dalla produzione (la copia locale era del 18 maggio, superata), favicon/robots/sitemap, archive/ con le copie storiche, git+GitHub, **link Netlify corretto** (il vecchio puntava al sito badge: deploy della landing avrebbe sovrascritto l'app!).
2. **Fase 2 — integrazione**: `badge-system.html` (tracciabilità QR, totalmente online, dati dell'azienda, tracciati Zucchetti/TeamSystem con disclaimer, NIENTE prezzi, SEO completa) + card-ponte in home (i18n IT+EN, fix favicon.png rotto, sitemap aggiornata).
3. **Rifinitura su feedback utente**: hero rifatta dal PNG retina (2880px, crop 1.89:1, era povera e stirata — mancava `height:auto` accanto agli attributi width/height) + **tema condiviso** con la home (chiave `dataxiom-theme`, script pre-paint anti-flash, toggle bidirezionale). Verificato con puppeteer (dark ereditato ✓, toggle ✓) e dall'utente ("verificato ed è ora corretto").
4. **Lancio LinkedIn**: post Variante A (problema-first) + carosello 7 slide nello stile grafico consolidato del carosello Power Query di maggio.

## What Worked

- Leggere la landing di PRODUZIONE prima di fidarsi della copia locale (2 mesi di differenza, i18n aggiunto nel frattempo).
- Mockup Artifact per far scegliere tra 3 proposte visive prima di scrivere una riga sulla landing vera.
- Riusare il linguaggio grafico del carosello precedente: coerenza immediata, zero decisioni nuove.

## Attenzione / gotcha

- **MAI deployare la landing dalla cartella madre** (link rimosso, ma il rischio concettuale resta: due siti Netlify, `dataxiom` vs `dataxiom-badge`).
- `<img width height>` + CSS `width:100%` senza `height:auto` = stiramento.
- La pagina prodotto è IT-only (la home ha i18n IT/EN): se servirà l'inglese, va aggiunto.

---

## Dopo il lancio (già tracciato)

- **SES Parte B** (piano 2026-07-19): resta l'unico bloccante per email ai prospect — serve accesso DNS register.it. Col lancio LinkedIn il form "Parliamo" notifica comunque diego@dataxiom.it (già funzionante).
- **25 agosto**: reminder rinnovo TestFlight (Build 14 scade 8 settembre).
- Backlog minor invariato (flake inter-worker test demo, saldi superadmin, ecc. — vedi TASKS.md).

---

## Note operative

- Deploy landing: SEMPRE `--site a31a2216-fb06-47e0-b632-a1193a88039a` · Deploy badge frontend: `--site 29a79b49-...` · Backend: automatico su push `main` (`backend/**`)
- Server locale di verifica (se ancora attivo): http://localhost:8765
- Cron produzione EC2: 2:00 retention, 3:30 cleanup demo (verificati)
