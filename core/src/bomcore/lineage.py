"""谱系匹配：上一版 BOM（按位号继承编码）与物料参考表（按型号/参数查编码）。

2026-11 新增（契约 v1.1，见 docs/02-contracts.md 附录 A）。两种输入都是"成品 PCBA BOM"
（含 物料编码 / 物料名称 / 规格型号 / 位号 / 封装 列），用同一套加载器：

- previous（上一版）：同板改版时编码继承的主要来源——封装一致 + 位号交集 + 值一致才信任。
- reference（参考表，可多份）：不看位号，按 型号（精确/核心段/子串+封装守卫）或
  阻容参数（值 → 封装 → 公差 级联收窄）直接查编码与规格；用于全新板卡/不同板卡复用已批料。

匹配优先级（excel_api.analyze_excel）：上一版位号联结 → 参考表 → 金蝶物料库级联匹配。
"""
from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field

from .matching import is_specific_substring_match
from .models import BomItem, MaterialItem, cell_text
from .parse_rc import (
    extract_package,
    normalize_package,
    normalize_tolerance,
    parse_bom_rc_value,
    parse_material_rc_params,
    rc_values_equal,
)

_DESIGNATOR_SPLIT = re.compile(r"[,，;；\s]+")


def _norm(text) -> str:
    return re.sub(r"\s+", "", cell_text(text)).upper()


def split_designators(text) -> set[str]:
    return {t for t in _DESIGNATOR_SPLIT.split(cell_text(text)) if t}


@dataclass
class LineageEntry:
    code: str = ""
    name: str = ""
    spec: str = ""
    footprint: str = ""
    manufacturer: str = ""
    designators: set = field(default_factory=set)
    source: str = ""  # 来源文件名（参考表多份时用于标注）

    @property
    def spec_upper(self) -> str:
        return self.spec.upper()

    @property
    def spec_core(self) -> str:
        return self.spec.split("/")[0].strip().upper()

    def as_candidate(self) -> dict:
        return {"code": self.code, "name": self.name, "spec": self.spec}


@dataclass
class Lineage:
    entries: list[LineageEntry] = field(default_factory=list)
    category_order: list[str] = field(default_factory=list)  # 物料名称首次出现顺序
    pcba_name: str = ""
    pcba_model: str = ""
    source: str = ""


_HEADER_ALIASES = {
    "code": ("物料编码", "编码", "code"),
    "name": ("物料名称", "名称", "name"),
    "spec": ("规格型号（金蝶）", "规格型号", "规格", "spec"),
    "designator": ("位号", "designator"),
    "footprint": ("封装", "footprint"),
    "manufacturer": ("厂商", "制造商", "manufacturer"),
}


def _find_header(rows: list[list[str]]):
    """在前 30 行里找同时含 物料编码/规格型号/位号 的表头行，返回 (行号, {字段: 列号})。"""
    for index, row in enumerate(rows[:30]):
        headers = [_norm(h) for h in row]
        cols = {}
        for field_id, aliases in _HEADER_ALIASES.items():
            for col, header in enumerate(headers):
                if not header:
                    continue
                hit = header in aliases or (
                    field_id == "spec" and "规格型号" in header
                ) or (field_id == "code" and header.endswith("物料编码"))
                if hit:
                    cols[field_id] = col
                    break
        if {"code", "spec", "designator"} <= cols.keys():
            return index, cols
    return None, None


def load_lineage(rows: list[list[str]] | None, source: str = "") -> Lineage | None:
    """把一份成品 PCBA BOM 加载为谱系表。表头不符返回 None。"""
    if not rows:
        return None
    header_index, cols = _find_header(rows)
    if header_index is None:
        return None

    def get(row, key):
        col = cols.get(key)
        return cell_text(row[col]) if col is not None and col < len(row) else ""

    lineage = Lineage(source=source)
    index_by_code: dict[str, LineageEntry] = {}
    for raw in rows[header_index + 1:]:
        code, spec, designators = get(raw, "code"), get(raw, "spec"), get(raw, "designator")
        if not code or not re.search(r"\d", code) or not spec:
            continue  # PCB 空板行 / 待回填行 / 候选区 / 备注行
        name = get(raw, "name")
        if name and name not in lineage.category_order:
            lineage.category_order.append(name)
        if code in index_by_code:  # 同编码多行（DNP/非 DNP）合并位号
            index_by_code[code].designators |= split_designators(designators)
            continue
        entry = LineageEntry(
            code=code, name=name, spec=spec, footprint=get(raw, "footprint"),
            manufacturer=get(raw, "manufacturer"), designators=split_designators(designators),
            source=source,
        )
        index_by_code[code] = entry
        lineage.entries.append(entry)

    # 表头元信息：定位"PCBA名称"标签右侧单元格（通常在第 2 行）
    for row in rows[:6]:
        cells = [cell_text(c) for c in row]
        for col, text in enumerate(cells):
            if text == "PCBA名称" and col + 1 < len(cells):
                lineage.pcba_name = cells[col + 1]
                for col2 in range(col + 2, len(cells)):
                    if cells[col2] == "PCBA型号" and col2 + 1 < len(cells):
                        lineage.pcba_model = cells[col2 + 1]
                        break
                break
        if lineage.pcba_name:
            break
    return lineage


# ───────────────────────── 值等价 / 封装冲突 ─────────────────────────

def _rc_of_material(spec: str, name: str):
    return parse_material_rc_params(spec, name)


def _rc_of_bom(value: str, footprint: str):
    comp_type, rc_value = parse_bom_rc_value(value, footprint)
    return (comp_type, rc_value) if comp_type is not None else None


def values_equal(spec: str, name: str, value: str, footprint: str = "") -> bool:
    """成品 BOM 规格串 与 新版 BOM 元件值是否等价。

    阻容统一换算比较（0.047uF=47nF、10R=10Ω、499 裸值按电阻封装解析）；
    非阻容按归一化文本比较（如 SN74LVC1G3157DBVR/SOT-23-6 与同名器件）。
    """
    rc_material = _rc_of_material(spec, name)
    rc_bom = _rc_of_bom(value, footprint)
    if rc_material and rc_bom:
        return rc_material["type"] == rc_bom[0] and rc_values_equal(rc_material["value"], rc_bom[1])
    if rc_material or rc_bom:
        return False
    return _norm(spec) == _norm(value) and bool(_norm(value))


def package_conflict(spec: str, footprint: str) -> bool:
    """规格串里明确写了阻容封装尺寸、且与 BOM 封装尺寸不一致 → True（如 1812 配 0603）。
    规格里没有可识别尺寸时不判冲突（保留软过滤语义）。"""
    want = normalize_package(extract_package(footprint))
    if not want:
        return False
    have = {normalize_package(m.group(1)) for m in re.finditer(r"(?<!\d)(\d{4})(?!\d)", spec)}
    have = {p for p in have if p}
    return bool(have) and want not in have


def _prefer(entries: list[LineageEntry]) -> list[LineageEntry]:
    return sorted(entries, key=lambda e: (0 if e.code.startswith("01.") else 1, e.code))


# ───────────────────────── 上一版：按位号联结 ─────────────────────────

def join_previous(item: BomItem, lineage: Lineage) -> tuple[LineageEntry | None, bool]:
    """封装一致的前提下，按 (值等价, 位号交集数) 打分联结上一版。返回 (最佳行, 是否位号拆分)。

    位号拆分：联结到的旧行值与本行不同，且旧行位号并未全部落在本行里——说明同位号改了值，
    旧编码不可信，调用方应按本版新值重新检索。
    """
    refs = split_designators(item.designator)
    best, best_score = None, (0, 0)
    for entry in lineage.entries:
        if entry.footprint != item.footprint:
            continue
        inter = len(entry.designators & refs)
        if inter == 0:
            continue  # 上一版按位号联结：位号没有交集就不能算同一行（同值不同位号交给参考表）
        equal = 1 if values_equal(entry.spec, entry.name, item.value, item.footprint) else 0
        score = (equal, inter)
        if score > best_score:
            best, best_score = entry, score
    if best is None:
        return None, False
    equal = values_equal(best.spec, best.name, item.value, item.footprint)
    if equal:
        return best, False
    # 值确实变了（两边都能解析出阻容值）→ 位号拆分：同位号换了值，旧编码不可信。
    rc_new_type, rc_new_value = parse_bom_rc_value(item.value, item.footprint)
    rc_old = parse_material_rc_params(best.spec, best.name)
    if rc_new_type is not None and rc_old is not None and rc_old["type"] == rc_new_type:
        return best, True
    # 纯文本差异：旧行位号仍完整包含在本行里，视为分组变化而非改值。
    contained = bool(best.designators) and best.designators <= refs
    return best, not contained


# ───────────────────────── 参考表：按型号 / 参数 ─────────────────────────

def search_reference(
    item: BomItem,
    entries: list[LineageEntry],
    exclude_code: str = "",
    min_len: int = 6,
) -> tuple[list[LineageEntry], str]:
    """在参考表中级联检索，返回 (命中条目, 级别文字)。

    R0 位号交集 + 值一致 + 封装一致 → R1 型号精确 / 核心段 / 子串（子串需封装守卫）
    → R2 阻容参数（值 → 封装 → 公差 级联收窄；规格明确写了别的封装尺寸则排除）。
    """
    refs = split_designators(item.designator)
    device = (item.mpn or item.value).strip()
    pkg = normalize_package(extract_package(item.footprint))

    # R0 位号匹配（同板改版最可靠）
    hits = [e for e in entries
            if refs and (e.designators & refs) and e.footprint == item.footprint
            and values_equal(e.spec, e.name, item.value, item.footprint)]
    if hits:
        return _prefer(_dedup(hits)), "位号匹配"

    du = _norm(device)
    if len(du) >= 4:
        hits = _dedup([e for e in entries if e.spec_upper == du])
        if hits:
            return _prefer(hits), "型号精确匹配"
        hits = _dedup([e for e in entries if e.spec_core == du])
        if hits:
            return _prefer(hits), "型号匹配"
        if len(du) >= min_len:
            hits = _dedup([
                e for e in entries
                if is_specific_substring_match(du, e.spec_upper, min_len)
                and (not pkg or not package_conflict(e.spec, item.footprint))
            ])
            if hits:
                return _prefer(hits), "料号匹配"

    # R2 阻容参数匹配
    bom_type, bom_value = parse_bom_rc_value(item.value, item.footprint)
    if bom_type is not None:
        stage = []
        for e in entries:
            rc = parse_material_rc_params(e.spec, e.name)
            if rc and rc["type"] == bom_type and rc_values_equal(rc["value"], bom_value) \
                    and not package_conflict(e.spec, item.footprint):
                stage.append(e)
        if stage:
            stage = _dedup(stage)
            if pkg:
                pk = [e for e in stage
                      if normalize_package(extract_package(e.footprint) or _pkg_in_spec(e.spec)) == pkg]
                stage = pk or stage
            tol = normalize_tolerance(item.tolerance)
            if tol:
                th = [e for e in stage if normalize_tolerance(_tol_in_spec(e.spec)) == tol]
                stage = th or stage
            return _prefer(stage), "参数匹配"
    return [], ""


def _pkg_in_spec(spec: str):
    for m in re.finditer(r"(?<!\d)(\d{4})(?!\d)", spec):
        return m.group(1)
    return None


def _tol_in_spec(spec: str):
    m = re.search(r"±?\s*(\d+(?:\.\d+)?)\s*%", spec)
    return m.group(0) if m else ""


def _dedup(entries: list[LineageEntry]) -> list[LineageEntry]:
    seen, out = set(), []
    for e in entries:
        if e.code and e.code not in seen:
            seen.add(e.code)
            out.append(e)
    return out


def exclude_entries(entries: list[LineageEntry], code: str) -> list[LineageEntry]:
    return [e for e in entries if e.code != code] if code else entries


# ───────────────────────── 备选型号（未匹配行参考） ─────────────────────────

def suggest_near(item: BomItem, materials: list[MaterialItem], rc_index: list[dict],
                 limit: int = 4) -> list[dict]:
    """未匹配时的备选：阻容 → 同值但封装/公差不同的料；其他 → 型号相似度最接近的系统规格。"""
    out: list[dict] = []
    bom_type, bom_value = parse_bom_rc_value(item.value, item.footprint)
    if bom_type is not None:
        for e in rc_index:
            if e.get("rc_type") == bom_type and rc_values_equal(e["rc_value"], bom_value):
                out.append({"code": e["code"], "name": e["name"], "spec": e["spec"]})
    else:
        du = _norm(item.mpn or item.value)
        if len(du) >= 6:
            cores: dict[str, dict] = {}
            for m in materials:
                cores.setdefault(m.spec_core, {"code": m.code, "name": m.name, "spec": m.spec})
            for key in difflib.get_close_matches(du, list(cores.keys()), n=3, cutoff=0.75):
                out.append(cores[key])
    return _prefer_candidates(out)[:limit]


def _prefer_candidates(cands: list[dict]) -> list[dict]:
    return sorted(cands, key=lambda c: (0 if str(c.get("code", "")).startswith("01.") else 1, str(c.get("code"))))


# ───────────────────────── 排序（公司规则 v2） ─────────────────────────

FUZZY_KEYS = ("料号匹配", "型号匹配", "参数匹配", "预处理匹配", "参考表", "位号拆分", "暂配", "建议人工确认")


def item_tier(item: dict) -> int:
    """0 正常排序（含需新建/模糊匹配，靠备注与颜色标注）→ 1 多候选待拍板 → 2 DNP/测试点等非贴装，集中放最后。"""
    fields, match = item.get("fields", {}), item.get("match", {})
    note = cell_text(fields.get("note"))
    if match.get("level") == "non_component" or fields.get("dnp") or "DNP" in note or "非物料" in note:
        return 2
    if match.get("level") == "multi":
        return 1
    return 0


def item_value(item: dict):
    fields = item.get("fields", {})
    return parse_bom_rc_value(cell_text(fields.get("value")), cell_text(fields.get("footprint")))[1]


def order_items(items: list[dict], category_order: list[str] | None = None,
                fallback_order=None) -> list[dict]:
    """按类别顺序分组（上一版/参考表物料名称首次出现顺序，其次内置表），组内阻容值升序，
    非数值件保持原顺序；多候选项集中；DNP/测试点最后。返回新列表并重排 row_id。"""
    from .grouping import component_order  # 延迟导入避免循环

    order = {c: i for i, c in enumerate(category_order or [])}
    unknown = len(order)
    for idx, item in enumerate(items):
        item["_src"] = idx
        name = cell_text(item.get("match", {}).get("candidates") and
                         item["match"]["candidates"][item["match"].get("selected", 0)]["name"]
                         or item.get("fields", {}).get("category"))
        if name and name not in order:
            order[name] = unknown
            unknown += 1

    def key(item: dict):
        match = item.get("match", {})
        cands = match.get("candidates") or []
        name = cell_text(cands[match.get("selected", 0)]["name"] if cands else "") \
            or cell_text(item.get("fields", {}).get("category"))
        if name in order:
            cat = order[name]
        else:
            cat = unknown + component_order(name, fallback_order)
        value = item_value(item)
        return (item_tier(item), cat, 0 if value is not None else 1, value if value is not None else 0,
                item["_src"])

    ordered = sorted(items, key=key)
    for i, item in enumerate(ordered):
        item["row_id"] = i
    return ordered
