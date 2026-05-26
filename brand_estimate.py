import csv, os, sys, re
from math import pow as mpow
from datetime import date

# ---------------------------------------------------------------------------
# Constants (mirrors lib/brand-model.js)
# ---------------------------------------------------------------------------

COEFF_A = 1.5
MIN_RATE = 75
MEDIAN_RATE = 125
MAX_RATE = 180
PACKAGE_DISCOUNT = 0.07
MARKUP_MULT = 1.15
FLOOR_WITH_FONTS = 2500
FLOOR_NO_FONTS = 2000

SECTION_CP = {
    1:1, 2:1, 3:1,
    4:2, 5:3, 6:1, 7:1, 8:1, 9:1,
    10:3, 11:2, 12:3, 13:1, 14:2, 15:2,
    16:4,
    17:2, 18:2, 19:2, 20:1, 21:1, 22:2,
    23:2, 24:3, 25:1, 26:1,
    'A': 5
}

SECTION_NAMES = {
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
}

ADD_ON_NAMES = {
    'logo-new': 'New logo design', 'logo-full-vi': 'Full visual identity design',
    'multi-brand': 'Multi-brand architecture', 'illustration': 'Custom illustration / icon set',
    'workshop': 'Discovery workshop', 'font-licensing': 'Font licensing consultation'
}

DELIVERABLE_NAMES = {
    'pdf': 'Static PDF', 'figma': 'Figma source document',
    'deck': 'Presentation deck', 'asset-pkg': 'Brand asset package',
    'notion': 'Notion / web document', 'portal': 'Interactive web portal'
}

TIER_SECTIONS = {
    0:[1,2,3], 1:[4,5,6,7,8,9], 2:[10,11,12,13,14,15],
    3:[16], 4:[17,18,19,20,21,22], 5:[23,24,25,26], 'A':['A']
}

PACKAGE_SECTIONS = {
    'starter':          [1,2,3,10,11,12],
    'basic':            [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
    'comprehensive':    [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
    'digital-complete': [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22],
    'full-identity':    [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,'A']
}

ADD_ON_CP = {
    'logo-new': 6, 'logo-full-vi': 10,
    'multi-brand': 3, 'illustration': 4,
    'workshop': 2, 'font-licensing': 1
}

DELIVERABLE_CP = {
    'pdf': 0, 'figma': 2, 'deck': 1,
    'asset-pkg': 1, 'notion': 1, 'portal': 3
}

EXP_B_MAP = {
    'solo': 1.04, 'small-biz': 1.08,
    'mid-market': 1.12, 'enterprise': 1.15
}

EAF_MAP = {
    'vision':       [0.85, 1.00, 1.20, 1.40],
    'timeline':     [0.90, 1.00, 1.20, 1.45],
    'revisions':    [0.90, 1.00, 1.15, 1.35],
    'stakeholders': [0.90, 1.00, 1.20, 1.40]
}

SECTION_DEPS = {8:[7], 19:[12], 20:[10], 21:[15], 25:[24]}

# Deliverable menu: 1-indexed
DELIVERABLE_MENU = ['figma', 'deck', 'asset-pkg', 'notion', 'portal']

# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def parse_section_input(input_str):
    if not input_str or not input_str.strip():
        return []
    result = []
    for token in input_str.split(','):
        t = token.strip()
        if t.upper() == 'A':
            result.append('A')
        else:
            try:
                result.append(int(t))
            except ValueError:
                pass
    return result


def parse_deliverable_input(input_str):
    """Map 1-based menu indices to deliverable keys. 1=figma, 2=deck, 3=asset-pkg, 4=notion, 5=portal."""
    if not input_str or not input_str.strip():
        return []
    result = []
    for token in input_str.split(','):
        t = token.strip()
        try:
            idx = int(t) - 1
            if 0 <= idx < len(DELIVERABLE_MENU):
                result.append(DELIVERABLE_MENU[idx])
        except ValueError:
            pass
    return result

# ---------------------------------------------------------------------------
# Core computation
# ---------------------------------------------------------------------------

def compute_estimate(sections, add_ons, deliverables, client_type, eaf,
                     is_package, licensed_fonts, coeff_a=None,
                     min_rate=None, median_rate=None, max_rate=None,
                     markup_pct=None, floor_with_fonts=None, floor_no_fonts=None):
    A     = coeff_a        if coeff_a        is not None else COEFF_A
    r_min = min_rate       if min_rate       is not None else MIN_RATE
    r_med = median_rate    if median_rate    is not None else MEDIAN_RATE
    r_max = max_rate       if max_rate       is not None else MAX_RATE
    mult  = 1 + markup_pct / 100 if markup_pct is not None else MARKUP_MULT
    fl_w  = floor_with_fonts if floor_with_fonts is not None else FLOOR_WITH_FONTS
    fl_n  = floor_no_fonts   if floor_no_fonts   is not None else FLOOR_NO_FONTS

    exp_b = EXP_B_MAP.get(client_type)
    if exp_b is None:
        raise ValueError(f'Unknown client_type: "{client_type}"')

    # Mutual exclusivity: if both logo-new and logo-full-vi present, drop logo-new
    has_logo_new = any(a['key'] == 'logo-new' for a in add_ons)
    has_logo_full = any(a['key'] == 'logo-full-vi' for a in add_ons)
    if has_logo_new and has_logo_full:
        add_ons = [a for a in add_ons if a['key'] != 'logo-new']

    # CP calculations
    section_cp = sum(SECTION_CP.get(k, 0) for k in sections)
    add_on_cp = sum((ADD_ON_CP.get(a['key'], 0)) * a.get('qty', 1) for a in add_ons)
    deliverable_cp = sum(DELIVERABLE_CP.get(d, 0) for d in deliverables)
    total_cp = section_cp + add_on_cp + deliverable_cp

    # EAF
    eaf_value = 1.0
    for k in ('vision', 'timeline', 'revisions', 'stakeholders'):
        idx = eaf.get(k, 1) if eaf else 1
        table = EAF_MAP[k]
        if idx < 0 or idx >= len(table):
            raise IndexError(f'Invalid EAF index: {k}={idx}')
        eaf_value *= table[idx]

    # Hours estimation (PERT)
    H_base = A * mpow(total_cp, exp_b)
    H_adj = H_base * eaf_value

    a_pert = H_adj * 0.75
    m = H_adj * 1.00
    b_pert = H_adj * 1.60
    E = (a_pert + 4 * m + b_pert) / 6
    SD = (b_pert - a_pert) / 6

    # Cost range
    cost_low  = (E - SD) * r_min
    cost_mid  = E * r_med
    cost_high = (E + SD) * r_max

    # Fixed quote
    fixed_raw = cost_high * mult
    fixed_disc = fixed_raw * (1 - PACKAGE_DISCOUNT) if is_package else fixed_raw
    floor = fl_w if licensed_fonts else fl_n
    fixed_quote = max(fixed_disc, floor)
    floor_triggered = fixed_disc < floor

    # Breakdown
    per_cp_hrs = E / total_cp if total_cp > 0 else 0
    breakdown = []
    for s in sections:
        cp = SECTION_CP.get(s, 0)
        breakdown.append({
            'key': f'S{s}',
            'label': SECTION_NAMES.get(s, str(s)),
            'cp': cp,
            'hours': cp * per_cp_hrs
        })
    for a in add_ons:
        cp = ADD_ON_CP.get(a['key'], 0) * a.get('qty', 1)
        breakdown.append({
            'key': a['key'],
            'label': ADD_ON_NAMES.get(a['key'], a['key']),
            'cp': cp,
            'hours': cp * per_cp_hrs
        })
    for d in deliverables:
        cp = DELIVERABLE_CP.get(d, 0)
        breakdown.append({
            'key': d,
            'label': DELIVERABLE_NAMES.get(d, d),
            'cp': cp,
            'hours': cp * per_cp_hrs
        })

    return {
        'total_cp': total_cp,
        'section_cp': section_cp,
        'add_on_cp': add_on_cp,
        'deliverable_cp': deliverable_cp,
        'exp_b': exp_b,
        'eaf_value': eaf_value,
        'H_base': H_base,
        'H_adj': H_adj,
        'E': E,
        'SD': SD,
        'cost_low': cost_low,
        'cost_mid': cost_mid,
        'cost_high': cost_high,
        'fixed_raw': fixed_raw,
        'fixed_disc': fixed_disc,
        'fixed_quote': fixed_quote,
        'floor': floor,
        'floor_triggered': floor_triggered,
        'is_package': is_package,
        'licensed_fonts': licensed_fonts,
        'breakdown': breakdown,
        'min_rate': r_min,
        'median_rate': r_med,
        'max_rate': r_max,
    }

# ---------------------------------------------------------------------------
# Calibration
# ---------------------------------------------------------------------------

def calibrate_coeff_a(rows):
    if not rows:
        return COEFF_A
    ratios = []
    for r in rows:
        try:
            denom = mpow(r['total_cp'], r['exp_b']) * r['eaf']
            if denom > 0 and r['actual_hrs'] > 0:
                ratios.append(r['actual_hrs'] / denom)
        except (ZeroDivisionError, KeyError, TypeError):
            pass
    return sum(ratios) / len(ratios) if ratios else COEFF_A


def load_calibration(csv_path=None):
    if csv_path is None:
        csv_path = os.path.join(os.path.dirname(__file__), 'data', 'calibration.csv')
    try:
        rows = []
        with open(csv_path, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    rows.append({
                        'total_cp': float(row['total_cp']),
                        'exp_b': float(row['exp_b']),
                        'eaf': float(row['eaf']),
                        'actual_hrs': float(row['actual_hrs'])
                    })
                except (KeyError, ValueError):
                    pass
        if len(rows) < 5:
            return (COEFF_A, 0)
        return (calibrate_coeff_a(rows), len(rows))
    except Exception:
        return (COEFF_A, 0)

# ---------------------------------------------------------------------------
# Output formatter
# ---------------------------------------------------------------------------

def format_output(result, meta):
    """
    Format the estimate result into a human-readable string.

    Parameters
    ----------
    result : dict returned by compute_estimate
    meta   : dict with keys 'mode' and 'hrs_per_week'
    """
    def fmt_usd(v):
        return f"${v:,.0f}"

    mode = meta.get('mode', '-')
    hrs_per_week = meta.get('hrs_per_week', 0)
    weeks = (result['E'] / hrs_per_week) if hrs_per_week else None

    lines = []
    lines.append("=" * 62)
    lines.append("  BRAND GUIDE ESTIMATE")
    lines.append(f"  Generated: {date.today().isoformat()}")
    lines.append("=" * 62)

    lines.append("")
    lines.append(f"  Mode           : {mode}")
    lines.append(f"  Client Type    : {meta.get('client_type', '-')}")
    lines.append(f"  Package        : {'Yes' if result['is_package'] else 'No'}")
    lines.append(f"  Licensed Fonts : {'Yes' if result['licensed_fonts'] else 'No'}")

    lines.append("")
    lines.append("  SCOPE SUMMARY")
    lines.append("  " + "-" * 40)
    lines.append(f"  Section CP      : {result['section_cp']}")
    lines.append(f"  Add-On CP       : {result['add_on_cp']}")
    lines.append(f"  Deliverable CP  : {result['deliverable_cp']}")
    lines.append(f"  Total CP        : {result['total_cp']}")

    lines.append("")
    lines.append("  EFFORT MODEL")
    lines.append("  " + "-" * 40)
    lines.append(f"  EAF             : {result['eaf_value']:.4f}")
    lines.append(f"  H base          : {result['H_base']:.2f} hrs")
    lines.append(f"  H adjusted      : {result['H_adj']:.2f} hrs")
    lines.append(f"  E (PERT mean)   : {result['E']:.2f} hrs")
    lines.append(f"  SD              : {result['SD']:.2f} hrs")
    if weeks is not None:
        lines.append(f"  Timeline        : ~{weeks:.1f} weeks at {hrs_per_week} hrs/week")

    lines.append("")
    lines.append("  QUOTE")
    lines.append("  " + "-" * 40)
    lines.append(f"  Cost range      : {fmt_usd(result['cost_low'])} – {fmt_usd(result['cost_high'])}")
    lines.append(f"  Expected cost   : {fmt_usd(result['cost_mid'])}  (at ${result['median_rate']}/hr median)")
    lines.append(f"  Fixed raw       : {fmt_usd(result['fixed_raw'])}")
    if result['is_package']:
        lines.append(f"  Package disc.   : {fmt_usd(result['fixed_disc'])} (-{PACKAGE_DISCOUNT*100:.0f}%)")
    if result['floor_triggered']:
        lines.append(f"  Floor applied   : {fmt_usd(result['floor'])} (minimum)")
    lines.append(f"  FIXED QUOTE     : {fmt_usd(result['fixed_quote'])}")

    lines.append("")
    lines.append("  LINE-ITEM BREAKDOWN")
    lines.append("  " + "-" * 40)
    lines.append(f"  {'Item':<38} {'CP':>4} {'Hrs':>7}")
    lines.append("  " + "-" * 52)
    for item in result['breakdown']:
        label = item['label'][:36]
        lines.append(f"  {label:<38} {item['cp']:>4} {item['hours']:>7.1f}")

    lines.append("")
    lines.append("=" * 62)

    return "\n".join(lines)

# ---------------------------------------------------------------------------
# Interactive CLI
# ---------------------------------------------------------------------------

def _prompt(msg, default=None):
    suffix = f" [{default}]" if default is not None else ""
    val = input(f"{msg}{suffix}: ").strip()
    if not val and default is not None:
        return str(default)
    return val


def _ask_eaf():
    eaf = {}
    labels = {
        'vision':       ('Vision clarity', '1=Very clear  2=Normal  3=Fuzzy  4=Undefined'),
        'timeline':     ('Timeline pressure', '1=Relaxed  2=Normal  3=Tight  4=Rushed'),
        'revisions':    ('Revision scope', '1=Minimal  2=Normal  3=Some  4=Heavy'),
        'stakeholders': ('Stakeholder count', '1=Solo  2=Small team  3=Multiple  4=Many'),
    }
    print("\n  EAF Factors (1=favorable, 4=challenging):")
    for key, (label, options) in labels.items():
        while True:
            val = _prompt(f"  {label} ({options})", 2)
            try:
                idx = int(val)
                if 1 <= idx <= 4:
                    eaf[key] = idx - 1
                    break
                else:
                    print("  Please enter 1–4.")
            except ValueError:
                print("  Please enter 1–4.")
    return eaf


def _ask_add_ons():
    add_ons = []
    print("\n  Logo options:")
    print("  1 = New logo design (+6 CP)")
    print("  2 = Full visual identity design (+10 CP)")
    print("  3 = None")
    logo_choice = _prompt("  Select", 3)
    if logo_choice == '1':
        add_ons.append({'key': 'logo-new', 'qty': 1})
    elif logo_choice == '2':
        add_ons.append({'key': 'logo-full-vi', 'qty': 1})

    print("\n  Additional add-ons (comma-separated numbers, or leave blank):")
    print("  1=Multi-brand (+3 CP)  2=Illustration (+4 CP)")
    print("  3=Workshop (+2 CP/each)  4=Font licensing (+1 CP)")
    raw = _prompt("  Add-ons", '')
    for token in raw.split(','):
        t = token.strip()
        if t == '1':
            add_ons.append({'key': 'multi-brand', 'qty': 1})
        elif t == '2':
            add_ons.append({'key': 'illustration', 'qty': 1})
        elif t == '3':
            while True:
                qty_str = _prompt("  Workshop sessions (qty)", 1)
                try:
                    qty = int(qty_str)
                    if qty > 0:
                        add_ons.append({'key': 'workshop', 'qty': qty})
                        break
                    else:
                        print("  Enter a positive number.")
                except ValueError:
                    print("  Enter a positive number.")
        elif t == '4':
            add_ons.append({'key': 'font-licensing', 'qty': 1})

    return add_ons


def _parse_flag(args, flag):
    try:
        i = args.index(flag)
        return float(args[i + 1])
    except (ValueError, IndexError):
        return None


def _rates_path():
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'rates.json')


def load_rates():
    try:
        import json
        with open(_rates_path(), encoding='utf-8') as f:
            r = json.load(f)
        return {k: v for k, v in r.items() if isinstance(v, (int, float))}
    except Exception:
        return {}


def save_rates(rates):
    import json
    path = _rates_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(rates, f, indent=2)
        f.write('\n')


if __name__ == '__main__':
    args = sys.argv[1:]
    do_calibrate = '--calibrate' in args
    export_path = None
    if '--export' in args:
        idx = args.index('--export')
        if idx + 1 < len(args) and not args[idx + 1].startswith('--'):
            export_path = args[idx + 1]
        else:
            export_path = f"brand-estimate-{date.today().isoformat()}.md"

    flag_rates = {
        'min_rate':        _parse_flag(args, '--min-rate'),
        'median_rate':     _parse_flag(args, '--median-rate'),
        'max_rate':        _parse_flag(args, '--max-rate'),
        'markup_pct':      _parse_flag(args, '--markup'),
        'floor_with_fonts':_parse_flag(args, '--floor-fonts'),
        'floor_no_fonts':  _parse_flag(args, '--floor-no-fonts'),
    }

    # Load persisted rates, then let CLI flags override
    saved = load_rates()
    key_map = {'minRate':'min_rate','medianRate':'median_rate','maxRate':'max_rate',
               'markupPct':'markup_pct','floorWithFonts':'floor_with_fonts','floorNoFonts':'floor_no_fonts'}
    rate_kwargs = {py: saved.get(js) for js, py in key_map.items()}
    rate_kwargs.update({k: v for k, v in flag_rates.items() if v is not None})

    # Save back if any flag was provided
    if any(v is not None for v in flag_rates.values()):
        save_rates({
            'minRate':        rate_kwargs.get('min_rate')        or MIN_RATE,
            'medianRate':     rate_kwargs.get('median_rate')     or MEDIAN_RATE,
            'maxRate':        rate_kwargs.get('max_rate')        or MAX_RATE,
            'markupPct':      rate_kwargs.get('markup_pct')      or (MARKUP_MULT - 1) * 100,
            'floorWithFonts': rate_kwargs.get('floor_with_fonts') or FLOOR_WITH_FONTS,
            'floorNoFonts':   rate_kwargs.get('floor_no_fonts')   or FLOOR_NO_FONTS,
        })

    # Load calibration
    coeff_a, cal_rows = load_calibration()

    if do_calibrate:
        print("=== Calibration Mode ===")
        print("Enter actual project data to improve COEFF_A.")
        csv_path = os.path.join(os.path.dirname(__file__), 'data', 'calibration.csv')
        os.makedirs(os.path.dirname(csv_path), exist_ok=True)
        write_header = not os.path.exists(csv_path)
        with open(csv_path, 'a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            if write_header:
                writer.writerow(['total_cp', 'exp_b', 'eaf', 'actual_hrs'])
            total_cp = float(_prompt("Total CP of project"))
            client_type = _prompt("Client type (solo/small-biz/mid-market/enterprise)", 'small-biz')
            exp_b = EXP_B_MAP.get(client_type, 1.08)
            eaf_val = float(_prompt("EAF value (product of all factors)", 1.0))
            actual_hrs = float(_prompt("Actual hours worked"))
            writer.writerow([total_cp, exp_b, eaf_val, actual_hrs])
        print("Saved. Re-run without --calibrate to estimate.")
        sys.exit(0)

    print("=== Brand Guide Estimator ===")
    if cal_rows >= 5:
        print(f"  (Calibrated from {cal_rows} projects, COEFF_A={coeff_a:.3f})")

    print("\n  Mode:")
    print("  1 = Quick (sections only, nominal EAF)")
    print("  2 = Standard (sections + add-ons + deliverables + EAF)")
    print("  3 = Package (choose a predefined package)")
    print("  4 = Full custom")
    mode_str = _prompt("  Select mode", 2)
    mode = int(mode_str) if mode_str in ('1','2','3','4') else 2

    # Scope
    if mode == 3:
        print("\n  Packages:")
        pkg_keys = list(PACKAGE_SECTIONS.keys())
        for i, pk in enumerate(pkg_keys, 1):
            print(f"  {i} = {pk}")
        pkg_idx = _prompt("  Select package", 1)
        try:
            pkg_key = pkg_keys[int(pkg_idx) - 1]
        except (ValueError, IndexError):
            pkg_key = pkg_keys[0]
        sections = PACKAGE_SECTIONS[pkg_key]
        is_package = True
    else:
        print("\n  Enter section numbers (1–26, A) separated by commas.")
        print("  Examples: 1,3,5  or  1,4,5,10,11,12,16")
        raw_sections = _prompt("  Sections")
        sections = parse_section_input(raw_sections)
        is_package = False

    client_type = _prompt("\n  Client type (solo/small-biz/mid-market/enterprise)", 'small-biz')
    while client_type not in EXP_B_MAP:
        print("  Invalid. Choose: solo, small-biz, mid-market, enterprise")
        client_type = _prompt("  Client type", 'small-biz')

    if mode == 1:
        add_ons = []
        deliverables = []
        eaf = {'vision': 1, 'timeline': 1, 'revisions': 1, 'stakeholders': 1}
    else:
        add_ons = _ask_add_ons()

        print("\n  Deliverables (comma-separated, or leave blank):")
        print("  1=Figma  2=Deck  3=Asset Pkg  4=Notion  5=Portal")
        raw_del = _prompt("  Select", '')
        deliverables = parse_deliverable_input(raw_del)

        eaf = _ask_eaf()

    fonts_ans = _prompt("\n  Licensed fonts? (y/n)", 'y')
    licensed_fonts = fonts_ans.lower().startswith('y')

    hrs_per_week = 0
    hrs_str = _prompt("  Hours/week available (0 to skip timeline)", 0)
    try:
        hrs_per_week = float(hrs_str)
    except ValueError:
        hrs_per_week = 0

    result = compute_estimate(
        sections=sections,
        add_ons=add_ons,
        deliverables=deliverables,
        client_type=client_type,
        eaf=eaf,
        is_package=is_package,
        licensed_fonts=licensed_fonts,
        coeff_a=coeff_a,
        **{k: v for k, v in rate_kwargs.items() if v is not None}
    )

    meta = {
        'mode': mode,
        'client_type': client_type,
        'hrs_per_week': hrs_per_week
    }

    output = format_output(result, meta)
    print("\n" + output)

    if export_path:
        with open(export_path, 'w', encoding='utf-8') as f:
            f.write(output)
        print(f"\nExported to: {export_path}")
