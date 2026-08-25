# -*- coding: utf-8 -*-
"""契约 fixture 一致性测试。见 docs/02-contracts.md #8、docs/03-milestones.md
"契约层"验证策略：analyze_expected.json 锁定引擎行为，防止未来重构悄悄改变
匹配/分组结果。web 端在真实 core 就绪前也用这些 fixture mock Worker 响应。
"""
import json
from pathlib import Path

from bomcore.api import analyze

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "contract"


def _load(name):
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


def test_analyze_matches_frozen_expected_output():
    bom_rows = _load("bom_rows.json")["rows"]
    material_rows = _load("material_rows.json")["rows"]
    profiles = _load("profiles.json")
    expected = _load("analyze_expected.json")

    result = analyze(bom_rows, material_rows, profiles["bom_input"], profiles["material_input"])

    assert result == expected


def test_fixture_covers_every_match_level():
    """契约 6.2 枚举的每个 match.level 值都必须在 fixture 中至少出现一次，
    否则未来实现改动可能悄悄破坏某个从未被测试触达的分支。"""
    expected = _load("analyze_expected.json")
    levels = {it["match"]["level"] for it in expected["items"]}
    required = {"exact", "model", "substring", "param", "multi", "none", "non_component"}
    missing = required - levels
    assert not missing, f"fixture 未覆盖以下 match.level: {missing}"
