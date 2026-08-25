"""可配置级联匹配管线。逐字符搬运自旧核心 249-259、460-609 行，
接口改为纯函数 + MaterialItem 列表 + match_config dict（见契约 3.3）。
"""
from __future__ import annotations

import re

from .models import MaterialItem
from .parse_rc import (
    extract_package,
    normalize_package,
    normalize_tolerance,
    parse_bom_rc_value,
    parse_material_rc_params,
    rc_values_equal,
)


def build_material_rc_index(materials: list[MaterialItem]) -> list[dict]:
    """为参数匹配预构建 R/C 索引：对每条物料尝试解析出 rc_type/rc_value/rc_package/rc_tolerance。

    非 R/C 类物料（parse_material_rc_params 返回 None）仍保留在索引里（code/name/spec
    完整，rc_* 字段缺失），param_fallback_search 会用 rc_type 过滤掉它们。
    """
    index = []
    for m in materials:
        entry = {"code": m.code, "name": m.name, "spec": m.spec}
        rc = parse_material_rc_params(m.spec, m.name)
        if rc:
            entry["rc_type"] = rc["type"]
            entry["rc_value"] = rc["value"]
            entry["rc_package"] = rc["package"]
            entry["rc_tolerance"] = rc["tolerance"]
        index.append(entry)
    return index

DEFAULT_MATCH_CONFIG = {
    "levels": {
        "exact": True,
        "model": True,
        "substring": {"enabled": True, "min_len": 6},
        "clean_retry": True,
        "param": {"enabled": True, "use_package": True, "use_tolerance": True},
    },
    "candidate_priority_prefix": "01.",
    "non_component_keywords": [
        "hole", "test-point", "test_point", "fiducial", "mounting_hole",
    ],
}


def clean_jlc_device(device: str) -> str:
    """Remove JLC-specific suffixes (e.g. _C154551) and split comma-separated variants."""
    cleaned = re.sub(r"_C\d+$", "", device)
    cleaned = cleaned.split(",")[0].strip()
    return cleaned


def is_non_component(device: str, keywords: list[str]) -> bool:
    d = device.lower()
    return any(p in d for p in keywords)


def is_specific_substring_match(device_upper: str, spec_upper: str, min_len: int) -> bool:
    if len(device_upper) < min_len:
        return False
    idx = spec_upper.find(device_upper)
    if idx == -1:
        return False
    before = spec_upper[idx - 1] if idx > 0 else ""
    after_idx = idx + len(device_upper)
    after = spec_upper[after_idx] if after_idx < len(spec_upper) else ""
    # Reject if glued to another alphanumeric on either side (token boundary check).
    return not (before.isalnum() or after.isalnum())


def _candidate_dict(m: MaterialItem) -> dict:
    return {"code": m.code, "name": m.name, "spec": m.spec}


def select_best_match(
    matches: list[MaterialItem],
    match_level: str,
    priority_prefix: str,
    low_confidence: bool = False,
) -> tuple[str, str, str, str, str, list[MaterialItem]]:
    """Pick the best candidate from a list of matches, preferring priority_prefix codes."""
    unique_codes = {m.code for m in matches}
    status_type_single = "matched_low_confidence" if low_confidence else "matched"

    if len(unique_codes) == 1:
        m = matches[0]
        return m.code, m.name, m.spec, match_level, status_type_single, matches

    group_priority = [m for m in matches if m.code.startswith(priority_prefix)]
    best = group_priority[0] if group_priority else matches[0]

    status_text = f"多个匹配({len(unique_codes)})"
    return best.code, best.name, best.spec, status_text, "multi", matches


def param_fallback_search(
    material_entries: list[dict],
    name: str,
    footprint: str,
    tolerance: str,
    priority_prefix: str,
    use_package: bool = True,
    use_tolerance: bool = True,
) -> list[dict]:
    """Parameter-based fallback search for unmatched R/C components.

    `material_entries` here is a list of dict (as built by build_material_rc_index),
    each containing rc_type/rc_value/rc_package/rc_tolerance plus code/name/spec.
    Returns list of matching entries (may be empty).
    """
    bom_type, bom_value = parse_bom_rc_value(name)
    if bom_type is None:
        return []

    bom_package = normalize_package(extract_package(footprint))
    bom_tolerance = normalize_tolerance(tolerance)

    candidates = [
        e for e in material_entries
        if e.get("rc_type") == bom_type
        and e.get("rc_value") is not None
        and rc_values_equal(e["rc_value"], bom_value)
    ]
    if not candidates:
        return []

    if use_package and bom_package:
        pkg_matches = [
            c for c in candidates
            if normalize_package(c.get("rc_package")) == bom_package
        ]
        if pkg_matches:
            candidates = pkg_matches

    if use_tolerance and bom_tolerance:
        tol_matches = [c for c in candidates if c.get("rc_tolerance") == bom_tolerance]
        if tol_matches:
            candidates = tol_matches

    candidates.sort(key=lambda c: (0 if c["code"].startswith(priority_prefix) else 1, c["code"]))
    return candidates


def match_device(
    device: str,
    material_entries_by_spec: list[MaterialItem],
    material_rc_index: list[dict],
    name: str = "",
    footprint: str = "",
    tolerance: str = "",
    match_config: dict | None = None,
) -> dict:
    """Multi-level matching for a single BOM row against the material library.

    Returns a dict:
    {
      "level": str,               # exact|model|substring|param|multi|none|non_component
      "status_text": str,
      "confidence": str,          # high|medium|low
      "code": str, "name": str, "spec": str,
      "candidates": list[dict],   # [{code,name,spec}, ...]
    }
    """
    cfg = match_config or DEFAULT_MATCH_CONFIG
    levels = cfg.get("levels", DEFAULT_MATCH_CONFIG["levels"])
    priority_prefix = cfg.get("candidate_priority_prefix", "01.")
    non_component_keywords = cfg.get("non_component_keywords", DEFAULT_MATCH_CONFIG["non_component_keywords"])

    if is_non_component(device, non_component_keywords):
        return {
            "level": "non_component", "status_text": "非物料", "confidence": "high",
            "code": "", "name": "", "spec": "", "candidates": [],
        }

    substring_cfg = levels.get("substring", {"enabled": True, "min_len": 6})
    min_len = substring_cfg.get("min_len", 6) if isinstance(substring_cfg, dict) else 6
    substring_enabled = substring_cfg.get("enabled", True) if isinstance(substring_cfg, dict) else bool(substring_cfg)

    try_devices = [device]
    if levels.get("clean_retry", True):
        try_devices.append(clean_jlc_device(device))
    try_devices = list(dict.fromkeys(try_devices))

    for try_device in try_devices:
        try_upper = try_device.upper().strip()
        if not try_upper:
            continue

        if levels.get("exact", True):
            matches = [m for m in material_entries_by_spec if m.spec_upper == try_upper]
            if matches:
                code, mname, spec, level, status_type, cands = select_best_match(
                    matches, "精确匹配", priority_prefix
                )
                return _build_result(level, status_type, code, mname, spec, cands)

        if levels.get("model", True):
            matches = [m for m in material_entries_by_spec if m.spec_core == try_upper]
            if matches:
                code, mname, spec, level, status_type, cands = select_best_match(
                    matches, "型号匹配", priority_prefix
                )
                return _build_result(level, status_type, code, mname, spec, cands)

        if substring_enabled:
            matches = [
                m for m in material_entries_by_spec
                if is_specific_substring_match(try_upper, m.spec_upper, min_len)
            ]
            if matches:
                code, mname, spec, level, status_type, cands = select_best_match(
                    matches, "料号匹配", priority_prefix, low_confidence=True
                )
                return _build_result(level, status_type, code, mname, spec, cands, low_confidence=True)

    param_cfg = levels.get("param", {"enabled": True})
    param_enabled = param_cfg.get("enabled", True) if isinstance(param_cfg, dict) else bool(param_cfg)
    if param_enabled:
        use_package = param_cfg.get("use_package", True) if isinstance(param_cfg, dict) else True
        use_tolerance = param_cfg.get("use_tolerance", True) if isinstance(param_cfg, dict) else True
        param_candidates = param_fallback_search(
            material_rc_index, name, footprint, tolerance, priority_prefix,
            use_package=use_package, use_tolerance=use_tolerance,
        )
        if param_candidates:
            unique_codes = {c["code"] for c in param_candidates}
            cands = [{"code": c["code"], "name": c["name"], "spec": c["spec"]} for c in param_candidates]
            if len(unique_codes) == 1:
                c = param_candidates[0]
                return {
                    "level": "param", "status_text": "参数匹配", "confidence": "medium",
                    "code": c["code"], "name": c["name"], "spec": c["spec"], "candidates": cands,
                }
            group_priority = [c for c in param_candidates if c["code"].startswith(priority_prefix)]
            best = group_priority[0] if group_priority else param_candidates[0]
            return {
                "level": "multi", "status_text": f"参数匹配({len(unique_codes)})", "confidence": "low",
                "code": best["code"], "name": best["name"], "spec": best["spec"], "candidates": cands,
            }

    return {
        "level": "none", "status_text": "未匹配", "confidence": "low",
        "code": "", "name": "", "spec": "", "candidates": [],
    }


def _build_result(level, status_type, code, mname, spec, matches, low_confidence=False) -> dict:
    cands = [_candidate_dict(m) for m in matches]
    if status_type == "multi":
        return {
            "level": "multi", "status_text": f"多个匹配({len({m.code for m in matches})})",
            "confidence": "medium", "code": code, "name": mname, "spec": spec, "candidates": cands,
        }
    level_map = {"精确匹配": "exact", "型号匹配": "model", "料号匹配": "substring"}
    confidence = "low" if low_confidence else "high"
    return {
        "level": level_map.get(level, level), "status_text": level, "confidence": confidence,
        "code": code, "name": mname, "spec": spec, "candidates": cands,
    }
