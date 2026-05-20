import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  parseSectionInput, parseAddOnInput, parseDeliverableInput, formatOutput
} from '../brand-estimate.js';

test('parseSectionInput handles comma-separated numbers and A', () => {
  const r = parseSectionInput('1,4,5,10,A');
  assert.deepEqual(r, [1, 4, 5, 10, 'A']);
});

test('parseSectionInput trims whitespace', () => {
  const r = parseSectionInput(' 1 , 2 , 3 ');
  assert.deepEqual(r, [1, 2, 3]);
});

test('parseAddOnInput parses menu indices with workshop passed separately', () => {
  // Menu: 1=logo-new, 2=logo-full-vi, 3=multi-brand, 4=illustration, 5=font-licensing
  // Workshop is passed separately as {key:'workshop', qty:N}
  const r = parseAddOnInput('1,3', [{key:'workshop', qty:2}]);
  assert.deepEqual(r, [
    {key:'logo-new', qty:1},
    {key:'multi-brand', qty:1},
    {key:'workshop', qty:2}
  ]);
});

test('parseDeliverableInput parses menu indices', () => {
  // Menu: 1=figma, 2=deck, 3=asset-pkg, 4=notion, 5=portal
  const r = parseDeliverableInput('1,3');
  assert.deepEqual(r, ['figma', 'asset-pkg']);
});

test('formatOutput contains expected key fields', () => {
  const result = {
    totalCP: 29, EXP_B: 1.08, eafValue: 1.656, E: 99.8, SD: 13.4,
    cost_low: 6480, cost_high: 20376, fixed_quote: 23433,
    floor_triggered: false, isPackage: false, licensedFonts: true,
    breakdown: []
  };
  const out = formatOutput(result, { mode: 'section', hrsPerWeek: 20 });
  assert.ok(out.includes('99.8'), `missing E in output`);
  assert.ok(out.includes('23,433') || out.includes('23433'), `missing fixed_quote in output`);
  assert.ok(out.includes('5.0') || out.includes('~5'), `missing timeline in output`);
});
