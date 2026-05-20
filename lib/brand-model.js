export const COEFF_A = 1.5;
export const MIN_RATE = 75;
export const MAX_RATE = 180;
export const PACKAGE_DISCOUNT = 0.07;
export const FLOOR_WITH_FONTS = 2500;
export const FLOOR_NO_FONTS = 2000;

export const SECTION_CP = {
  1:1, 2:1, 3:1,
  4:2, 5:3, 6:1, 7:1, 8:1, 9:1,
  10:3, 11:2, 12:3, 13:1, 14:2, 15:2,
  16:4,
  17:2, 18:2, 19:2, 20:1, 21:1, 22:2,
  23:2, 24:3, 25:1, 26:1,
  'A': 5
};

export const SECTION_NAMES = {
  1:'Brand Overview & Origin Story', 2:'Brand Architecture & Relationships',
  3:'Brand Promise', 4:'Brand Essence & Positioning',
  5:'Target Audience & User Personas', 6:'Naming & Language Guidelines',
  7:'Brand Pillars', 8:'Content Strategy by Pillar', 9:'Brand Personality',
  10:'Visual Identity & Color Theory', 11:'Typography System',
  12:'Logo & Mark Usage Guidelines', 13:'Spacing & Layout System',
  14:'Imagery & Photography Direction', 15:'Component Design Patterns',
  16:'Brand Voice & Tone', 17:'SEO & AI Search Optimization',
  18:'Social Media & Digital Presence', 19:'Brand Application Examples',
  20:'Accessibility Standards', 21:'Interactive Digital Guidelines',
  22:'Motion & Animation Guidelines', 23:'Differentiation & Competitive Analysis',
  24:'Brand Strategy', 25:'Brand Success Metrics & KPIs',
  26:'Brand Evolution Changelog', 'A':'Merchandise & Apparel Design System'
};

export const ADD_ON_NAMES = {
  'logo-new': 'New logo design',
  'logo-full-vi': 'Full visual identity design',
  'multi-brand': 'Multi-brand architecture',
  'illustration': 'Custom illustration / icon set',
  'workshop': 'Discovery workshop',
  'font-licensing': 'Font licensing consultation'
};

export const DELIVERABLE_NAMES = {
  'pdf': 'Static PDF',
  'figma': 'Figma source document',
  'deck': 'Presentation deck',
  'asset-pkg': 'Brand asset package',
  'notion': 'Notion / web document',
  'portal': 'Interactive web portal'
};

export const TIER_SECTIONS = {
  0:[1,2,3], 1:[4,5,6,7,8,9], 2:[10,11,12,13,14,15],
  3:[16], 4:[17,18,19,20,21,22], 5:[23,24,25,26], 'A':['A']
};

export const PACKAGE_SECTIONS = {
  'starter':          [1,2,3,10,11,12],
  'basic':            [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
  'comprehensive':    [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
  'digital-complete': [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22],
  'full-identity':    [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,'A']
};

export const ADD_ON_CP = {
  'logo-new': 6, 'logo-full-vi': 10,
  'multi-brand': 3, 'illustration': 4,
  'workshop': 2, 'font-licensing': 1
};

export const DELIVERABLE_CP = {
  'pdf': 0, 'figma': 2, 'deck': 1,
  'asset-pkg': 1, 'notion': 1, 'portal': 3
};

export const EXP_B_MAP = {
  'solo': 1.04, 'small-biz': 1.08,
  'mid-market': 1.12, 'enterprise': 1.15
};

export const EAF_MAP = {
  vision:       [0.85, 1.00, 1.20, 1.40],
  timeline:     [0.90, 1.00, 1.20, 1.45],
  revisions:    [0.90, 1.00, 1.15, 1.35],
  stakeholders: [0.90, 1.00, 1.20, 1.40]
};

export const SECTION_DEPS = { 8:[7], 19:[12], 20:[10], 21:[15], 25:[24] };

export function checkDependencies(sections) {
  const set = new Set(sections.map(s => typeof s === 'string' ? s : Number(s)));
  const violations = [];
  for (const [dep, reqs] of Object.entries(SECTION_DEPS)) {
    const depKey = Number(dep);
    if (set.has(depKey)) {
      for (const req of reqs) {
        if (!set.has(req)) violations.push({ section: depKey, missing: req });
      }
    }
  }
  return violations;
}

export function computeEstimate({
  sections, addOns = [], deliverables = [],
  clientType, eaf, isPackage = false, licensedFonts = true, coeffA
}) {
  const A = coeffA ?? COEFF_A;
  const EXP_B = EXP_B_MAP[clientType];

  const hasLogoNew = addOns.some(a => a.key === 'logo-new');
  const hasLogoFull = addOns.some(a => a.key === 'logo-full-vi');
  let resolvedAddOns = addOns;
  if (hasLogoNew && hasLogoFull) {
    resolvedAddOns = addOns.filter(a => a.key !== 'logo-new');
  }

  const sectionCP = sections.reduce((s, k) => s + (SECTION_CP[k] ?? 0), 0);
  const addOnCP = resolvedAddOns.reduce((s, {key, qty = 1}) => s + (ADD_ON_CP[key] ?? 0) * qty, 0);
  const deliverableCP = deliverables.reduce((s, d) => s + (DELIVERABLE_CP[d] ?? 0), 0);
  const totalCP = sectionCP + addOnCP + deliverableCP;

  const eafValue = ['vision','timeline','revisions','stakeholders']
    .reduce((prod, k) => prod * EAF_MAP[k][eaf[k]], 1);

  const H_base = A * Math.pow(totalCP, EXP_B);
  const H_adj  = H_base * eafValue;

  const a_pert = H_adj * 0.75;
  const m      = H_adj * 1.00;
  const b_pert = H_adj * 1.60;
  const E  = (a_pert + 4 * m + b_pert) / 6;
  const SD = (b_pert - a_pert) / 6;

  const cost_low  = (E - SD) * MIN_RATE;
  const cost_high = (E + SD) * MAX_RATE;
  const fixed_raw = cost_high * 1.15;
  const fixed_disc = isPackage ? fixed_raw * (1 - PACKAGE_DISCOUNT) : fixed_raw;
  const floor = licensedFonts ? FLOOR_WITH_FONTS : FLOOR_NO_FONTS;
  const fixed_quote = Math.max(fixed_disc, floor);
  const floor_triggered = fixed_disc < floor;

  const perCPHrs = totalCP > 0 ? E / totalCP : 0;

  const breakdown = [
    ...sections.map(s => ({
      key: `§${s}`, label: SECTION_NAMES[s] ?? String(s),
      cp: SECTION_CP[s] ?? 0, hours: (SECTION_CP[s] ?? 0) * perCPHrs
    })),
    ...resolvedAddOns.map(({key, qty = 1}) => ({
      key, label: ADD_ON_NAMES[key] ?? key,
      cp: (ADD_ON_CP[key] ?? 0) * qty, hours: (ADD_ON_CP[key] ?? 0) * qty * perCPHrs
    })),
    ...deliverables.map(d => ({
      key: d, label: DELIVERABLE_NAMES[d] ?? d,
      cp: DELIVERABLE_CP[d] ?? 0, hours: (DELIVERABLE_CP[d] ?? 0) * perCPHrs
    }))
  ];

  return {
    totalCP, sectionCP, addOnCP, deliverableCP,
    EXP_B, eafValue, H_base, E, SD,
    cost_low, cost_high, fixed_raw, fixed_disc, fixed_quote,
    floor, floor_triggered, isPackage, licensedFonts, breakdown
  };
}

export function calibrateCoeffA(rows) {
  if (!rows.length) return COEFF_A;
  const ratios = [];
  for (const r of rows) {
    const denom = Math.pow(r.total_cp, r.exp_b) * r.eaf;
    if (denom > 0 && r.actual_hrs > 0) ratios.push(r.actual_hrs / denom);
  }
  if (!ratios.length) return COEFF_A;
  return ratios.reduce((s, r) => s + r, 0) / ratios.length;
}
