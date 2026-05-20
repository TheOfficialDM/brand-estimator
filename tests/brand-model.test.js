import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  computeEstimate, calibrateCoeffA, checkDependencies,
  SECTION_CP, PACKAGE_SECTIONS, COEFF_A, FLOOR_WITH_FONTS, FLOOR_NO_FONTS,
  ADD_ON_NAMES, DELIVERABLE_NAMES
} from '../lib/brand-model.js';

test('verification scenario — total CP, EAF, E, fixed_quote', () => {
  const r = computeEstimate({
    sections: [1, 4, 5, 10, 11, 12, 16],
    addOns: [{key:'logo-new'}, {key:'workshop'}],
    deliverables: ['figma', 'asset-pkg'],
    clientType: 'small-biz',
    eaf: {vision:2, timeline:2, revisions:2, stakeholders:1},
    isPackage: false, licensedFonts: true, coeffA: 1.5
  });
  assert.equal(r.totalCP, 29);
  assert.ok(Math.abs(r.eafValue - 1.656) < 0.01, `eaf=${r.eafValue}`);
  assert.ok(Math.abs(r.E - 99.8) < 1.5, `E=${r.E}`);
  assert.ok(Math.abs(r.SD - 13.4) < 1.5, `SD=${r.SD}`);
  assert.ok(Math.abs(r.fixed_quote - 23433) < 200, `fixed=${r.fixed_quote}`);
  assert.equal(r.floor_triggered, false);
});

test('package discount reduces fixed_quote by 7%', () => {
  const r = computeEstimate({
    sections: PACKAGE_SECTIONS['comprehensive'],
    addOns: [], deliverables: [],
    clientType: 'small-biz',
    eaf: {vision:1, timeline:1, revisions:1, stakeholders:1},
    isPackage: true, licensedFonts: true, coeffA: 1.5
  });
  assert.ok(Math.abs(r.fixed_disc - r.fixed_raw * 0.93) < 0.01);
  assert.ok(r.fixed_disc < r.fixed_raw);
});

test('floor triggered — with fonts', () => {
  const r = computeEstimate({
    sections: [3], addOns: [], deliverables: [],
    clientType: 'solo',
    eaf: {vision:0, timeline:0, revisions:0, stakeholders:0},
    isPackage: false, licensedFonts: true, coeffA: 1.5
  });
  assert.equal(r.floor_triggered, true);
  assert.equal(r.fixed_quote, FLOOR_WITH_FONTS);
});

test('floor triggered — no fonts', () => {
  const r = computeEstimate({
    sections: [3], addOns: [], deliverables: [],
    clientType: 'solo',
    eaf: {vision:0, timeline:0, revisions:0, stakeholders:0},
    isPackage: false, licensedFonts: false, coeffA: 1.5
  });
  assert.equal(r.floor_triggered, true);
  assert.equal(r.fixed_quote, FLOOR_NO_FONTS);
});

test('package discount + floor: floor wins when discount pushes below floor', () => {
  const r = computeEstimate({
    sections: [3], addOns: [], deliverables: [],
    clientType: 'solo',
    eaf: {vision:0, timeline:0, revisions:0, stakeholders:0},
    isPackage: true, licensedFonts: true, coeffA: 1.5
  });
  assert.equal(r.fixed_quote, FLOOR_WITH_FONTS);
});

test('full scope (all 51 CP) yields E in range 90–130 hrs', () => {
  const allSections = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,'A'];
  const r = computeEstimate({
    sections: allSections, addOns: [], deliverables: [],
    clientType: 'small-biz',
    eaf: {vision:1, timeline:1, revisions:1, stakeholders:1},
    isPackage: false, licensedFonts: true, coeffA: 1.5
  });
  assert.equal(r.totalCP, 51);
  assert.ok(r.E >= 90 && r.E <= 130, `E=${r.E}`);
});

test('logo-new and logo-full-vi mutual exclusivity: higher CP wins', () => {
  const r = computeEstimate({
    sections: [12],
    addOns: [{key:'logo-new'}, {key:'logo-full-vi'}],
    deliverables: [],
    clientType: 'small-biz',
    eaf: {vision:1, timeline:1, revisions:1, stakeholders:1},
    isPackage: false, licensedFonts: true, coeffA: 1.5
  });
  assert.equal(r.addOnCP, 10);
  assert.equal(r.totalCP, 13);
});

test('checkDependencies detects §8 without §7', () => {
  const violations = checkDependencies([1, 4, 8]);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].section, 8);
  assert.equal(violations[0].missing, 7);
});

test('checkDependencies returns empty when all deps satisfied', () => {
  assert.deepEqual(checkDependencies([7, 8, 12, 19, 10, 20, 15, 21, 24, 25]), []);
});

test('calibrateCoeffA returns default on empty input', () => {
  assert.equal(calibrateCoeffA([]), COEFF_A);
});

test('calibrateCoeffA computes mean ratio correctly', () => {
  const rows = [
    {actual_hrs: 60, total_cp: 29, exp_b: 1.08, eaf: 1.0},
    {actual_hrs: 45, total_cp: 25, exp_b: 1.08, eaf: 1.0}
  ];
  const result = calibrateCoeffA(rows);
  assert.ok(Math.abs(result - 1.490) < 0.05, `result=${result}`);
});

test('breakdown line items sum to E', () => {
  const r = computeEstimate({
    sections: [1, 4, 5, 10, 11, 12, 16],
    addOns: [{key:'logo-new'}], deliverables: ['figma'],
    clientType: 'small-biz',
    eaf: {vision:1, timeline:1, revisions:1, stakeholders:1},
    isPackage: false, licensedFonts: true, coeffA: 1.5
  });
  const sumHrs = r.breakdown.reduce((s, item) => s + item.hours, 0);
  assert.ok(Math.abs(sumHrs - r.E) < 0.01, `sum=${sumHrs}, E=${r.E}`);
});

test('breakdown uses human-readable labels from ADD_ON_NAMES and DELIVERABLE_NAMES', () => {
  const r = computeEstimate({
    sections: [1],
    addOns: [{key:'logo-new'}], deliverables: ['figma'],
    clientType: 'small-biz',
    eaf: {vision:1, timeline:1, revisions:1, stakeholders:1},
    isPackage: false, licensedFonts: true, coeffA: 1.5
  });
  const addOnItem = r.breakdown.find(b => b.key === 'logo-new');
  const delivItem = r.breakdown.find(b => b.key === 'figma');
  assert.equal(addOnItem.label, ADD_ON_NAMES['logo-new']);
  assert.equal(delivItem.label, DELIVERABLE_NAMES['figma']);
});

test('throws on unknown clientType', () => {
  assert.throws(() => computeEstimate({
    sections: [1], addOns: [], deliverables: [],
    clientType: 'bogus',
    eaf: {vision:1, timeline:1, revisions:1, stakeholders:1}
  }), /Unknown clientType/);
});

test('throws on out-of-range eaf index', () => {
  assert.throws(() => computeEstimate({
    sections: [1], addOns: [], deliverables: [],
    clientType: 'solo',
    eaf: {vision:5, timeline:1, revisions:1, stakeholders:1}
  }));
});
