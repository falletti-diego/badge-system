/**
 * Generates app icon (1024x1024) and splash icon (512x512)
 * for Badge System mobile app.
 *
 * Design: Navy background (#1E3A5F) + white badge shield shape + checkmark
 *
 * Run: node scripts/generate-assets.js
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const NAVY  = { r: 30,  g: 58,  b: 95,  a: 255 }; // #1E3A5F
const WHITE = { r: 255, g: 255, b: 255, a: 255 };
const LIGHT = { r: 100, g: 149, b: 200, a: 255 }; // accent light blue

function createPNG(size) {
  const png = new PNG({ width: size, height: size, filterType: -1 });
  png.data = Buffer.alloc(size * size * 4);
  return png;
}

function setPixel(png, x, y, color) {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return;
  const idx = (png.width * y + x) * 4;
  png.data[idx]     = color.r;
  png.data[idx + 1] = color.g;
  png.data[idx + 2] = color.b;
  png.data[idx + 3] = color.a;
}

// Fill entire image with a color
function fill(png, color) {
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++)
      setPixel(png, x, y, color);
}

// Draw filled circle
function fillCircle(png, cx, cy, r, color) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r)
        setPixel(png, x, y, color);
    }
  }
}

// Draw filled rounded rectangle
function fillRoundRect(png, x0, y0, w, h, radius, color) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const inRect = x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
      if (!inRect) continue;

      // Check corners
      const inTL = x < x0 + radius && y < y0 + radius;
      const inTR = x >= x0 + w - radius && y < y0 + radius;
      const inBL = x < x0 + radius && y >= y0 + h - radius;
      const inBR = x >= x0 + w - radius && y >= y0 + h - radius;

      if (inTL && (x - (x0 + radius)) ** 2 + (y - (y0 + radius)) ** 2 > radius ** 2) continue;
      if (inTR && (x - (x0 + w - radius)) ** 2 + (y - (y0 + radius)) ** 2 > radius ** 2) continue;
      if (inBL && (x - (x0 + radius)) ** 2 + (y - (y0 + h - radius)) ** 2 > radius ** 2) continue;
      if (inBR && (x - (x0 + w - radius)) ** 2 + (y - (y0 + h - radius)) ** 2 > radius ** 2) continue;

      setPixel(png, x, y, color);
    }
  }
}

// Draw thick line (for checkmark strokes)
function drawThickLine(png, x0, y0, x1, y1, thickness, color) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = -dy / len, ny = dx / len;
  const steps = Math.ceil(len * 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = Math.round(x0 + dx * t);
    const cy = Math.round(y0 + dy * t);
    for (let d = -thickness; d <= thickness; d++) {
      setPixel(png, Math.round(cx + nx * d), Math.round(cy + ny * d), color);
    }
  }
}

function generateIcon(size) {
  const png = createPNG(size);
  const s = size;
  const cx = s / 2, cy = s / 2;

  // Navy background
  fill(png, NAVY);

  // Outer rounded square (white card) — 60% of size
  const cardW = Math.round(s * 0.60);
  const cardH = Math.round(s * 0.60);
  const cardX = Math.round((s - cardW) / 2);
  const cardY = Math.round((s - cardH) / 2);
  const cardR = Math.round(cardW * 0.18);
  fillRoundRect(png, cardX, cardY, cardW, cardH, cardR, WHITE);

  // Inner navy accent strip at top of card (badge header)
  const stripH = Math.round(cardH * 0.28);
  fillRoundRect(png, cardX, cardY, cardW, stripH + cardR, cardR, NAVY);
  // Cover bottom of strip to make it a flat rectangle
  for (let y = cardY + stripH; y < cardY + stripH + cardR; y++)
    for (let x = cardX; x < cardX + cardW; x++)
      setPixel(png, x, y, NAVY);

  // Three white dots on the header strip (badge holes)
  const dotR = Math.round(s * 0.022);
  const dotY = cardY + Math.round(stripH * 0.55);
  for (let i = 0; i < 3; i++) {
    const dotX = cardX + Math.round(cardW * (0.28 + i * 0.22));
    fillCircle(png, dotX, dotY, dotR, WHITE);
  }

  // Checkmark in the lower white area of the card
  const checkCY = cardY + stripH + Math.round((cardH - stripH) * 0.55);
  const checkScale = Math.round(s * 0.095);
  const checkCX = cx;
  const stroke = Math.max(2, Math.round(s * 0.030));
  const navyCheck = NAVY;

  // Checkmark: short arm (down-left) + long arm (up-right)
  const p1x = checkCX - Math.round(checkScale * 0.9);
  const p1y = checkCY;
  const p2x = checkCX - Math.round(checkScale * 0.1);
  const p2y = checkCY + Math.round(checkScale * 0.7);
  const p3x = checkCX + Math.round(checkScale * 1.1);
  const p3y = checkCY - Math.round(checkScale * 0.9);

  drawThickLine(png, p1x, p1y, p2x, p2y, stroke, navyCheck);
  drawThickLine(png, p2x, p2y, p3x, p3y, stroke, navyCheck);

  return png;
}

function generateSplashIcon(size) {
  // Splash icon: just the badge card on transparent background
  // Expo places this on the splash backgroundColor (#1E3A5F)
  const png = createPNG(size);
  const s = size;
  const cx = s / 2, cy = s / 2;

  // Transparent background
  for (let i = 0; i < png.data.length; i++) png.data[i] = 0;

  // White rounded card — 72% of canvas
  const cardW = Math.round(s * 0.72);
  const cardH = Math.round(s * 0.72);
  const cardX = Math.round((s - cardW) / 2);
  const cardY = Math.round((s - cardH) / 2);
  const cardR = Math.round(cardW * 0.18);
  fillRoundRect(png, cardX, cardY, cardW, cardH, cardR, WHITE);

  // Navy header strip
  const stripH = Math.round(cardH * 0.28);
  fillRoundRect(png, cardX, cardY, cardW, stripH + cardR, cardR, NAVY);
  for (let y = cardY + stripH; y < cardY + stripH + cardR; y++)
    for (let x = cardX; x < cardX + cardW; x++)
      setPixel(png, x, y, NAVY);

  // Dots
  const dotR = Math.round(s * 0.025);
  const dotY = cardY + Math.round(stripH * 0.55);
  for (let i = 0; i < 3; i++) {
    const dotX = cardX + Math.round(cardW * (0.28 + i * 0.22));
    fillCircle(png, dotX, dotY, dotR, WHITE);
  }

  // Checkmark
  const checkCY = cardY + stripH + Math.round((cardH - stripH) * 0.55);
  const checkScale = Math.round(s * 0.11);
  const stroke = Math.max(2, Math.round(s * 0.034));

  const p1x = cx - Math.round(checkScale * 0.9);
  const p1y = checkCY;
  const p2x = cx - Math.round(checkScale * 0.1);
  const p2y = checkCY + Math.round(checkScale * 0.7);
  const p3x = cx + Math.round(checkScale * 1.1);
  const p3y = checkCY - Math.round(checkScale * 0.9);

  drawThickLine(png, p1x, p1y, p2x, p2y, stroke, NAVY);
  drawThickLine(png, p2x, p2y, p3x, p3y, stroke, NAVY);

  return png;
}

function savePNG(png, filepath) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = png.pack();
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => {
      fs.writeFileSync(filepath, Buffer.concat(chunks));
      resolve();
    });
    stream.on('error', reject);
  });
}

async function main() {
  const assetsDir = path.join(__dirname, '..', 'assets');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  console.log('Generating icon.png (1024×1024)...');
  const icon = generateIcon(1024);
  await savePNG(icon, path.join(assetsDir, 'icon.png'));
  console.log('  ✅ assets/icon.png');

  console.log('Generating splash-icon.png (512×512)...');
  const splash = generateSplashIcon(512);
  await savePNG(splash, path.join(assetsDir, 'splash-icon.png'));
  console.log('  ✅ assets/splash-icon.png');

  console.log('\nDone. Assets ready for EAS build.');
}

main().catch((err) => { console.error(err); process.exit(1); });
