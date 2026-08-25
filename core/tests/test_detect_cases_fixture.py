# -*- coding: utf-8 -*-
"""跑 fixtures/detect_cases.json 共享用例（TS 侧共用同一份文件，见契约第 5 节）。"""
import json
from pathlib import Path

import pytest

from bomcore.detect import detect_header_row

CASES = json.loads((Path(__file__).parent / "fixtures" / "detect_cases.json").read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_detect_header_row_matches_expected(case):
    idx, low_conf = detect_header_row(case["rows"])
    assert idx == case["expected_header_row_index"], case["name"]
    assert low_conf == case["expected_low_confidence"], case["name"]
