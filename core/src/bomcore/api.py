"""稳定门面：detect()/analyze()/render()。CLI 与 Pyodide Worker 共用。
接口输入输出严格符合 docs/02-contracts.md 第 5/6 节。
"""
from __future__ import annotations

from . import detect as detect_mod
from . import render as render_mod
from .grouping import group_and_sort
from .matching import DEFAULT_MATCH_CONFIG, build_material_rc_index, match_device
from .models import BomItem, MaterialItem, cell_text, is_dnp
from .schema import ProfileError, validate_input_profile


def detect(rows: list[list[str]], kind: str = "bom_input") -> dict:
    """契约 6.1。"""
    return detect_mod.detect(rows, kind)


def _rows_to_bom_items(rows: list[list[str]], profile: dict) -> list[BomItem]:
    header_row_index = profile.get("header_row_index", 0)
    column_map = profile.get("column_map") or {}
    options = profile.get("options") or {}
    dnp_markers = options.get("dnp_markers", ["DNP"])

    if header_row_index >= len(rows):
        return []
    header = [cell_text(h) for h in rows[header_row_index]]
    # 源列名（trim 后）-> 中间模型字段
    col_to_field: dict[int, str] = {}
    for col_idx, source_name in enumerate(header):
        field_id = column_map.get(source_name)
        if field_id:
            col_to_field[col_idx] = field_id

    items = []
    for raw_row in rows[header_row_index + 1:]:
        if not any(cell_text(c) for c in raw_row):
            continue  # 跳过空行
        values: dict[str, str] = {}
        extras: dict[str, str] = {}
        for col_idx, cell in enumerate(raw_row):
            text = cell_text(cell)
            source_name = header[col_idx] if col_idx < len(header) else f"col_{col_idx}"
            field_id = col_to_field.get(col_idx)
            if field_id:
                # 同一字段被映射到多列时首列非空值生效，后面的列不再覆盖。
                # 真实故障：表头新旧编码列并存且都被指到 code，末列覆盖后
                # 正式编码被旧编码静默替换。检测层已去重，这里兜底用户手动
                # 在界面上把两列拖到同一字段的情况。
                if field_id not in values or not values[field_id]:
                    values[field_id] = text
            elif text:
                extras[source_name] = text

        qty_raw = values.get("qty", "")
        try:
            qty = float(qty_raw.replace(",", "")) if qty_raw else 0.0
        except ValueError:
            raise ProfileError(
                "INVALID_ROWS",
                f"数量(Quantity)包含非数字值: {qty_raw!r}",
            )

        description = values.get("description", "")
        item = BomItem(
            designator=values.get("designator", ""),
            qty=qty,
            value=values.get("value", ""),
            footprint=values.get("footprint", ""),
            mpn=values.get("mpn", ""),
            manufacturer=values.get("manufacturer", ""),
            description=description,
            category=values.get("category", ""),
            tolerance=values.get("tolerance", ""),
            # 兼容旧版 Profile：detect 尚未按 kind 过滤时，BOM 的"物料编码"
            # 列会被存成 column_map["物料编码"]="code"；读回时转成 source_code。
            source_code=(values.get("source_code") or values.get("code") or "").strip(),
            dnp=is_dnp(description, dnp_markers),
            extras=extras,
        )
        items.append(item)
    return items


_DISABLED_STATUS_MARKERS = {"是", "disabled", "true", "1", "yes"}


def _normalize_material_status(raw: str) -> str:
    """把源列原始值（如金蝶'禁用状态'列的'是'/'否'）归一化为 enabled/disabled。

    契约 1.2："禁用状态=是 -> disabled"。空值或未识别的值一律视为 enabled
    （保守默认：不无端丢弃物料条目）。
    """
    text = cell_text(raw).strip().lower()
    if not text:
        return "enabled"
    if text in _DISABLED_STATUS_MARKERS:
        return "disabled"
    if text in ("enabled", "否", "no", "0"):
        return "enabled"
    return "enabled"


def _rows_to_material_items(rows: list[list[str]], profile: dict) -> list[MaterialItem]:
    header_row_index = profile.get("header_row_index", 0)
    column_map = profile.get("column_map") or {}
    options = profile.get("options") or {}
    skip_disabled = options.get("skip_disabled", True)

    if header_row_index >= len(rows):
        return []
    header = [cell_text(h) for h in rows[header_row_index]]
    col_to_field: dict[int, str] = {}
    for col_idx, source_name in enumerate(header):
        field_id = column_map.get(source_name)
        if field_id:
            col_to_field[col_idx] = field_id

    items = []
    for raw_row in rows[header_row_index + 1:]:
        if not any(cell_text(c) for c in raw_row):
            continue
        values: dict[str, str] = {}
        extras: dict[str, str] = {}
        for col_idx, cell in enumerate(raw_row):
            text = cell_text(cell)
            source_name = header[col_idx] if col_idx < len(header) else f"col_{col_idx}"
            field_id = col_to_field.get(col_idx)
            if field_id:
                # 同字段多列映射时首列非空生效（与 _rows_to_bom_items 一致）。
                if field_id not in values or not values[field_id]:
                    values[field_id] = text
            elif text:
                extras[source_name] = text

        if not values.get("spec"):
            continue  # 契约 1.2: spec 是匹配主键，缺失则该条目无意义
        status = _normalize_material_status(values.get("status", ""))
        if skip_disabled and status == "disabled":
            continue

        items.append(MaterialItem(
            code=values.get("code", ""),
            name=values.get("name", ""),
            spec=values.get("spec", ""),
            status=status or "enabled",
            category=values.get("category", ""),
            extras=extras,
        ))
    return items


def analyze(
    bom_rows: list[list[str]],
    material_rows: list[list[str]] | None,
    bom_profile: dict,
    material_profile: dict | None,
    match_config: dict | None = None,
) -> dict:
    """契约 6.2。material_rows/material_profile 可为 None（跳过匹配）。"""
    validate_input_profile(bom_profile)
    bom_items = _rows_to_bom_items(bom_rows, bom_profile)

    material_items: list[MaterialItem] = []
    if material_rows is not None and material_profile is not None:
        validate_input_profile(material_profile)
        material_items = _rows_to_material_items(material_rows, material_profile)

    order_table = None  # 使用 grouping.COMPONENT_ORDER 默认值
    merged = group_and_sort(bom_items, order_table)

    cfg = match_config or DEFAULT_MATCH_CONFIG
    rc_index = build_material_rc_index(material_items) if material_items else []
    # 编码直配索引：源 BOM 已带企业编码的行跳过级联匹配直接查库。
    code_to_material = {m.code: m for m in material_items if m.code}

    items = []
    stats = {
        "total": 0, "matched": 0, "low_confidence": 0, "param": 0,
        "multi": 0, "unmatched": 0, "non_component": 0,
    }

    for row_id, bom_item in enumerate(merged):
        fields = {
            "designator": bom_item.designator,
            "qty": bom_item.qty,
            "value": bom_item.value,
            "footprint": bom_item.footprint,
            "mpn": bom_item.mpn,
            "manufacturer": bom_item.manufacturer,
            "description": bom_item.description,
            "category": bom_item.category,
            "tolerance": bom_item.tolerance,
            "dnp": bom_item.dnp,
        }

        if not material_items:
            match_result = {
                "level": "skipped", "status_text": "", "confidence": None,
                "code": "", "name": "", "spec": "", "candidates": [],
            }
        else:
            source_code = (bom_item.source_code or "").strip()
            direct = code_to_material.get(source_code) if source_code else None
            if direct is not None:
                # 源编码与物料库 code 精确相等：最可信的一级，无需清洗与子串试探。
                match_result = {
                    "level": "exact", "status_text": "编码直配", "confidence": "high",
                    "code": direct.code, "name": direct.name, "spec": direct.spec,
                    "candidates": [{"code": direct.code, "name": direct.name, "spec": direct.spec}],
                }
            else:
                # 立创EDA 等导出格式没有独立型号列，完整料号直接放在值(Name)列。此时
                # mpn 映射后为空，若以此为由跳过匹配，真实用户数据会整表未匹配（实测
                # 74 行无一命中，尽管物料库存在可直接子串命中的条目）。回退用 value
                # 作匹配主键；两者皆空时 match_device 的 try_upper 空串跳过逻辑自然
                # 退化为"未匹配"，行为与旧实现一致。
                device = bom_item.mpn.strip() or bom_item.value.strip()
                match_result = match_device(
                    device, material_items, rc_index,
                    name=bom_item.value, footprint=bom_item.footprint,
                    tolerance=bom_item.tolerance, match_config=cfg,
                )

        level = match_result["level"]
        candidates = match_result["candidates"]
        selected = 0
        if level == "multi" and candidates:
            priority_prefix = cfg.get("candidate_priority_prefix", "01.")
            for i, c in enumerate(candidates):
                if c["code"].startswith(priority_prefix):
                    selected = i
                    break

        items.append({
            "row_id": row_id,
            "fields": fields,
            "match": {
                "level": level,
                "status_text": match_result["status_text"],
                "confidence": match_result["confidence"],
                "candidates": candidates,
                "selected": selected,
                "manual_code": None,
            },
        })

        stats["total"] += 1
        if level in ("exact", "model"):
            stats["matched"] += 1
        elif level == "substring":
            stats["low_confidence"] += 1
        elif level == "param":
            stats["param"] += 1
        elif level == "multi":
            stats["multi"] += 1
        elif level == "none":
            stats["unmatched"] += 1
        elif level == "non_component":
            stats["non_component"] += 1

    return {"items": items, "stats": stats}


def render(final_items: list[dict], output_profile: dict, meta: dict | None = None) -> bytes:
    """契约 6.3。"""
    return render_mod.render(final_items, output_profile, meta)
