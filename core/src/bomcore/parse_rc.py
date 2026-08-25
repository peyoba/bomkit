"""R/C 值、封装、精度解析。

本模块的正则与常量表逐字符原样从旧核心
(jlc_bom_converter_core.py 行 51-70, 261-458) 搬运，只做接口适配（去掉
self/cls 依赖，改为独立函数）。见 docs/05-migration-map.md 边界 case 清单
第 2-9 条 —— 这些注释里记录的坑都是真实生产事故复盘，禁止"优化"掉。
"""
from __future__ import annotations

import re

# ── 封装表 ──

KNOWN_PACKAGES = frozenset({
    "0201", "0402", "0603", "0805", "1206", "1210", "1812", "2010", "2512", "3216", "6032",
})

# Imperial (EIA) package codes and their metric (IEC) equivalents refer to the
# exact same physical footprint (e.g. imperial '0603' == metric '1608'), but a
# BOM and a material spec don't always use the same convention. Without this
# mapping, package-based candidate filtering in param_fallback_search would
# treat them as different packages and could discard the correct candidate.
PACKAGE_METRIC_TO_IMPERIAL = {
    "1005": "0402",
    "1608": "0603",
    "2012": "0805",
    "3216": "1206",
    "3225": "1210",
    "4516": "1806",
    "4532": "1812",
    "5025": "2010",
    "6332": "2512",
}


def normalize_package(package: str | None) -> str | None:
    """Map a metric (IEC) package code to its imperial (EIA) equivalent so
    that package comparisons treat '3216' and '1206' as the same size."""
    if package is None:
        return None
    return PACKAGE_METRIC_TO_IMPERIAL.get(package, package)


def extract_package(footprint: str | None) -> str | None:
    """Extract package size from footprint (e.g. 'R0603' -> '0603')."""
    if not footprint:
        return None
    m = re.match(r"^[A-Za-z]*(\d{4})", footprint.strip())
    return m.group(1) if m and m.group(1) in KNOWN_PACKAGES else None


# ── R/C parameter parsing ──
#
# Both the BOM side (parse_bom_rc_value) and the material-table side
# (parse_material_rc_params) share the same underlying value-extraction
# helpers (parse_resistor_ohms / parse_capacitor_pf) so the two can never
# disagree on what a given unit string means. This replaced two independent,
# subtly inconsistent regex implementations that:
#   - required different capitalisation for capacitor units (UF vs uF),
#   - only recognised the Greek mu (U+03BC) and not the micro sign (U+00B5)
#     that JLC EDA / Kingdee exports actually use,
#   - used `\b` as a word boundary after the resistor multiplier letter, which
#     silently fails right before 'Ω' because Python's regex engine treats the
#     Greek letter Ω as a word character — so specs like '47kΩ' never matched,
#   - collapsed milli- and mega-ohm into the *same* multiplier for material
#     specs ('10m' parsed as 10 mega-ohm, not 10 milli-ohm), which could match
#     a 10mΩ current-sense resistor in the BOM to a completely wrong 10MΩ part.

OHM_WORD = r"(?:Ω|欧|[Oo][Hh][Mm])"
_RC_SPLIT_RE = re.compile(r"[\/()（）,，]")
R_MULT = {"m": 1e-3, "R": 1, "r": 1, "K": 1e3, "k": 1e3, "M": 1e6}
C_UNIT_MULT = {"p": 1, "P": 1, "n": 1e3, "N": 1e3, "u": 1e6, "U": 1e6, "μ": 1e6, "µ": 1e6}


def rc_segments(text: str) -> list[str]:
    """Split a spec/name string on common delimiters so that a value embedded
    in one segment (e.g. the leading '10kΩ' in '10kΩ±1%/R0603(RS-03K1002FT)')
    isn't confused with digits inside an unrelated part-number segment."""
    parts = [p.strip() for p in _RC_SPLIT_RE.split(text) if p.strip()]
    return parts or [text.strip()]


def parse_resistor_ohms(seg: str, allow_compact: bool = False) -> float | None:
    """Try to extract a resistance value (in ohms) from a single text segment.

    Returns a float or None. `allow_compact` enables the decimal-replacement
    notation (e.g. '4R7' == 4.7Ω, '10K1' == 10.1kΩ), which is only safe to try
    on short, mostly-numeric segments — enabling it globally would misread
    digits embedded in opaque part numbers as resistor values.
    """
    # Milliohm compound suffix: '90mR', '90mΩ', '90m欧'. Note the multiplier
    # letter here is deliberately lowercase-only and NOT matched case-insensitively:
    # 'm' means milli and 'M' means mega, and conflating them silently mismatches
    # current-sense resistors (10mΩ) against 10MΩ parts.
    m = re.search(r"(?<![0-9.])(\d+(?:\.\d+)?)\s*m\s*(?:[Rr]\b|" + OHM_WORD + r")", seg)
    if m:
        return float(m.group(1)) * 1e-3

    # Explicit ohm/欧/ohm unit word, with an optional K/M multiplier before it.
    m = re.search(r"(?<![0-9.])(\d+(?:\.\d+)?)\s*([KM])?\s*" + OHM_WORD, seg)
    if m:
        num = float(m.group(1))
        mult_char = m.group(2)
        mult = R_MULT[mult_char] if mult_char else 1
        return num * mult

    # Bare number + multiplier letter, no unit word (e.g. '4.7K', '100R').
    # Block a preceding digit/dot (so we don't split a larger number in half)
    # but allow a preceding letter, and require the letter not be immediately
    # followed by another alphanumeric (so 'RS-03K1002FT' is correctly rejected
    # while 'RL1812A470K' is correctly accepted).
    m = re.search(r"(?<![0-9.])(\d+(?:\.\d+)?)\s*([RKMrkm])(?![0-9a-zA-Z])", seg)
    if m:
        return float(m.group(1)) * R_MULT[m.group(2)]

    if allow_compact:
        m = re.fullmatch(r"(\d+)([RKMrkm])(\d+)", seg)
        if m:
            whole, mult_char, frac = m.groups()
            return float(f"{whole}.{frac}") * R_MULT[mult_char]

    return None


def parse_capacitor_pf(seg: str) -> float | None:
    """Try to extract a capacitance value (in pF) from a single text segment.
    Accepts both the Greek mu (μ, U+03BC) and the micro sign (µ, U+00B5), and
    both upper- and lower-case unit letters (uF/UF, nF/NF, pF/PF).
    """
    m = re.search(r"(?<![0-9.])(\d+(?:\.\d+)?)\s*([pnuUNPμµ])\s*[Ff](?![a-zA-Z])", seg)
    if m:
        num = float(m.group(1))
        mult = C_UNIT_MULT.get(m.group(2)) or C_UNIT_MULT[m.group(2).lower()]
        return num * mult
    return None


def parse_bom_rc_value(name: str) -> tuple[str | None, float | None]:
    """Parse R/C value from BOM Name field (e.g. '10kΩ' -> ('R', 10000) / '100nF' -> ('C', 100000)).

    Intentionally conservative: the BOM 'Name' field can also hold arbitrary
    part numbers for non-R/C components (e.g. 'TMP101NA/3K-DNP'), so — unlike
    the material-table parser — this only trusts a segment that is *entirely*
    consumed by a single value expression, never a value found inside a
    larger free-text string.

    Returns (component_type, value_in_base_unit) or (None, None).
    """
    cleaned = re.sub(r"-?DNP$", "", name.strip(), flags=re.IGNORECASE).strip()
    if not cleaned:
        return None, None

    # Resistor: <number>[m|k|K|M]?[欧|Ω|ohm] — the whole string must be the value.
    m = re.match(r"^(\d+(?:\.\d+)?)\s*([mkKM])?\s*" + OHM_WORD + r"$", cleaned)
    if m:
        num = float(m.group(1))
        mult_char = m.group(2) or ""
        multiplier = {"m": 1e-3, "k": 1e3, "K": 1e3, "M": 1e6, "": 1}[mult_char]
        return "R", num * multiplier

    # Capacitor: <number>[u|U|n|N|p|P|μ|µ]F — whole string must be the value.
    m = re.match(r"^(\d+(?:\.\d+)?)\s*([pnuUNPμµ])\s*[Ff]$", cleaned)
    if m:
        num = float(m.group(1))
        mult = C_UNIT_MULT.get(m.group(2)) or C_UNIT_MULT[m.group(2).lower()]
        return "C", num * mult

    return None, None


def parse_material_rc_params(spec: str, mat_name: str) -> dict | None:
    """Parse R/C parameters from material spec string.

    Unlike the BOM-side parser, this scans across delimiter-separated segments
    of a full spec string (e.g. '10kΩ±1%/R0603(RS-03K1002FT)/FH(风华)') looking
    for the first segment that contains a recognisable value, since the useful
    value is usually the first component of the spec and opaque part-number
    segments later in the string must not be mistaken for it.

    Returns dict {type, value, package, tolerance} or None.
    """
    if not spec or str(spec).strip() in ("", "nan", "NC"):
        return None

    comp_type = None
    if "电阻" in mat_name:
        comp_type = "R"
    elif "电容" in mat_name:
        comp_type = "C"
    if not comp_type:
        return None

    spec_str = str(spec).strip()

    value = None
    package = None
    tolerance = None

    # Tolerance: ±N%
    tol_m = re.search(r"±?\s*(\d+(?:\.\d+)?)\s*%", spec_str)
    if tol_m:
        tolerance = tol_m.group(1) + "%"

    # Package: find 4-digit known package code
    for pm in re.finditer(r"(\d{4})", spec_str):
        if pm.group(1) in KNOWN_PACKAGES:
            package = pm.group(1)
            break

    segments = rc_segments(spec_str)
    if comp_type == "R":
        for seg in segments:
            value = parse_resistor_ohms(seg, allow_compact=True)
            if value is not None:
                break
    elif comp_type == "C":
        for seg in segments:
            value = parse_capacitor_pf(seg)
            if value is not None:
                break

    if value is None:
        return None

    return {"type": comp_type, "value": value, "package": package, "tolerance": tolerance}


def normalize_tolerance(tol_str: str | None) -> str | None:
    """Normalize tolerance string: '±10%' / '10%' / '±1%' -> '10%' / '1%'."""
    if not tol_str:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*%", str(tol_str))
    return m.group(1) + "%" if m else None


def rc_values_equal(a: float, b: float) -> bool:
    if a == 0 and b == 0:
        return True
    if a == 0 or b == 0:
        return False
    return abs(a - b) / max(abs(a), abs(b)) < 0.01
