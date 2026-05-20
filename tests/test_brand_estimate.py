import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from brand_estimate import (
    compute_estimate, calibrate_coeff_a, format_output,
    parse_section_input, parse_deliverable_input, COEFF_A
)

def test_verification_scenario():
    r = compute_estimate(
        sections=[1, 4, 5, 10, 11, 12, 16],
        add_ons=[{'key':'logo-new','qty':1}, {'key':'workshop','qty':1}],
        deliverables=['figma', 'asset-pkg'],
        client_type='small-biz',
        eaf={'vision':2, 'timeline':2, 'revisions':2, 'stakeholders':1},
        is_package=False, licensed_fonts=True, coeff_a=1.5
    )
    assert r['total_cp'] == 29
    assert abs(r['eaf_value'] - 1.656) < 0.01
    assert abs(r['E'] - 99.8) < 1.5
    assert abs(r['fixed_quote'] - 23433) < 200

def test_floor_with_fonts():
    r = compute_estimate(
        sections=[3], add_ons=[], deliverables=[],
        client_type='solo',
        eaf={'vision':0, 'timeline':0, 'revisions':0, 'stakeholders':0},
        is_package=False, licensed_fonts=True, coeff_a=1.5
    )
    assert r['floor_triggered'] == True
    assert r['fixed_quote'] == 2500

def test_floor_no_fonts():
    r = compute_estimate(
        sections=[3], add_ons=[], deliverables=[],
        client_type='solo',
        eaf={'vision':0, 'timeline':0, 'revisions':0, 'stakeholders':0},
        is_package=False, licensed_fonts=False, coeff_a=1.5
    )
    assert r['fixed_quote'] == 2000

def test_calibrate_empty():
    assert calibrate_coeff_a([]) == COEFF_A

def test_parse_section_input():
    assert parse_section_input('1,4,5,A') == [1, 4, 5, 'A']

def test_parse_deliverable_input():
    # 1=figma, 2=deck, 3=asset-pkg, 4=notion, 5=portal
    assert parse_deliverable_input('1,3') == ['figma', 'asset-pkg']
