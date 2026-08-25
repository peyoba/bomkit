"""表头指纹算法（契约 4.1/4.2）。Python 侧实现，供 CLI/Profile 复用判断使用；
Web 侧用 Web Crypto sha256 做等价实现，两端算法定义以本文件 + 契约为准。
"""
from __future__ import annotations

import hashlib

from .detect import normalize_header


def fingerprint(headers: list[str]) -> str:
    """sha256("\\x1f".join(sorted(set(normalized_headers)))) 的 hex。空表头忽略。"""
    normalized = {normalize_header(h) for h in headers if normalize_header(h)}
    joined = "\x1f".join(sorted(normalized))
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def jaccard_similarity(headers_a: list[str], headers_b: list[str]) -> float:
    set_a = {normalize_header(h) for h in headers_a if normalize_header(h)}
    set_b = {normalize_header(h) for h in headers_b if normalize_header(h)}
    if not set_a and not set_b:
        return 1.0
    if not set_a or not set_b:
        return 0.0
    return len(set_a & set_b) / len(set_a | set_b)
