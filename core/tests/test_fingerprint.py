# -*- coding: utf-8 -*-
"""表头指纹与相似度测试（契约 4.1/4.2）。"""
from bomcore.fingerprint import fingerprint, jaccard_similarity


def test_fingerprint_is_order_independent():
    a = fingerprint(["Name", "Designator", "Quantity"])
    b = fingerprint(["Quantity", "Name", "Designator"])
    assert a == b


def test_fingerprint_is_case_and_whitespace_insensitive():
    a = fingerprint(["Name", "Designator"])
    b = fingerprint([" name ", "DESIGNATOR"])
    assert a == b


def test_fingerprint_changes_with_different_headers():
    a = fingerprint(["Name", "Designator"])
    b = fingerprint(["Name", "Value"])
    assert a != b


def test_jaccard_similarity_identical_sets():
    assert jaccard_similarity(["A", "B"], ["A", "B"]) == 1.0


def test_jaccard_similarity_partial_overlap():
    sim = jaccard_similarity(["A", "B", "C"], ["A", "B", "D"])
    assert abs(sim - 0.5) < 1e-9
