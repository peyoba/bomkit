# -*- coding: utf-8 -*-
"""迁移自旧仓库 tests/test_package_normalization.py。"""
from bomcore.parse_rc import normalize_package


def test_metric_and_imperial_package_codes_are_equivalent():
    assert normalize_package("3216") == normalize_package("1206")
    assert normalize_package("1608") == normalize_package("0603")
    assert normalize_package("2012") == normalize_package("0805")


def test_unmapped_package_code_passes_through_unchanged():
    assert normalize_package("0603") == "0603"


def test_none_package_stays_none():
    assert normalize_package(None) is None
