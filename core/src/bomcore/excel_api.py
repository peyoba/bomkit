"""Excel 优先：保留旧公司分组、候选展开及主表，不设网页审批门禁。"""

from __future__ import annotations

import copy
import io
import json
import re
from collections import Counter, defaultdict
from dataclasses import asdict
from importlib import resources

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

from .grouping import clean_secondary_category, group_and_sort
from .matching import build_material_rc_index, match_device
from .models import BomItem, MaterialItem, cell_text, is_dnp
from .render import (
    FILL_DNP,
    FILL_MATCH,
    FILL_MISSING,
    FILL_MULTI_A,
    FILL_MULTI_B,
    FILL_MULTI_PARAM_A,
    FILL_MULTI_PARAM_B,
    FILL_NON_COMPONENT,
    FILL_NONE,
    FILL_PARAM,
    _resolve_row,
    render,
)
from .lineage import (
    exclude_entries,
    join_previous,
    load_lineage,
    order_items,
    search_reference,
    suggest_near,
)
from .review_export import safe_cell
from .review_import import import_bom, normalize_header, validate_rows
from .review_rules import candidate_findings, material_evidence
from .schema import ProfileError

AMBER = PatternFill("solid", fgColor="FFEB9C", bgColor="FFEB9C")
STATUS_FILLS = {
    "exact": FILL_MATCH,
    "model": FILL_MATCH,
    "substring": AMBER,
    "param": FILL_PARAM,
    "none": FILL_NONE,
    "non_component": FILL_NON_COMPONENT,
}
# 公司规则 v2 行底色（契约 v1.1 附录 A.3）：蓝＝非精确匹配；橙＝未定码/多候选；
# 黄＝数量/位号异常；灰＝DNP/测试点等非贴装；无底色＝精确匹配或编码直查。
FILL_FUZZY = PatternFill("solid", fgColor="DDEBF7", bgColor="DDEBF7")
FILL_UNRESOLVED = PatternFill("solid", fgColor="FCE4D6", bgColor="FCE4D6")
FILL_ANOMALY = PatternFill("solid", fgColor="FFF2CC", bgColor="FFF2CC")
FILL_NON_POP = PatternFill("solid", fgColor="EDEDED", bgColor="EDEDED")
FILL_HELPER = PatternFill("solid", fgColor="EDEDED", bgColor="EDEDED")
_FUZZY_LEVELS = {"model", "substring", "param"}
_REF_LEVEL_MAP = {"位号匹配": "exact", "型号精确匹配": "exact", "型号匹配": "model",
                  "料号匹配": "substring", "参数匹配": "param"}


def row_fill_v2(item: dict, result: dict) -> PatternFill | None:
    """公司规则 v2 的行底色判定（见模块顶部注释）。"""
    fields, match = item["fields"], item["match"]
    if fields.get("anomaly"):
        return FILL_ANOMALY
    if match["level"] in ("multi", "none"):
        return FILL_UNRESOLVED
    if match["level"] == "non_component" or fields.get("dnp"):
        return FILL_NON_POP
    if match["level"] in _FUZZY_LEVELS or (match.get("source") == "reference"):
        return FILL_FUZZY
    return None


def material_input(rows):
    """金蝶完整表，或旧格式的规格→编码/金蝶系统型号字典。"""
    if rows is None:
        return "none", [], {}
    validate_rows(rows)
    for index, row in enumerate(rows[:50]):
        headers = [normalize_header(h) for h in row]

        def column(*names, headers=headers):
            return next((c for c, h in enumerate(headers) if h in names), None)

        code_col = column("编码", "物料编码", "code")
        spec_col = column("规格型号", "spec")
        kind = "kingdee"
        if spec_col is None:
            spec_col = column("规格", "device")
            kind = "legacy"
        if code_col is None or spec_col is None:
            continue
        name_col = column("名称", "物料名称", "name")
        disabled_col = column("禁用状态", "disabled", "status")
        system_col = column("金蝶系统型号", "系统型号")
        materials, lookup = [], {}
        for raw in rows[index + 1 :]:

            def get(col, raw=raw):
                return cell_text(raw[col]) if col is not None and col < len(raw) else ""

            if get(disabled_col).lower() in ("是", "disabled", "true", "1", "yes"):
                continue
            spec, code = get(spec_col), get(code_col)
            if not spec:
                continue
            if kind == "legacy":
                lookup[spec] = {"code": code, "name": "", "spec": get(system_col)}
            else:
                materials.append(MaterialItem(code=code, name=get(name_col), spec=spec))
        return kind, materials, lookup
    raise ProfileError("INVALID_PROFILE", "物料表需包含编码/规格型号，或旧格式的物料编码/规格/金蝶系统型号")


def _empty_match(level):
    return {
        "level": level,
        "status_text": "" if level == "skipped" else "未匹配",
        "confidence": None,
        "candidates": [],
        "selected": 0,
        "manual_code": None,
    }


def _lineage_result(item, prev, ref_entries, kind, materials, rc_index, code_to_material, lookup):
    """谱系匹配：上一版位号联结 → 参考表 → 金蝶级联/旧简易表。返回 (match, note, source)。"""
    device = (item.mpn or item.value).strip()
    notes = []

    def by_material(exclude=""):
        """参考表优先，其次金蝶级联。返回 (match, note, source)。"""
        if ref_entries:
            entries = exclude_entries(ref_entries, exclude)
            hits, level_text = search_reference(item, entries)
            if hits:
                codes = {h.code for h in hits}
                level = _REF_LEVEL_MAP.get(level_text, "model")
                if len(codes) > 1:
                    level = "multi"
                cands = [h.as_candidate() for h in hits]
                srcs = "/".join(sorted({h.source for h in hits if h.source}))
                note = f"【参考表·{level_text}】编码取自 {srcs}"
                if level in ("model", "substring", "param"):
                    note += "，建议人工确认"
                if level == "multi":
                    note += "；候选见底部候选区，请选定"
                return {
                    "level": level, "status_text": f"参考表·{level_text}",
                    "confidence": "high" if level_text in ("位号匹配", "型号精确匹配") else "medium",
                    "candidates": cands,
                }, note, "reference"
        if kind == "none":
            return _empty_match("none"), "未提供金蝶物料表，无法检索系统", ""
        if not device:
            return _empty_match("none"), "系统无匹配，需新建编码", ""
        if kind == "legacy":
            candidate = lookup.get(device.strip())
            result = _empty_match("none")
            if candidate and (candidate["code"] or candidate["spec"]):
                result.update(level="exact", status_text="精确匹配", confidence="high", candidates=[candidate])
                return result, "【精确匹配】旧简易物料表", ""
            return result, "系统无匹配，需新建编码", ""
        result = match_device(
            device, materials, rc_index, name=item.value, footprint=item.footprint, tolerance=item.tolerance,
        )
        tags = {"exact": "精确匹配", "model": "型号匹配", "substring": "料号匹配",
                "param": "参数匹配", "multi": "多候选"}
        if result["level"] in tags:
            note = f"【{tags[result['level']]}】编码取自金蝶物料表"
            if result["level"] in ("model", "substring", "param", "multi"):
                note += "，建议人工确认"
            if result["level"] == "multi":
                note += "；候选见底部候选区，请选定"
            return result, note, ""
        if result["level"] == "none":
            note = "系统无匹配，需新建编码"
            suggestions = suggest_near(item, materials, rc_index)
            if suggestions:
                result["suggestions"] = suggestions
                note += "；备选：" + "；".join(f"{s['code']}[{s['spec']}]" for s in suggestions[:3])
            return result, note, ""
        return result, "", ""

    inherited, split = (join_previous(item, prev) if prev else (None, False))
    if inherited is not None and not split:
        if kind == "kingdee" and code_to_material:
            direct = code_to_material.get(inherited.code)
            if direct is not None:
                return {
                    "level": "exact", "status_text": "编码直查（上一版）", "confidence": "high",
                    "candidates": [{"code": direct.code, "name": direct.name, "spec": direct.spec}],
                }, "【上一版继承】同位号同值，规格按金蝶刷新", "previous"
            dead = inherited.code
            result, note, source = by_material(exclude=dead)
            notes.append(f"原编码{dead}已从金蝶删除")
            if note:
                notes.append(note)
            return result, "；".join(notes), source
        # 没有金蝶表可核验：直接沿用上一版编码与规格
        return {
            "level": "exact", "status_text": "编码直查（上一版）", "confidence": "medium",
            "candidates": [inherited.as_candidate()],
        }, "【上一版继承】未提供金蝶表，沿用上一版规格", "previous"
    if inherited is not None and split:
        notes.append(f"【位号拆分】上一版[{inherited.spec}]与本版[{item.value}]不同，按本版值重新匹配")
        result, note, source = by_material()
        if note:
            notes.append(note)
        return result, "；".join(notes), source
    result, note, source = by_material()
    return result, note, source


def analyze_excel(bom_rows, material_rows=None, platform="auto", previous_rows=None,
                  reference_rows=None, sort_mode="legacy"):
    profile, source, skipped = import_bom(bom_rows, platform)
    kind, materials, lookup = material_input(material_rows)
    prev = load_lineage(previous_rows, source="上一版BOM")
    refs = []
    for i, rows in enumerate(reference_rows or []):
        lineage = load_lineage(rows, source=f"参考表{i + 1}")
        if lineage:
            refs.append(lineage)
    ref_entries = [e for lineage in refs for e in lineage.entries]
    category_order = list(prev.category_order if prev else [])
    for lineage in refs:
        category_order += [c for c in lineage.category_order if c not in category_order]
    company_v2 = sort_mode == "company" or prev is not None or bool(refs)
    raw_groups = defaultdict(list)
    inputs = []
    for row in source:
        f = row["fields"]
        item = BomItem(
            **{
                k: f[k]
                for k in (
                    "value",
                    "designator",
                    "qty",
                    "footprint",
                    "mpn",
                    "manufacturer",
                    "description",
                    "category",
                    "tolerance",
                )
            },
            dnp=is_dnp(f["description"]),
        )
        if profile["platform"] != "jlc" and not item.mpn.strip():
            item.mpn = item.value
        inputs.append(item)
        raw_groups[(item.value, item.footprint, item.dnp)].append(row)
    merged = group_and_sort(inputs)
    rc_index = build_material_rc_index(materials)
    code_to_material = {m.code: m for m in materials if m.code}
    items, stats, cache = [], Counter(), {}
    for row_id, item in enumerate(merged):
        fields = asdict(item)
        device = item.mpn
        key = (device, item.value, item.footprint, item.tolerance, item.designator)
        lineage_mode = prev is not None or bool(ref_entries) or sort_mode == "company"
        if not lineage_mode and key in cache:
            match, note, origin = copy.deepcopy(cache[key])
        elif not lineage_mode:
            # 无谱系输入：保持原有行为（旧工具逐字符搬运路径），仅补充备注文案
            if kind == "none":
                result = _empty_match("skipped")
                note, origin = "", ""
            elif not device:
                result = _empty_match("none")
                note, origin = "系统无匹配，需新建编码", ""
            elif kind == "legacy":
                candidate = lookup.get(device.strip())
                result = _empty_match("none")
                note, origin = "系统无匹配，需新建编码", ""
                if candidate and (candidate["code"] or candidate["spec"]):
                    result.update(level="exact", status_text="精确匹配", confidence="high", candidates=[candidate])
                    note = "【精确匹配】旧简易物料表"
            else:
                result = match_device(
                    device, materials, rc_index, name=item.value, footprint=item.footprint, tolerance=item.tolerance
                )
                tags = {"exact": "精确匹配", "model": "型号匹配", "substring": "料号匹配",
                        "param": "参数匹配", "multi": "多候选"}
                note, origin = "", ""
                if result["level"] in tags:
                    note = f"【{tags[result['level']]}】编码取自金蝶物料表"
                    if result["level"] in ("model", "substring", "param", "multi"):
                        note += "，建议人工确认"
                    if result["level"] == "multi":
                        note += "；候选见底部候选区，请选定"
                elif result["level"] == "none":
                    note = "系统无匹配，需新建编码"
                    suggestions = suggest_near(item, materials, rc_index)
                    if suggestions:
                        result["suggestions"] = suggestions
                        note += "；备选：" + "；".join(f"{s['code']}[{s['spec']}]" for s in suggestions[:3])
            match = copy.deepcopy(result)
            match["source"] = origin
            match.setdefault("suggestions", [])
            cache[key] = (copy.deepcopy(match), note, origin)
        else:
            result, note, origin = _lineage_result(
                item, prev, ref_entries, kind, materials, rc_index, code_to_material, lookup)
            match = copy.deepcopy(result)
            match["source"] = origin
            match.setdefault("suggestions", [])
        match["selected"] = next((i for i, c in enumerate(match["candidates"]) if c["code"].startswith("01.")), 0)
        match["manual_code"] = None
        stats[match["level"]] += 1
        if match.get("source") == "previous":
            stats["previous"] += 1
        elif match.get("source") == "reference":
            stats["reference"] += 1
        if "DNP 不贴装" not in note and item.dnp:
            note = "【DNP 不贴装】" + ("；" + note if note else "")
        elif match["level"] == "non_component" and not note:
            note = "【非物料】测试点/孔位"
        fields["category"] = clean_secondary_category(fields["category"])
        fields["note"] = note
        fields["anomaly"] = False
        n_refs = len({t for t in re.split(r"[,，;；\s]+", fields["designator"]) if t})
        if n_refs and float(fields["qty"] or 0) != n_refs and match["level"] != "non_component":
            fields["anomaly"] = True
            fields["note"] = f"位号{n_refs}个与数量{int(fields['qty'])}不一致，请核对" + ("；" + note if note else "")
        # 原始 BOM 型号（嘉立创 Comment 原文优先，其次 Device/Name），供"核对后删"列使用
        fields["source_text"] = fields["description"] or fields["mpn"] or fields["value"]
        items.append(
            {
                "row_id": row_id,
                "fields": fields,
                "match": match,
                "_sources": raw_groups[(item.value, item.footprint, item.dnp)],
            }
        )
    if company_v2:
        items = order_items(items, category_order)
    return {
        "items": items,
        "profile": profile,
        "skipped": skipped,
        "material_kind": kind,
        "meta_inherit": {
            "pcba_name": prev.pcba_name if prev else "",
            "pcba_model": prev.pcba_model if prev else "",
        },
        "stats": {
            "source_rows": len(source),
            "groups": len(items),
            "quantity": sum(i.qty for i in inputs),
            "material_count": len(lookup) if kind == "legacy" else len(materials),
            "multi": stats["multi"],
            "unmatched": stats["none"],
            "non_component": stats["non_component"],
            "low_confidence": stats["substring"],
            "previous": stats["previous"],
            "reference": stats["reference"],
        },
    }


_V2_COLUMNS = {
    "A": "seq", "B": "code", "C": "material_name", "D": "material_spec",
    "E": "designator", "F": "qty", "G": "footprint", "H": "manufacturer",
    "I": "note", "J": "source_text", "K": "mpn", "L": "description", "M": "match_status",
}
_V2_HEADERS = ["序号", "物料编码", "物料名称", "规格型号（金蝶）", "位号", "数量", "封装", "厂商",
               "备注", "原始BOM型号（核对后删）", "JLC规格", "Description", "匹配状态"]
_V2_WIDTHS = {"A": 9.625, "B": 16, "C": 22.875, "D": 47, "E": 60, "F": 8, "G": 13, "H": 15,
              "I": 16, "J": 30, "K": 14, "L": 20, "M": 14}
_V2_LEGEND = ("备注：🟨 黄行＝数量/位号异常；🟧 橙行＝未定码/多候选（编码格黄底）；"
              "🟦 蓝行＝非精确匹配（型号/参数/参考表，建议人工确认）；"
              "⬜ 灰行＝DNP/测试点等非贴装；无底色＝精确匹配或编码直查。"
              "排序＝按上一版物料类别顺序分组、组内阻容值升序，多候选集中，DNP/测试点最后；"
              "\"原始BOM型号\"列为新版 BOM 原文，核对后整列删除。")


def _company_workbook(items, meta, has_material):
    for item in items:
        fields = item["fields"]
        # Excel单元格上限不是业务行数上限。只在必要时去除位号分隔空格，避免静默截断。
        if len(fields["designator"]) > 32767:
            fields["designator"] = fields["designator"].replace(", ", ",")
        if any(isinstance(v, str) and len(v) > 32767 for v in fields.values()):
            raise ProfileError("INVALID_ROWS", "合并后字段超过Excel单元格32767字符限制，请拆分输入后重试")
    profile = json.loads(resources.files("bomcore").joinpath("presets/default_output_template.json").read_text())
    if not has_material:
        profile["columns"].pop("L")
    workbook = load_workbook(io.BytesIO(render(items, profile, meta)))
    ws = workbook.active
    row_number, multi_group, quantity = 5, 0, 0
    for item in items:
        fields = item["fields"]
        resolved = _resolve_row(item)
        group_fill = None
        if resolved["expand"]:
            a, b = (
                (FILL_MULTI_PARAM_A, FILL_MULTI_PARAM_B)
                if item["match"]["status_text"].startswith("参数匹配")
                else (FILL_MULTI_A, FILL_MULTI_B)
            )
            group_fill = a if multi_group % 2 == 0 else b
            multi_group += 1
        for result in resolved["rows"]:
            # 旧公司备注列是未填写单元格，不写空字符串占位。
            ws.cell(row_number, 9).value = None
            ws.cell(row_number, 9).data_type = "n"
            # 按候选组交替，A-I铺色；单匹配仅状态列着色，恢复旧辅助列及DNP颜色。
            for cell in ws[row_number]:
                cell.fill = PatternFill()
            if group_fill:
                for col in range(1, 10):
                    ws.cell(row_number, col).fill = group_fill
            if has_material:
                fill = group_fill or STATUS_FILLS.get(result["level"])
                if fill:
                    ws.cell(row_number, 12).fill = fill
            if has_material and fields["mpn"] and result["level"] not in ("non_component", "skipped"):
                if not result.get("code"):
                    ws.cell(row_number, 2).fill = FILL_MISSING
                if not result.get("spec"):
                    ws.cell(row_number, 4).fill = FILL_MISSING
            if is_dnp(fields["description"]):
                ws.cell(row_number, 11).fill = FILL_DNP
            quantity += fields["qty"]
            row_number += 1
    return workbook, row_number - 5, quantity


def _selected(match: dict) -> dict:
    """当前选中候选：v2 的行底色与缺码判断都以此为准。"""
    cands = match.get("candidates") or []
    if not cands:
        return {"code": "", "name": "", "spec": "", "level": match.get("level", "none")}
    idx = match.get("selected", 0) or 0
    chosen = dict(cands[idx] if 0 <= idx < len(cands) else cands[0])
    chosen.setdefault("level", match.get("level", "none"))
    return chosen


def _company_workbook_v2(items, meta, has_material):
    """公司规则 v2（契约 v1.1 附录 A）：主表每项一行 + 底部候选区 + 分级行底色。"""
    for item in items:
        fields = item["fields"]
        if len(fields["designator"]) > 32767:
            fields["designator"] = fields["designator"].replace(", ", ",")
        if any(isinstance(v, str) and len(v) > 32767 for v in fields.values()):
            raise ProfileError("INVALID_ROWS", "合并后字段超过Excel单元格32767字符限制，请拆分输入后重试")
        match = item["match"]
        # 多候选项在主表只留推荐编码一行，其余候选进底部候选区（render 依 manual_code 判单行）。
        if match["level"] == "multi" and match["candidates"]:
            match["manual_code"] = match["candidates"][match.get("selected", 0)]["code"]
    profile = json.loads(resources.files("bomcore").joinpath("presets/default_output_template.json").read_text())
    profile["columns"] = dict(_V2_COLUMNS)
    profile["headers"] = list(_V2_HEADERS)
    profile["column_widths"] = dict(_V2_WIDTHS)
    workbook = load_workbook(io.BytesIO(render(items, profile, meta)))
    ws = workbook.active
    total_cols = max(_col_index(c) for c in _V2_COLUMNS)
    row_number, quantity, candidates = 5, 0, []
    for item in items:
        fields, match = item["fields"], item["match"]
        for cell in ws[row_number]:
            cell.fill = PatternFill()
        chosen = _selected(match)
        # 未定码时规格列先填原始型号，避免空着（新建编码后再替换为系统规格）。
        if not chosen.get("spec") and fields.get("source_text"):
            safe_cell(ws, row_number, 4, fields["source_text"])
        fill = row_fill_v2(item, chosen)
        if fill is not None:
            for col in range(1, total_cols + 1):
                ws.cell(row_number, col).fill = fill
        for col in (10, 11, 12):  # 原始BOM型号 / JLC规格 / Description 辅助列灰底
            ws.cell(row_number, col).fill = FILL_HELPER
        if has_material and (fields.get("mpn") or fields.get("value")) \
                and match["level"] not in ("non_component", "skipped") and not chosen.get("code"):
            ws.cell(row_number, 2).fill = FILL_MISSING
        if fields.get("dnp"):
            ws.cell(row_number, 12).fill = FILL_DNP
        ws.cell(row_number, 9).alignment = Alignment(vertical="center", wrap_text=True)
        ws.cell(row_number, 10).alignment = Alignment(vertical="center", wrap_text=True)
        note_len = len(cell_text(fields.get("note")))
        if note_len > 16:
            ws.row_dimensions[row_number].height = 15 * (note_len // 16 + 1)
        if match["level"] == "multi" or match.get("suggestions"):
            candidates.append(item)
        quantity += fields["qty"]
        row_number += 1
    if candidates:
        row_number = _write_candidate_zone(ws, row_number, candidates, total_cols)
    return workbook, row_number - 5, quantity


def _write_candidate_zone(ws, row_number: int, candidates: list[dict], total_cols: int) -> int:
    """底部候选区：多候选待拍板 + 未定码行的备选型号，选用后填回主表并删除本区。"""
    border = Border(left=Side(style="thin"), right=Side(style="thin"),
                    top=Side(style="thin"), bottom=Side(style="thin"))
    ws.merge_cells(start_row=row_number, start_column=1, end_row=row_number, end_column=total_cols)
    title = ws.cell(row_number, 1)
    title.value = ("▼ 候选区：多候选待拍板项，以及未定码项的备选型号（值相同封装不同/近似型号）。"
                   "选用则把编码填入主表对应序号行，再删除本区所有行。")
    title.font = Font(bold=True)
    title.alignment = Alignment(vertical="center", wrap_text=True)
    for col in range(1, total_cols + 1):
        ws.cell(row_number, col).fill = FILL_UNRESOLVED
        ws.cell(row_number, col).border = border
    ws.row_dimensions[row_number].height = 20
    row_number += 1
    for item in candidates:
        fields, match = item["fields"], item["match"]
        seq_no = item["row_id"] + 2
        if match["level"] == "multi":
            cands, tag = list(match["candidates"]), "【候选·待确认】"
        else:
            cands, tag = list(match.get("suggestions") or []), "【备选·未定码】"
        for k, cand in enumerate(cands, 1):
            values = [f"{seq_no}-{k}", cand.get("code", ""), cand.get("name", ""), cand.get("spec", ""),
                      fields.get("designator", ""), fields.get("qty", ""), fields.get("footprint", ""),
                      None, f"{tag}选用则填入主表序{seq_no}，完成后删除本行",
                      fields.get("source_text", ""), fields.get("mpn", ""), fields.get("description", ""),
                      match.get("status_text", "")]
            for col, value in enumerate(values, 1):
                cell = ws.cell(row_number, col)
                if value is None or value == "":
                    cell.value = None
                elif isinstance(value, (int, float)):
                    cell.value = value
                else:
                    safe_cell(ws, row_number, col, value)
                cell.fill = FILL_UNRESOLVED
                cell.border = border
                cell.alignment = Alignment(vertical="center")
            ws.row_dimensions[row_number].height = 15
            row_number += 1
    ws.merge_cells(start_row=row_number, start_column=1, end_row=row_number, end_column=total_cols)
    legend = ws.cell(row_number, 1)
    legend.value = _V2_LEGEND
    legend.font = Font(size=9)
    legend.alignment = Alignment(vertical="center", wrap_text=True)
    ws.row_dimensions[row_number].height = 46
    row_number += 1
    return row_number


def _col_index(letter: str) -> int:
    idx = 0
    for ch in letter:
        idx = idx * 26 + (ord(ch.upper()) - ord("A") + 1)
    return idx


_CONFLICTS = {
    "value_mismatch",
    "package_mismatch",
    "property_mismatch",
    "manufacturer_mismatch",
    "source_value_conflict",
    "source_property_conflict",
    "source_package_conflict",
    "library_package_conflict",
}


def _trace(workbook, analysis, bom_rows):
    raw = workbook.create_sheet("原始输入")
    for nr, row in enumerate(bom_rows, 1):
        for nc, value in enumerate(row, 1):
            safe_cell(raw, nr, nc, value)
    raw.freeze_panes = f"A{analysis['profile']['header_row_index'] + 2}"
    notes = workbook.create_sheet("Excel校对提示")
    for c, title in enumerate(("主表序号", "位号", "请在Excel中处理（不阻断导出）"), 1):
        safe_cell(notes, 1, c, title).font = Font(bold=True)
    notes.column_dimensions["A"].width = 14
    notes.column_dimensions["B"].width = 35
    notes.column_dimensions["C"].width = 100
    nr = 2
    for item in analysis["items"]:
        match, fields = item["match"], item["fields"]
        messages = []
        if match["level"] == "multi":
            messages.append("同组候选已展开；请在Excel保留正确候选、删除其余候选，不能直接将展示数量合计用于采购")
        elif match["level"] == "substring":
            messages.append("低置信度料号匹配，请在Excel核对完整规格；主表状态列按旧工具标为琥珀色")
        elif match["level"] == "param":
            messages.append("参数匹配，请在Excel核对电压、介质、厂商等完整要求")
        elif match["level"] == "none":
            messages.append("未匹配，请在Excel补充或核实物料编码/规格")
        sources = item["_sources"]
        for key, label in (("mpn", "型号"), ("manufacturer", "厂商"), ("tolerance", "精度")):
            values = {r["fields"][key].strip() for r in sources if r["fields"][key].strip()}
            if len(values) > 1:
                messages.append(
                    f"组内{label}不同；主表仍按旧规则合并并取首个非空值，原始输入附表保留全部原值，请在Excel核对是否需拆分"
                )
        if match["level"] != "non_component":
            for source in sources:
                messages.extend(source["issues"])
            if match["candidates"]:
                chosen = match["candidates"][match["selected"]]
                material = {**chosen, "footprint": "", "tolerance": "", "manufacturer": ""}
                evidence = material_evidence(material)
                for source in sources:
                    findings, _ = candidate_findings(
                        source, material, evidence, analysis["profile"]["platform"] == "jlc"
                    )
                    messages.extend(
                        f"{f['reason']}；原值：{f['original']}；库值：{f['library']}"
                        for f in findings
                        if f["code"] in _CONFLICTS
                    )
        if messages:
            text = "；".join(dict.fromkeys(messages))
            if len(text) > 32000:
                text = text[:32000] + "…提示过长，请结合完整原始输入核对"
            for c, value in enumerate((item["row_id"] + 2, fields["designator"], text), 1):
                safe_cell(notes, nr, c, value)
            nr += 1
    if nr == 2:
        safe_cell(notes, nr, 3, "没有额外提示。此文件为转换结果，不代表物料已经工程审批。")
    notes.freeze_panes = "C2"


def convert_excel(args: dict) -> dict:
    """无确认会话的一键转换；Excel编辑是用户明确选择的主工作流。"""
    if not isinstance(args, dict):
        raise ProfileError("INVALID_ROWS", "转换参数必须为对象")
    meta = args.get("meta") or {}
    if not isinstance(meta, dict) or any(not isinstance(v, str) or len(v) > 32767 for v in meta.values()):
        raise ProfileError("INVALID_ROWS", "表头信息必须为有效文本")
    include_trace = args.get("include_trace", False)
    if not isinstance(include_trace, bool):
        raise ProfileError("INVALID_ROWS", "附表选项必须为布尔值")
    previous_rows = args.get("previous_rows")
    reference_rows = args.get("reference_rows") or []
    if previous_rows is not None and not isinstance(previous_rows, list):
        raise ProfileError("INVALID_ROWS", "上一版 BOM 必须为行数组")
    if not isinstance(reference_rows, list):
        raise ProfileError("INVALID_ROWS", "物料参考表必须为行数组列表")
    sort_mode = args.get("sort_mode", "auto")
    if sort_mode not in ("auto", "legacy", "company"):
        raise ProfileError("INVALID_ROWS", "sort_mode 只能是 auto、legacy 或 company")
    if sort_mode == "auto":
        # 给了谱系输入就走公司规则 v2，否则保持旧工具行为（契约 v1.1 A.5）
        sort_mode = "company" if (previous_rows is not None or reference_rows) else "legacy"
    for label, rows in [("上一版 BOM", previous_rows)] + [(f"参考表{i + 1}", r) for i, r in enumerate(reference_rows)]:
        if rows is not None and load_lineage(rows) is None:
            raise ProfileError(
                "INVALID_PROFILE",
                f"{label}不是成品 PCBA BOM：需含 物料编码 / 规格型号 / 位号 表头（请确认选对文件或工作表）",
            )
    analysis = analyze_excel(args.get("bom_rows"), args.get("material_rows"), args.get("platform", "auto"),
                             previous_rows=previous_rows, reference_rows=reference_rows, sort_mode=sort_mode)
    # PCBA 名称/型号未给出时从上一版表头继承（改版时请核对版本号）
    inherit = analysis.get("meta_inherit") or {}
    for key in ("pcba_name", "pcba_model"):
        if not meta.get(key) and inherit.get(key):
            meta = {**meta, key: inherit[key]}
    company_v2 = sort_mode == "company"
    if company_v2:
        workbook, count, quantity = _company_workbook_v2(
            analysis["items"], meta, args.get("material_rows") is not None)
    else:
        workbook, count, quantity = _company_workbook(
            analysis["items"], meta, args.get("material_rows") is not None)
    if include_trace:
        _trace(workbook, analysis, args["bom_rows"])
    output = io.BytesIO()
    workbook.save(output)
    workbook.close()
    return {
        "data": output.getvalue(),
        "stats": {**analysis["stats"], "output_rows": count, "display_quantity": quantity},
        "format": analysis["profile"]["name"],
        "material_format": {"none": "未提供", "kingdee": "金蝶完整物料表", "legacy": "旧简易物料表"}[
            analysis["material_kind"]
        ],
    }
