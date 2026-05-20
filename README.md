# brand-estimator

Freelance brand identity project cost estimator. COCOMO-inspired PERT model with
section-level à la carte pricing across 26 brand bible sections + Appendix A.

## Quick Start

### Node.js CLI

```
node brand-estimate.js
```

### Python CLI

```
python brand_estimate.py
```

### HTML Calculator

Open `brand-calculator.html` in any browser — no server required.

## Model

Scope CP → H_base = COEFF_A × CP^EXP_B → EAF → PERT → cost range + line-item breakdown.

- **COEFF_A** = 1.5 (default, self-calibrating after 5+ logged projects)
- **MIN_RATE** = $75/hr | **MAX_RATE** = $180/hr
- **Quote floor:** $2,500 with licensed fonts, $2,000 without
- **Named package discount:** 7%

### Section CP Reference

| # | Section | Tier | CP |
|---|---------|------|----|
| 1 | Brand Overview & Origin Story | 0 | 1 |
| 2 | Brand Architecture & Relationships | 0 | 1 |
| 3 | Brand Promise | 0 | 1 |
| 4 | Brand Essence & Positioning | 1 | 2 |
| 5 | Target Audience & User Personas | 1 | 3 |
| 6 | Naming & Language Guidelines | 1 | 1 |
| 7 | Brand Pillars | 1 | 1 |
| 8 | Content Strategy by Pillar | 1 | 1 |
| 9 | Brand Personality | 1 | 1 |
| 10 | Visual Identity & Color Theory | 2 | 3 |
| 11 | Typography System | 2 | 2 |
| 12 | Logo & Mark Usage Guidelines | 2 | 3 |
| 13 | Spacing & Layout System | 2 | 1 |
| 14 | Imagery & Photography Direction | 2 | 2 |
| 15 | Component Design Patterns | 2 | 2 |
| 16 | Brand Voice & Tone | 3 | 4 |
| 17 | SEO & AI Search Optimization | 4 | 2 |
| 18 | Social Media & Digital Presence | 4 | 2 |
| 19 | Brand Application Examples | 4 | 2 |
| 20 | Accessibility Standards | 4 | 1 |
| 21 | Interactive Digital Guidelines | 4 | 1 |
| 22 | Motion & Animation Guidelines | 4 | 2 |
| 23 | Differentiation & Competitive Analysis | 5 | 2 |
| 24 | Brand Strategy | 5 | 3 |
| 25 | Brand Success Metrics & KPIs | 5 | 1 |
| 26 | Brand Evolution Changelog | 5 | 1 |
| A | Merchandise & Apparel Design System | Appendix | 5 |

### Named Packages

| Package | Sections | CP |
|---------|----------|----|
| Starter | §1–3, §10–12 | 11 |
| Basic | Tiers 0–2 (§1–15) | 25 |
| Comprehensive | Tiers 0–3 (§1–16) | 29 |
| Digital Complete | Tiers 0–4 (§1–22) | 39 |
| Full Identity System | All + Appendix A | 51 |

### EAF Drivers

| Driver | Level 1 | Level 2 | Level 3 | Level 4 |
|--------|---------|---------|---------|---------|
| Vision clarity | ×0.85 | ×1.00 | ×1.20 | ×1.40 |
| Timeline | ×0.90 | ×1.00 | ×1.20 | ×1.45 |
| Revision rounds | ×0.90 | ×1.00 | ×1.15 | ×1.35 |
| Stakeholder complexity | ×0.90 | ×1.00 | ×1.20 | ×1.40 |

## Tests

```bash
# Node.js
node --test tests/brand-model.test.js
node --test tests/estimate.test.js

# Python
python -m pytest tests/test_brand_estimate.py -v
```

## Calibration

Log actual hours after completing a project to improve COEFF_A over time.

```bash
node brand-estimate.js --calibrate
python brand_estimate.py --calibrate
```

The model automatically uses the calibrated COEFF_A once 5+ projects are logged.
Calibration data is stored in `data/calibration.csv`.

## Claude Code Skill

This repo is the standalone scripts companion to the `/brand-project` Claude Code skill
(`~/.agents/skills/brand-project/SKILL.md`). The skill and CLI share identical model
logic — same constants, same formula, same output format.
