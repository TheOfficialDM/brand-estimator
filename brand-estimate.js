import readline from 'node:readline';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  computeEstimate, calibrateCoeffA, checkDependencies,
  SECTION_CP, SECTION_NAMES, ADD_ON_NAMES, DELIVERABLE_NAMES,
  PACKAGE_SECTIONS, TIER_SECTIONS, ADD_ON_CP, DELIVERABLE_CP,
  EAF_MAP, EXP_B_MAP, SECTION_DEPS, FLOOR_WITH_FONTS, FLOOR_NO_FONTS, COEFF_A
} from './lib/brand-model.js';

// ─── Exported parse/format functions ─────────────────────────────────────────

export function parseSectionInput(input) {
  return input.split(',').map(t => {
    const trimmed = t.trim();
    if (trimmed === 'A' || trimmed === 'a') return 'A';
    return Number(trimmed);
  });
}

// Menu: 1→logo-new, 2→logo-full-vi, 3→multi-brand, 4→illustration, 5→font-licensing
// Index 3 in the menu (multi-brand) is position 3 — workshop is NOT in the menu
const ADD_ON_MENU = ['logo-new', 'logo-full-vi', 'multi-brand', 'illustration', 'font-licensing'];

export function parseAddOnInput(menuInput, workshopAddOns = []) {
  const items = [];
  if (menuInput && menuInput.trim()) {
    for (const t of menuInput.split(',')) {
      const idx = parseInt(t.trim(), 10);
      if (idx >= 1 && idx <= ADD_ON_MENU.length) {
        items.push({ key: ADD_ON_MENU[idx - 1], qty: 1 });
      }
    }
  }
  return [...items, ...workshopAddOns];
}

// Menu: 1→figma, 2→deck, 3→asset-pkg, 4→notion, 5→portal
const DELIVERABLE_MENU = ['figma', 'deck', 'asset-pkg', 'notion', 'portal'];

export function parseDeliverableInput(input) {
  if (!input || !input.trim()) return [];
  return input.split(',').map(t => {
    const idx = parseInt(t.trim(), 10);
    return (idx >= 1 && idx <= DELIVERABLE_MENU.length) ? DELIVERABLE_MENU[idx - 1] : null;
  }).filter(Boolean);
}

const fmt = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0
});

const MODE_LABELS = {
  'quick-ballpark': 'Quick Ballpark',
  'package': 'Named Package',
  'tier': 'Tier Bundle',
  'section': 'Section À La Carte'
};

export function formatOutput(result, meta) {
  const {
    totalCP, EXP_B, eafValue, E, SD,
    cost_low, cost_high, fixed_quote, fixed_disc, fixed_raw,
    floor, floor_triggered, isPackage, licensedFonts, breakdown
  } = result;
  const { mode, hrsPerWeek, packageName, isQuickBallpark, coeffASource } = meta;

  const timeline = (E / hrsPerWeek).toFixed(1);
  const modeLabel = MODE_LABELS[mode] || mode;

  const lines = [];
  lines.push('═══ BRAND IDENTITY ESTIMATE ════════════════════════════════');
  lines.push(`Client Type    : ${EXP_B_MAP ? Object.entries(EXP_B_MAP).find(([,v]) => v === EXP_B)?.[0] ?? '' : ''}`.padEnd(44) + `EXP_B  : ${EXP_B}`);
  lines.push(`Intake Mode    : ${modeLabel}`);

  if (isPackage && packageName) {
    lines.push(`Package        : ${packageName}  (7% efficiency discount applied)`);
  }

  const sectionList = breakdown
    .filter(b => b.key.startsWith('§'))
    .map(b => b.key.replace('§', ''))
    .join(', ') || 'N/A';
  lines.push(`Sections       : ${sectionList}`);

  const addOnList = breakdown
    .filter(b => !b.key.startsWith('§') && DELIVERABLE_MENU.indexOf(b.key) === -1 && !Object.keys(DELIVERABLE_NAMES).includes(b.key))
    .map(b => b.label)
    .join(', ') || 'None';
  lines.push(`Add-ons        : ${addOnList}`);

  const deliverableList = breakdown
    .filter(b => Object.keys(DELIVERABLE_NAMES).includes(b.key))
    .map(b => b.label)
    .join(', ') || 'None';
  lines.push(`Deliverables   : ${deliverableList}`);

  lines.push(`Total CP       : ${totalCP}`);
  lines.push(`EAF            : ${eafValue.toFixed(3)}`);

  if (isQuickBallpark) {
    lines.push('⚠ Quick Ballpark — EAF defaults to 1.0. Run full intake for a precise estimate.');
  }

  lines.push('────────────────────────────────────────────────────────────');
  lines.push(`ESTIMATE       : ${E.toFixed(1)} hrs  ±  ${SD.toFixed(1)} hrs`);
  lines.push('────────────────────────────────────────────────────────────');
  lines.push('PACKAGE QUOTE');
  lines.push(`  Hourly Range   : ${fmt.format(Math.round(cost_low))} – ${fmt.format(Math.round(cost_high))}`);
  lines.push(`  Fixed Quote    : ${fmt.format(Math.round(fixed_quote))}`);

  if (isPackage && !floor_triggered && fixed_disc !== undefined && fixed_raw !== undefined) {
    const savings = Math.round(fixed_raw - fixed_disc);
    lines.push(`  7% package discount applied (${fmt.format(savings)} saved)`);
  }
  if (floor_triggered) {
    lines.push(`  ⚠ Minimum quote applied (floor: ${fmt.format(floor)})`);
  }

  lines.push('────────────────────────────────────────────────────────────');
  lines.push('LINE-ITEM BREAKDOWN                          hrs      cost range');

  for (const item of breakdown) {
    const hrs = item.hours.toFixed(1).padStart(6);
    const costLow = fmt.format(Math.round((item.hours - (SD / (E / item.hours || 1))) * 75)).padStart(10);
    lines.push(`  ${item.label.padEnd(42)} ${hrs}`);
  }

  lines.push('────────────────────────────────────────────────────────────');

  if (licensedFonts) {
    lines.push('Font Licensing : ~$50–$500 est., charged to client separately');
  } else {
    lines.push('Font Licensing : Not applicable — free/system fonts');
  }

  lines.push(`Timeline       : ~${timeline} weeks at ${hrsPerWeek} hrs/week`);
  lines.push('════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

export function loadCalibration(csvPath) {
  try {
    const raw = readFileSync(csvPath, 'utf8');
    const lines = raw.trim().split('\n').slice(1); // skip header
    if (lines.length < 5) return { coeffA: COEFF_A, rowCount: 0 };
    const rows = lines.map(line => {
      const [total_cp, exp_b, eaf, actual_hrs] = line.split(',').map(Number);
      return { total_cp, exp_b, eaf, actual_hrs };
    }).filter(r => r.total_cp > 0 && r.actual_hrs > 0);
    if (rows.length < 5) return { coeffA: COEFF_A, rowCount: 0 };
    const coeffA = calibrateCoeffA(rows);
    return { coeffA, rowCount: rows.length };
  } catch {
    return { coeffA: COEFF_A, rowCount: 0 };
  }
}

// ─── Interactive CLI ──────────────────────────────────────────────────────────

function isMain() {
  // Works for both `node brand-estimate.js` and ESM import checks
  try {
    const url = new URL(import.meta.url);
    const arg = process.argv[1];
    if (!arg) return false;
    const argUrl = new URL('file://' + arg.replace(/\\/g, '/'));
    return url.href === argUrl.href;
  } catch {
    return false;
  }
}

if (isMain()) {
  (async () => {
    const args = process.argv.slice(2);
    const calibrateOnly = args.includes('--calibrate');
    const exportIdx = args.indexOf('--export');
    const exportPath = exportIdx !== -1
      ? (args[exportIdx + 1] && !args[exportIdx + 1].startsWith('--') ? args[exportIdx + 1] : null)
      : null;

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise(res => rl.question(q, res));

    try {
      if (calibrateOnly) {
        console.log('\n── Calibration Intake ──────────────────────────────────');
        const total_cp = parseFloat(await ask('Total CP of completed project: '));
        const exp_b = parseFloat(await ask('EXP_B used (e.g. 1.08): '));
        const eaf = parseFloat(await ask('EAF product used (e.g. 1.0): '));
        const actual_hrs = parseFloat(await ask('Actual hours logged: '));

        const dataDir = join(process.cwd(), 'data');
        if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
        const csvPath = join(dataDir, 'calibration.csv');
        if (!existsSync(csvPath)) {
          writeFileSync(csvPath, 'total_cp,exp_b,eaf,actual_hrs\n');
        }
        appendFileSync(csvPath, `${total_cp},${exp_b},${eaf},${actual_hrs}\n`);
        console.log('Saved to data/calibration.csv');
        rl.close();
        return;
      }

      // Load calibration
      const csvPath = join(process.cwd(), 'data', 'calibration.csv');
      const { coeffA, rowCount } = loadCalibration(csvPath);
      const coeffASource = rowCount >= 5 ? `calibrated (n=${rowCount})` : 'default';

      console.log('\n══ Brand Identity Estimator ════════════════════════════');
      console.log('Mode:');
      console.log('  1) Quick Ballpark');
      console.log('  2) Named Package');
      console.log('  3) Tier Bundle');
      console.log('  4) Section À La Carte');
      const modeRaw = (await ask('Select mode (1–4): ')).trim();
      const modeNum = parseInt(modeRaw, 10);

      let sections = [];
      let isPackage = false;
      let packageName = null;
      let mode = 'section';

      if (modeNum === 1) {
        // Quick Ballpark — single section or minimal input
        mode = 'quick-ballpark';
        console.log('\nTier options (sum of sections):');
        console.log('  1) Foundation   (§1–3)');
        console.log('  2) Core Brand   (§4–9)');
        console.log('  3) Visual ID    (§10–15)');
        console.log('  4) Voice        (§16)');
        console.log('  5) Digital      (§17–22)');
        console.log('  6) Strategy     (§23–26)');
        console.log('  A) Merchandise  (§A)');
        const tierRaw = (await ask('Select tier (1–6 or A): ')).trim();
        const tierKey = (tierRaw === 'A' || tierRaw === 'a') ? 'A' : parseInt(tierRaw, 10) - 1;
        sections = TIER_SECTIONS[tierKey] ?? TIER_SECTIONS[0];
      } else if (modeNum === 2) {
        mode = 'package';
        isPackage = true;
        console.log('\nPackages:');
        const pkgKeys = Object.keys(PACKAGE_SECTIONS);
        pkgKeys.forEach((k, i) => console.log(`  ${i + 1}) ${k}`));
        const pkgIdx = parseInt((await ask(`Select package (1–${pkgKeys.length}): `)).trim(), 10);
        packageName = pkgKeys[pkgIdx - 1] ?? pkgKeys[0];
        sections = PACKAGE_SECTIONS[packageName];
      } else if (modeNum === 3) {
        mode = 'tier';
        console.log('\nTiers (can select multiple, e.g. 1,2,3):');
        console.log('  1) Foundation   (§1–3)');
        console.log('  2) Core Brand   (§4–9)');
        console.log('  3) Visual ID    (§10–15)');
        console.log('  4) Voice        (§16)');
        console.log('  5) Digital      (§17–22)');
        console.log('  6) Strategy     (§23–26)');
        console.log('  A) Merchandise  (§A)');
        const tierRaw = (await ask('Select tiers (e.g. 1,2,3 or A): ')).trim();
        const tierKeys = tierRaw.split(',').map(t => {
          const s = t.trim();
          if (s === 'A' || s === 'a') return 'A';
          return parseInt(s, 10) - 1;
        });
        sections = tierKeys.flatMap(k => TIER_SECTIONS[k] ?? []);
      } else {
        mode = 'section';
        console.log('\nSections 1–26 + A (e.g. 1,4,5,10,A):');
        const sectionRaw = await ask('Enter sections: ');
        sections = parseSectionInput(sectionRaw);
        // Dependency check
        const violations = checkDependencies(sections);
        if (violations.length) {
          console.log('⚠ Dependency warnings:');
          violations.forEach(v => console.log(`  §${v.section} requires §${v.missing}`));
        }
      }

      // Client type
      console.log('\nClient type:');
      console.log('  1) Solo / Freelancer');
      console.log('  2) Small Business');
      console.log('  3) Mid-Market');
      console.log('  4) Enterprise');
      const ctRaw = parseInt((await ask('Select client type (1–4): ')).trim(), 10);
      const clientTypeMap = { 1: 'solo', 2: 'small-biz', 3: 'mid-market', 4: 'enterprise' };
      const clientType = clientTypeMap[ctRaw] ?? 'small-biz';

      let addOns = [];
      let deliverables = [];
      let eaf = { vision: 1, timeline: 1, revisions: 1, stakeholders: 1 };

      if (modeNum !== 1) {
        // Add-ons
        console.log('\nAdd-ons (comma-separated, or leave blank):');
        console.log('  1) New logo design');
        console.log('  2) Full visual identity design');
        console.log('  3) Multi-brand architecture');
        console.log('  4) Custom illustration / icon set');
        console.log('  5) Font licensing consultation');
        const addOnRaw = (await ask('Select add-ons: ')).trim();

        const workshopAddOns = [];
        const workshopQtyRaw = (await ask('Discovery workshops (qty, 0 to skip): ')).trim();
        const workshopQty = parseInt(workshopQtyRaw, 10);
        if (workshopQty > 0) {
          workshopAddOns.push({ key: 'workshop', qty: workshopQty });
        }

        addOns = parseAddOnInput(addOnRaw, workshopAddOns);

        // Deliverables
        console.log('\nDeliverables (comma-separated, or leave blank):');
        console.log('  1) Figma source document');
        console.log('  2) Presentation deck');
        console.log('  3) Brand asset package');
        console.log('  4) Notion / web document');
        console.log('  5) Interactive web portal');
        const delRaw = (await ask('Select deliverables: ')).trim();
        deliverables = parseDeliverableInput(delRaw);

        // EAF
        console.log('\nEAF Drivers (1=Very Low, 2=Nominal, 3=High, 4=Very High):');
        const v = parseInt((await ask('Vision clarity (1–4): ')).trim(), 10);
        const t = parseInt((await ask('Timeline pressure (1–4): ')).trim(), 10);
        const r = parseInt((await ask('Revision rounds (1–4): ')).trim(), 10);
        const s = parseInt((await ask('Stakeholders (1–4): ')).trim(), 10);
        eaf = { vision: v - 1, timeline: t - 1, revisions: r - 1, stakeholders: s - 1 };
      }

      // Font licensing
      const fontRaw = (await ask('\nFont licensing included? (y/n): ')).trim().toLowerCase();
      const licensedFonts = fontRaw === 'y' || fontRaw === 'yes';

      // Hours per week
      const hrsRaw = parseFloat((await ask('Hours available per week: ')).trim());
      const hrsPerWeek = hrsRaw > 0 ? hrsRaw : 20;

      const result = computeEstimate({
        sections, addOns, deliverables,
        clientType, eaf, isPackage, licensedFonts, coeffA
      });

      const out = formatOutput(result, {
        mode, hrsPerWeek, packageName,
        isQuickBallpark: modeNum === 1,
        coeffASource
      });

      console.log('\n' + out);

      if (exportPath !== null) {
        const filePath = exportPath || `brand-estimate-${new Date().toISOString().slice(0, 10)}.md`;
        writeFileSync(filePath, out, 'utf8');
        console.log(`\nExported to: ${filePath}`);
      } else if (exportIdx !== -1) {
        const filePath = `brand-estimate-${new Date().toISOString().slice(0, 10)}.md`;
        writeFileSync(filePath, out, 'utf8');
        console.log(`\nExported to: ${filePath}`);
      }

    } finally {
      rl.close();
    }
  })();
}
