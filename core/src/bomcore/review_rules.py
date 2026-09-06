"""v2 的确定性核验：只把无法确定的事实交给人工，不把匹配排序当证明。

与 v1 的宽松候选搜索分开。尤其不能用大小写折叠混淆 m/M，也不能用
R/C 搜索中的近似数值或“无封装命中则保留候选”作为自动通过依据。
"""

from __future__ import annotations

import re
import unicodedata
from decimal import Decimal

from .parse_rc import KNOWN_PACKAGES, normalize_package


def text_key(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    # 保留物理量中 milli / mega 的区别，其余型号大小写、连续空白不产生问题。
    value = re.sub(
        r"(\d)\s*([mM])(?=\s*(?:[A-Za-zΩω]|$|[/,;%)\s]))",
        lambda m: m[1] + ("{milli}" if m[2] == "m" else "{mega}"),
        value,
    )
    return re.sub(r"\s+", " ", value).strip().casefold()


def model_key(value: str, jlc: bool = False) -> str:
    if jlc:
        value = re.sub(r"_C\d+$", "", value.strip())
    return text_key(value)


def model_identity_text(value: str, jlc: bool) -> str:
    return re.sub(r"_C\d+$", "", value.strip()) if jlc else value


def finding(code: str, field: str, label: str, original: str, library: str, reason: str, final: str = "") -> dict:
    return {
        "code": code,
        "field": field,
        "label": label,
        "original": original,
        "library": library,
        "final": final,
        "reason": reason,
    }


def number(value: Decimal) -> str:
    return format(value.normalize(), "f")


VALUE = re.compile(
    r"^\s*(\d+(?:\.\d+)?)\s*"
    r"([pPnNuUμµ][fF]|[mkKM]?(?:Ω|ω|[oO][hH][mM])|[rRkKMm])"
    r"(?![A-Za-z0-9.])"
)
COMPACT = re.compile(r"^\s*(\d+)([rRkKMm])(\d+)(?![A-Za-z0-9.])")
PROPERTIES = {
    "tolerance": ("精度", re.compile(r"±?\s*(\d+(?:\.\d+)?)\s*%")),
    "voltage": ("额定电压", re.compile(r"(?<![\w.])(\d+(?:\.\d+)?)\s*[vV](?![A-Za-z])")),
    "power": ("额定功率", re.compile(r"(?<![\w.])(\d+(?:\.\d+)?(?:/\d+)?)\s*[wW](?![A-Za-z])")),
    "dielectric": ("介质", re.compile(r"(?<![A-Za-z0-9])(C0G|NP0|X[578][RST]|Y5V|Z5U)(?![A-Za-z0-9])", re.IGNORECASE)),
    "tempco": ("温度系数", re.compile(r"(?<![\w.])(\d+(?:\.\d+)?)\s*[pP][pP][mM](?![A-Za-z])")),
}
PACKAGE = re.compile(
    r"(?<![A-Za-z0-9])(?:H?SC|RSM|IND[_-]?|[RCL])?(\d{4})(?:[-_]?[RCL])?(?![A-Za-z0-9])", re.IGNORECASE
)
NAMED_PACKAGE = re.compile(
    r"(?<![A-Za-z0-9])("
    r"(?:SOT|SOD)[- ]?\d+(?:-\d+)?|"
    r"(?:TSSOP|SSOP|MSOP|QSOP|SOIC|SOP|PDIP|DIP|TQFN|QFN|DFN|LQFP|TQFP|BGA)[- ]?\d+|"
    r"DO[- ]?214(?:AC|AA|AB)|SMA|SMB|SMC"
    r")(?![A-Za-z0-9])",
    re.IGNORECASE,
)
PACKAGE_ALIASES = {"DO214AC": "SMA", "DO214AA": "SMB", "DO214AB": "SMC"}


def packages(text: str) -> set[str]:
    result = {normalize_package(m[1]) for m in PACKAGE.finditer(text) if m[1] in KNOWN_PACKAGES}
    for m in NAMED_PACKAGE.finditer(text):
        key = re.sub(r"[- ]", "", m[1]).upper()
        # SOT-23-3 和 SOT-23-5 不合并；只统一分隔符。
        result.add(PACKAGE_ALIASES.get(key, key))
    return result


def properties(text: str) -> dict[str, set[str]]:
    out = {}
    for key, (_, pattern) in PROPERTIES.items():
        values = set()
        for m in pattern.finditer(text):
            if key == "dielectric":
                value = m[1].upper().replace("NP0", "C0G")
            elif "/" in m[1]:
                a, b = m[1].split("/")
                if Decimal(b) == 0:
                    continue
                value = number(Decimal(a) / Decimal(b))
            else:
                value = number(Decimal(m[1]))
            values.add(value)
        if values:
            out[key] = values
    return out


def rc_value(text: str) -> tuple[str, str, str] | None:
    """只信完整的数值前缀，不从不透明 MPN 的中间抠数字；返回精确十进制。"""
    compact = COMPACT.match(text)
    match = compact or VALUE.match(text)
    if not match:
        return None
    if compact:
        unit = match[2]
        value = Decimal(match[1] + "." + match[3])
    else:
        value, unit = Decimal(match[1]), match[2]
    if unit[-1] in "fF":
        multipliers = {"p": "1", "n": "1000", "u": "1000000", "μ": "1000000", "µ": "1000000"}
        kind, factor = "C", Decimal(multipliers[unit[0].lower()])
    else:
        factors = {"m": ".001", "M": "1000000", "k": "1000", "K": "1000"}
        kind, factor = "R", Decimal(factors.get(unit[0], "1"))
    return kind, number(value * factor), text[: match.end()].strip()


def unexplained_rc_text(text: str) -> str:
    match = COMPACT.match(text) or VALUE.match(text)
    if not match:
        return text
    rest = text[match.end() :]
    for _, pattern in PROPERTIES.values():
        rest = pattern.sub("", rest)
    rest = PACKAGE.sub(lambda m: "" if m[1] in KNOWN_PACKAGES else m[0], rest)
    return re.sub(r"[\s/(),，（）;；±]+", "", rest)


def material_evidence(material: dict) -> dict:
    spec = material["spec"]
    brand = material["manufacturer"].strip()
    if not brand:
        # 仅识别明确的末尾“缩写(中文品牌)”段，不把任意最后一段猜成厂商。
        m = re.search(r"/\s*([A-Za-z+][A-Za-z+\d -]{0,20}[（(][^()（）]*[\u4e00-\u9fff][^()（）]*[)）])\s*$", spec)
        if m:
            brand = m[1]
    return {
        "rc": rc_value(spec),
        "packages": packages(spec),
        "properties": properties(spec),
        "manufacturer": brand,
        "tokens": [t for t in re.split(r"[\s/(),，（）;；]+", spec) if t],
    }


def same_brand(a: str, b: str) -> bool:
    def aliases(value):
        return {text_key(s) for s in re.split(r"[()（）/]", value) if len(s.strip()) > 1}

    return text_key(a) == text_key(b) or bool(aliases(a) & aliases(b))


def attribute_only_model(model: str) -> bool:
    """封装/额定值/介质不是订货型号，不能仅因它出现在库规格中就直配。"""
    rest = PACKAGE.sub(lambda m: "" if m[1] in KNOWN_PACKAGES else m[0], model)
    rest = NAMED_PACKAGE.sub("", rest)
    for _, pattern in PROPERTIES.values():
        rest = pattern.sub("", rest)
    return bool(model.strip()) and not re.sub(r"[\s/(),，（）;；]+", "", rest)


def identity_matches(model: str, material: dict, evidence: dict, jlc: bool) -> bool:
    key = model_key(model, jlc)
    if (
        not key
        or attribute_only_model(model_identity_text(model, jlc))
        or not re.search(r"[A-Za-z]", model)
        or re.fullmatch(r"[\d.\s]+[A-Za-z]?", model.strip())
    ):
        return False
    if key == model_key(material["spec"], jlc):
        return True
    for token in evidence["tokens"]:
        if key != model_key(token, jlc):
            continue
        # /NOPB、/TR 等订货后缀不是“补充描述”，不能把缺失后缀当相同型号。
        if re.search(re.escape(token) + r"/(?:NOPB|PBF|TR|T|R|LF)(?:$|[/\s])", material["spec"], re.IGNORECASE):
            continue
        return True
    return False


def candidate_findings(item: dict, material: dict, evidence: dict, jlc: bool = False) -> tuple[list[dict], str]:
    f, original, spec = item["fields"], item["original_model"], material["spec"]
    out = []
    primary_rc = rc_value(original)
    identity = not primary_rc and identity_matches(original, material, evidence, jlc)
    library_rc = evidence["rc"]
    if not spec.strip():
        out.append(finding("missing_spec", "model", "型号", original, "", "所选库记录没有规格型号，无法核实对应关系"))
    elif primary_rc:
        if not library_rc:
            out.append(
                finding("unverified_value", "value", "元件值", original, spec, "库规格无法解析出可对照的阻值/容值")
            )
        elif primary_rc[:2] != library_rc[:2]:
            out.append(
                finding(
                    "value_mismatch",
                    "value",
                    "元件值",
                    primary_rc[2],
                    library_rc[2],
                    "阻值/容值不一致，不能用近似搜索结果代替相同物料",
                )
            )
        if unexplained_rc_text(original) and text_key(original) != text_key(spec):
            out.append(
                finding(
                    "unverified_parameters",
                    "model",
                    "其他参数",
                    original,
                    spec,
                    "原规格还包含无法确定等价的参数或后缀，需核实完整要求",
                )
            )
    elif attribute_only_model(model_identity_text(original, jlc)):
        out.append(
            finding(
                "incomplete_model",
                "model",
                "型号",
                original,
                spec,
                "BOM 型号栏只有封装或单个参数，不是完整型号，无法据此确定物料",
            )
        )
    elif not identity:
        out.append(
            finding(
                "model_mismatch",
                "model",
                "型号",
                original,
                spec,
                "原型号未在库规格中完整对应；仅有相似型号或参数候选，不能确定是同一物料",
            )
        )

    value_rc = rc_value(f["value"])
    if primary_rc and value_rc and primary_rc[:2] != value_rc[:2]:
        out.append(
            finding(
                "source_value_conflict",
                "value",
                "元件值 / 型号",
                f"型号：{original}；元件值：{f['value']}",
                spec,
                "BOM 型号栏和元件值栏的阻值/容值不一致，需核实原始输入",
            )
        )
    if value_rc and library_rc and value_rc[:2] != library_rc[:2] and not primary_rc:
        out.append(
            finding(
                "value_mismatch",
                "value",
                "元件值",
                f["value"],
                library_rc[2],
                "型号虽有候选，但 BOM 元件值与库规格中的值不一致",
            )
        )

    bom_package = packages(f["footprint"])
    column_package = packages(material["footprint"])
    library_package = column_package or evidence["packages"]
    library_package_text = material["footprint"] or " / ".join(sorted(evidence["packages"]))
    if column_package and evidence["packages"] and column_package != evidence["packages"]:
        out.append(
            finding(
                "library_package_conflict",
                "footprint",
                "封装",
                f["footprint"],
                f"{material['footprint']}；规格：{spec}",
                "库封装列与库规格互相矛盾",
            )
        )
    elif f["footprint"] and material["footprint"] and text_key(f["footprint"]) == text_key(material["footprint"]):
        pass
    elif bom_package and library_package and bom_package != library_package:
        out.append(
            finding(
                "package_mismatch",
                "footprint",
                "封装",
                f["footprint"],
                library_package_text,
                "封装不一致（已排除常见写法及公英制等价差异）",
            )
        )
    elif material["footprint"] and f["footprint"] and not (bom_package and library_package):
        out.append(
            finding(
                "unverified_package",
                "footprint",
                "封装",
                f["footprint"],
                material["footprint"],
                "封装名称不同，无法确定是同一封装",
            )
        )
    elif primary_rc and not (bom_package and library_package):
        out.append(
            finding(
                "missing_package_evidence",
                "footprint",
                "封装",
                f["footprint"],
                library_package_text,
                "只有阻值/容值不足以确定物料，还缺少可对照的封装依据",
            )
        )

    bom_properties = properties(original)
    for key, values in properties(f["value"]).items():
        bom_properties.setdefault(key, set()).update(values)
    for key, values in properties(f["tolerance"]).items():
        bom_properties.setdefault(key, set()).update(values)
    lib_properties = {k: set(v) for k, v in evidence["properties"].items()}
    for key, values in properties(material["tolerance"]).items():
        lib_properties.setdefault(key, set()).update(values)
    for key, expected in bom_properties.items():
        label = PROPERTIES[key][0]
        actual = lib_properties.get(key, set())
        original_text = "；".join(
            dict.fromkeys(value for value in (original, f["value"], f["tolerance"]) if key in properties(value))
        )
        library_text = "；".join(
            dict.fromkeys(value for value in (spec, material["tolerance"]) if key in properties(value))
        )
        if len(expected) > 1:
            out.append(
                finding(
                    "source_property_conflict", key, label, original_text, library_text, f"BOM 的{label}信息互相矛盾"
                )
            )
        elif actual and expected != actual:
            out.append(
                finding("property_mismatch", key, label, original_text, library_text, f"{label}不一致，不能静默替换")
            )
        elif not actual and not identity:
            out.append(
                finding(
                    "unverified_property",
                    key,
                    label,
                    original_text,
                    "",
                    f"库中缺少可核实的{label}，不能仅凭其他参数放行",
                )
            )
    # 有唯一完整型号时，库未单列可选字段不等于有问题；但双方明确冲突仍须处理。
    brand = evidence["manufacturer"]
    if f["manufacturer"] and brand and not same_brand(f["manufacturer"], brand):
        out.append(
            finding("manufacturer_mismatch", "manufacturer", "厂商", f["manufacturer"], brand, "BOM 与库中的厂商不同")
        )
    elif f["manufacturer"] and not brand and not identity:
        out.append(
            finding(
                "unverified_manufacturer",
                "manufacturer",
                "厂商",
                f["manufacturer"],
                "",
                "只有参数对应，库中没有厂商依据来确认指定物料",
            )
        )
    basis = "完整型号对应，已提供的可对照属性无冲突" if identity else "阻值/容值精确相等，封装和已提供参数一致"
    return out, basis


def source_findings(item: dict) -> list[dict]:
    f = item["fields"]
    out = []
    for issue in item["issues"]:
        if "封装" in issue:
            field, label, value = "footprint", "封装", f["footprint"]
        elif "数量" in issue:
            field, label, value = "qty", "数量 / 位号", f"{f['qty']} / {f['designator']}"
        elif "位号" in issue:
            field, label, value = "designator", "位号", f["designator"]
        elif "DNP" in issue:
            field, label, value = "dnp", "装配标记", f["description"] or f["value"]
        else:
            field, label, value = "model", "型号", item["original_model"]
        out.append(finding("source_issue", field, label, value, "（原始数据检查）", issue))
    return out
