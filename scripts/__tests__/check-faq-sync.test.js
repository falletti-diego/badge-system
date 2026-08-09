const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT_PATH = path.join(__dirname, '..', 'check-faq-sync.js');

function writeTempFaqFile(dir, name, content) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

const VALID_FAQ_CONTENT = `
export const FAQ_ITEMS = [
  {
    id: 'a',
    question: 'Domanda A?',
    answer: 'Risposta A.',
    audience: 'all',
  },
];
`;

const MISMATCHED_FAQ_CONTENT = `
export const FAQ_ITEMS = [
  {
    id: 'a',
    question: 'Domanda A modificata?',
    answer: 'Risposta A.',
    audience: 'all',
  },
];
`;

describe('scripts/check-faq-sync.js', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'faq-sync-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exit code 0 quando i due file hanno lo stesso blocco FAQ_ITEMS', () => {
    const webFile = writeTempFaqFile(tmpDir, 'web-faq.js', VALID_FAQ_CONTENT);
    const mobileFile = writeTempFaqFile(tmpDir, 'mobile-faq.js', VALID_FAQ_CONTENT);

    assert.doesNotThrow(() => {
      execFileSync('node', [SCRIPT_PATH, webFile, mobileFile], { stdio: 'pipe' });
    });
  });

  test('exit code diverso da 0 quando i due file divergono', () => {
    const webFile = writeTempFaqFile(tmpDir, 'web-faq.js', VALID_FAQ_CONTENT);
    const mobileFile = writeTempFaqFile(tmpDir, 'mobile-faq.js', MISMATCHED_FAQ_CONTENT);

    assert.throws(() => {
      execFileSync('node', [SCRIPT_PATH, webFile, mobileFile], { stdio: 'pipe' });
    });
  });
});
