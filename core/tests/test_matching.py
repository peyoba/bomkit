# -*- coding: utf-8 -*-
"""迁移自旧仓库 tests/test_matching_confidence.py。

原测试通过写临时 xlsx 文件 + JLCBOMConverter 构造入参；新测试直接构造
MaterialItem 列表 + match_config，调用 bomcore.matching.match_device，
断言语义保持不变（子串匹配护栏、参数匹配兜底）。
"""
from bomcore.matching import DEFAULT_MATCH_CONFIG, build_material_rc_index, match_device
from bomcore.models import MaterialItem


def _materials(rows):
    """rows: list of (code, name, spec) tuples -> list[MaterialItem]（enabled）。"""
    return [MaterialItem(code=c, name=n, spec=s, status="enabled") for c, n, s in rows]


class TestSubstringMatchGuards:
    def test_short_device_token_is_rejected(self):
        # 单字符 device token（如 'K'）若不设最短长度护栏，会子串命中海量无关规格。
        materials = _materials([("01.0001", "贴片电阻", "4.7K 1%/0603")])
        result = match_device("K", materials, build_material_rc_index(materials))
        assert result["level"] == "none"

    def test_token_glued_to_other_alphanumerics_is_rejected(self):
        materials = _materials([("01.0001", "贴片电阻", "10kΩ(RS-03K1002FT)")])
        result = match_device("K1002", materials, build_material_rc_index(materials))
        assert result["level"] == "none"

    def test_long_isolated_device_token_matches_with_low_confidence(self):
        materials = _materials([("01.0001", "贴片电阻", "10kΩ±1%/R0603(RS-03K1002FT)")])
        result = match_device("RS-03K1002FT", materials, build_material_rc_index(materials))
        assert result["level"] == "substring"
        assert result["code"] == "01.0001"

    def test_exact_match_is_still_high_confidence(self):
        materials = _materials([("01.0001", "贴片电阻", "STM32F103RCT6")])
        result = match_device("STM32F103RCT6", materials, build_material_rc_index(materials))
        assert result["level"] == "exact"
        assert result["status_text"] == "精确匹配"


class TestParameterFallbackRescuesRealCase:
    def test_10k_resistor_rescued_by_parameter_match(self):
        materials = _materials([("01.0001", "贴片电阻", "10K±1%/R0603")])
        result = match_device(
            "TD03G1002BT", materials, build_material_rc_index(materials),
            name="10kΩ", footprint="R0603", tolerance="±1%",
        )
        assert result["level"] == "param"
        assert result["code"] == "01.0001"


class TestNonComponent:
    def test_hole_and_test_point_flagged_non_component(self):
        materials = _materials([("01.0001", "贴片电阻", "10K")])
        rc_index = build_material_rc_index(materials)
        for device in ("Mounting_Hole", "Test-Point", "fiducial"):
            result = match_device(device, materials, rc_index, match_config=DEFAULT_MATCH_CONFIG)
            assert result["level"] == "non_component"
