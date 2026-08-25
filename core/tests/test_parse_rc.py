# -*- coding: utf-8 -*-
"""迁移自旧仓库 tests/test_value_parsing.py，import 路径改为 bomcore.parse_rc。
逻辑与断言语义保持不变（见旧文件 docstring 里记录的两个真实事故复盘）。
"""
from bomcore.parse_rc import parse_bom_rc_value, parse_material_rc_params


class TestParseMaterialRcParams:
    def test_kilo_ohm_with_omega_suffix(self):
        r = parse_material_rc_params("47kΩ±1%/R0603(RS-03K4702FT)/FH(风华)", "贴片电阻")
        assert r is not None
        assert r["value"] == 47000.0
        assert r["package"] == "0603"
        assert r["tolerance"] == "1%"

    def test_zero_ohm_with_omega_suffix(self):
        r = parse_material_rc_params("0Ω ±1% /R0603 (RS-03000FT)/FH(风华)", "贴片电阻")
        assert r is not None
        assert r["value"] == 0.0

    def test_mega_ohm_with_omega_suffix(self):
        r = parse_material_rc_params("1MΩ±1%/R0603(RS-03K1004FT)/FH(风华)", "贴片电阻")
        assert r is not None
        assert r["value"] == 1_000_000.0

    def test_milliohm_vs_megaohm_are_not_conflated(self):
        milli = parse_material_rc_params("10m/0603", "电阻")
        mega = parse_material_rc_params("10M/0603", "电阻")
        assert milli["value"] == 0.01
        assert mega["value"] == 10_000_000.0
        assert milli["value"] != mega["value"]

    def test_compound_milliohm_suffix(self):
        r = parse_material_rc_params("HoYH1206-1W-90mR-1%/1206/Milliohm(毫欧)", "电流采样电阻")
        assert r is not None
        assert r["value"] == 0.09

    def test_does_not_misread_digits_inside_part_number(self):
        r = parse_material_rc_params("10kΩ±1%/R0603(RS-03K1002FT)/FH(风华)", "贴片电阻")
        assert r["value"] == 10000.0

    def test_compact_decimal_notation_on_isolated_segment(self):
        r = parse_material_rc_params("4R7", "贴片电阻")
        assert r["value"] == 4.7

    def test_letter_prefixed_multiplier_without_unit_word(self):
        r = parse_material_rc_params("RL1812A470K/R1812", "压敏电阻")
        assert r["value"] == 470_000.0

    def test_opaque_part_number_is_not_misparsed(self):
        assert parse_material_rc_params("RS-03K1002FT", "贴片电阻") is None
        assert parse_material_rc_params("TD03G1002BT", "贴片电阻") is None

    def test_capacitor_uppercase_unit(self):
        r = parse_material_rc_params("100NF/50V", "贴片电容")
        assert r["value"] == 100_000.0

    def test_capacitor_micro_sign_and_greek_mu(self):
        r1 = parse_material_rc_params("1µF", "贴片电容")  # U+00B5 micro sign
        r2 = parse_material_rc_params("1μF", "贴片电容")  # U+03BC Greek mu
        assert r1["value"] == 1_000_000.0
        assert r2["value"] == 1_000_000.0

    def test_non_rc_component_returns_none(self):
        assert parse_material_rc_params("STM32F103RCT6/ST/LQFP64", "单片机") is None

    def test_placeholder_spec_returns_none(self):
        assert parse_material_rc_params("NC", "贴片电阻") is None


class TestParseBomRcValue:
    def test_resistor_with_omega(self):
        assert parse_bom_rc_value("47kΩ") == ("R", 47000.0)
        assert parse_bom_rc_value("0Ω") == ("R", 0.0)
        assert parse_bom_rc_value("1MΩ") == ("R", 1_000_000.0)

    def test_milliohm(self):
        assert parse_bom_rc_value("90mΩ") == ("R", 0.09)

    def test_dnp_suffix_is_stripped(self):
        assert parse_bom_rc_value("10kΩ-DNP") == ("R", 10000.0)

    def test_capacitor_units_case_insensitive(self):
        assert parse_bom_rc_value("4.7UF") == ("C", 4_700_000.0)
        assert parse_bom_rc_value("100NF") == ("C", 100_000.0)
        assert parse_bom_rc_value("100nF") == ("C", 100_000.0)

    def test_capacitor_micro_sign_and_greek_mu(self):
        assert parse_bom_rc_value("1µF") == ("C", 1_000_000.0)
        assert parse_bom_rc_value("1μF") == ("C", 1_000_000.0)

    def test_conservative_about_free_text_part_numbers(self):
        assert parse_bom_rc_value("TMP101NA/3K-DNP") == (None, None)
        assert parse_bom_rc_value("3K") == (None, None)
