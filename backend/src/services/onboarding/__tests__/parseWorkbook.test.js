'use strict';

const fs = require('fs');
const path = require('path');
const { parseWorkbook } = require('../parseWorkbook');

const SAMPLE = path.join(__dirname, '../../../../scripts/seed-data/onboarding-template-esempio.xlsx');

test('parseWorkbook(buffer) produces the same result as parseWorkbook(path)', async () => {
  const fromPath = await parseWorkbook(SAMPLE);
  const fromBuffer = await parseWorkbook(fs.readFileSync(SAMPLE));
  expect(fromBuffer).toEqual(fromPath);
});
