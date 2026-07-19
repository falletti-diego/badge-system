/**
 * Cattura i 3 screenshot per la sezione "Cosa vedrai" di /prova-demo da una
 * sessione demo REALE (dati degli ultimi 30 giorni) su stack locale.
 *
 * Prerequisiti: backend su :3000 e frontend Vite su :5173 già avviati.
 * Usa il Chrome installato via puppeteer-core: nessun download di browser.
 * Una sola sessione demo per tutti gli scatti (rate limit 3/ora per IP).
 *
 * Uso: npm run capture-screenshots
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FRONTEND = 'http://localhost:5173';
const BACKEND = 'http://localhost:3000';
const OUT_DIR = resolve(import.meta.dirname, '../src/assets/demo');

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const res = await fetch(`${BACKEND}/api/v1/demo/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `screenshot-${Date.now()}@dataxiom.it` }),
  });
  if (!res.ok) throw new Error(`demo/start failed: ${res.status} ${await res.text()}`);
  const { data } = await res.json();

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

    // Inietta la sessione come authService.setSession + sopprime il DemoTour
    await page.goto(`${FRONTEND}/login`, { waitUntil: 'networkidle0' });
    await page.evaluate((session) => {
      localStorage.setItem('badge_auth_token', session.token);
      localStorage.setItem('badge_refresh_token', session.refresh_token);
      localStorage.setItem('badge_user', JSON.stringify(session.user));
      localStorage.setItem('badge_demo_tour_seen', 'true');
    }, data);

    // Dashboard — banner demo nascosto SOLO nello scatto. Prima di scattare,
    // attendi che i DATI siano davvero renderizzati (la linea del trend e le
    // righe della tabella): un timeout fisso raceva col seeding del tenant.
    await page.goto(`${FRONTEND}/dashboard`, { waitUntil: 'networkidle0' });
    await page.addStyleTag({ content: '[data-testid="demo-banner"] { display: none !important; }' });
    await page.waitForFunction(
      () => {
        const line = document.querySelector('[data-testid="trend-chart"] .recharts-line-curve');
        const rows = document.querySelectorAll('table tbody tr').length;
        return line !== null && rows >= 3;
      },
      { timeout: 20000 }
    );
    await new Promise((r) => setTimeout(r, 2000)); // animazioni Recharts
    await page.screenshot({ path: `${OUT_DIR}/dashboard.png` });

    // Grafici Trend — scatto del solo Card TrendChart
    const trend = await page.$('[data-testid="trend-chart"]');
    if (!trend) throw new Error('TrendChart non trovato: [data-testid="trend-chart"]');
    await trend.scrollIntoView();
    await new Promise((r) => setTimeout(r, 500));
    await trend.screenshot({ path: `${OUT_DIR}/trend.png` });

    // Export — clip mirato: bottone "Esporta CSV" + prime righe della tabella.
    // La card su /prova-demo mostra solo la striscia ALTA dell'immagine
    // (object-position: top), quindi il soggetto deve stare in cima al frame.
    // NB: il clip di page.screenshot usa coordinate DOCUMENTO, non viewport —
    // getBoundingClientRect va corretto con window.scrollY.
    const btnDocY = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        b.textContent.includes('Esporta CSV')
      );
      if (!btn) return null;
      return btn.getBoundingClientRect().top + window.scrollY;
    });
    if (btnDocY === null) throw new Error('Bottone "Esporta CSV" non trovato');
    await page.screenshot({
      path: `${OUT_DIR}/export.png`,
      clip: { x: 140, y: Math.max(0, btnDocY - 30), width: 1160, height: 620 },
    });
  } finally {
    await browser.close();
  }

  console.log(`✅ 3 screenshot salvati in ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
