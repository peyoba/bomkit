"""v2 用户模板输出，主表与校对记录分离；不遗留旧 BOM 或扩大数量。"""

from __future__ import annotations

import base64
import copy
import io
import json
import math
import re
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.cell.cell import MergedCell
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from .review_import import check_xlsx_bytes
from .schema import ProfileError

HEADERS = {
    "序号": "seq",
    "名称": "name",
    "物料名称": "name",
    "数量": "qty",
    "位号": "designator",
    "型号": "model",
    "规格型号": "model",
    "封装": "footprint",
    "物料编码": "code",
    "编码": "code",
    "备注": "note",
}
AMBER = PatternFill("solid", fgColor="FFF2CC")
GREEN = PatternFill("solid", fgColor="E2F0D9")
BLUE = PatternFill("solid", fgColor="DDEBF7")


def safe_cell(ws, row: int, col: int, value):
    cell = ws.cell(row, col)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        cell.value = value
    else:
        cell.value = "" if value is None else str(value)
        cell.data_type = "s"  # 包括 = / + / - / @；不让任何输入变成公式。
    return cell


def _header(ws):
    for row in ws.iter_rows(max_row=min(50, ws.max_row)):
        mapping = {}
        for cell in row:
            h = str(cell.value or "").strip()
            field = HEADERS.get(h)
            if re.fullmatch(r"需求\s*\d*|\d+\s*套|批量需求", h):
                field = "batch_qty"
            if field:
                if field in mapping.values():
                    raise ProfileError("BAD_TEMPLATE", "模板关键列重复，请先整理模板")
                mapping[cell.column] = field
        if {"qty", "designator", "model", "footprint"}.issubset(mapping.values()):
            return row[0].row, mapping
    raise ProfileError("BAD_TEMPLATE", "模板需要数量、位号、型号（或规格型号）、封装表头")


def _load_template(template_b64):
    if not template_b64:
        wb = Workbook()
        ws = wb.active
        ws.title = "BOM"
        ws.merge_cells("A1:G1")
        for col, label in enumerate(["序号", "名称", "数量", "位号", "型号", "封装", "物料编码"], 1):
            safe_cell(ws, 2, col, label).font = Font(bold=True)
            ws.column_dimensions[get_column_letter(col)].width = [7, 20, 10, 32, 45, 24, 24][col - 1]
        return wb, ws, 2, {1: "seq", 2: "name", 3: "qty", 4: "designator", 5: "model", 6: "footprint", 7: "code"}
    try:
        data = base64.b64decode(template_b64, validate=True)
        check_xlsx_bytes(data)
        wb = load_workbook(io.BytesIO(data), keep_links=False)
        for ws in wb.worksheets:
            try:
                header, mapping = _header(ws)
                # 只输出已识别的模板页，其他原工作表可能含旧项目数据。
                for other in list(wb.worksheets):
                    if other is not ws:
                        wb.remove(other)
                return wb, ws, header, mapping
            except ProfileError:
                continue
    except Exception as exc:
        raise ProfileError("BAD_TEMPLATE", "输出模板无法读取，请上传有效 XLSX") from exc
    raise ProfileError("BAD_TEMPLATE", "没有找到已支持的中文 BOM 模板表头")


def _audit_sheet(wb, session):
    ws = wb.create_sheet("校对记录")
    headers = [
        "源行",
        "位号",
        "数量",
        "原型号",
        "原始元件值",
        "原封装",
        "原厂商",
        "原精度",
        "所选库编码",
        "所选库名称",
        "所选库规格",
        "最终编码",
        "最终名称",
        "最终型号",
        "最终封装",
        "差异与提示",
        "状态",
        "校对人",
        "确认时间",
        "校对说明",
        "确认历史",
    ]
    for c, h in enumerate(headers, 1):
        safe_cell(ws, 1, c, h).font = Font(bold=True)
        ws.column_dimensions[get_column_letter(c)].width = 22 if c not in (4, 11, 14, 16, 21) else 48
    for nr, item in enumerate(session.items, 2):
        f, final = item["fields"], item["final"]
        candidate = session.by_id.get(item["selected_id"], {})
        confirm = item["confirmation"] or {}
        vals = [
            item["source_row"],
            f["designator"],
            f["qty"],
            item["original_model"],
            f["value"],
            f["footprint"],
            f["manufacturer"],
            f["tolerance"],
            candidate.get("code", ""),
            candidate.get("name", ""),
            candidate.get("spec", ""),
            final["code"],
            final["name"],
            final["model"],
            final["footprint"],
            "；".join(item["differences"]),
            "已人工确认" if item["confirmed"] else "待校对",
            confirm.get("reviewer", ""),
            confirm.get("at", ""),
            item["note"],
            json.dumps(item["history"], ensure_ascii=False),
        ]
        for c, v in enumerate(vals, 1):
            cell = safe_cell(ws, nr, c, v)
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            cell.fill = GREEN if item["confirmed"] else AMBER
    ws.freeze_panes = "D2"
    ws.auto_filter.ref = ws.dimensions
    raw = wb.create_sheet("原始输入")
    for r, values in enumerate(session.raw_rows, 1):
        for c, value in enumerate(values, 1):
            safe_cell(raw, r, c, value)
    raw.freeze_panes = f"A{session.profile['header_row_index'] + 2}"


def export_review(session, template_b64: str | None = None, meta: dict | None = None, mode: str = "draft") -> bytes:
    if mode not in ("draft", "final"):
        raise ProfileError("INVALID_ROWS", "请选择待校对稿或正式输出")
    if mode == "final":
        session.assert_confirmed()
    meta = meta or {}
    try:
        batch = float(meta.get("batch_size", 1))
        if not math.isfinite(batch) or batch <= 0 or not batch.is_integer() or batch > 1000000:
            raise ValueError
        batch = int(batch)
    except (ValueError, TypeError) as exc:
        raise ProfileError("BAD_TEMPLATE", "批次数量必须为 1–1000000 的整数") from exc
    wb, ws, header, mapping = _load_template(template_b64)
    original_max_col = max(ws.max_column, max(mapping))
    body_styles = {c: copy.copy(ws.cell(header + 1, c)._style) for c in range(1, original_max_col + 1)}
    body_height = ws.row_dimensions[header + 1].height or 20
    # 删除样例中的旧明细、公式、签名/页脚、批量说明和数据区合并。
    for merged in list(ws.merged_cells.ranges):
        if merged.max_row > header:
            ws.unmerge_cells(str(merged))
    if ws.max_row > header:
        ws.delete_rows(header + 1, ws.max_row - header)
    for key in list(ws.row_dimensions):
        if key > header:
            del ws.row_dimensions[key]
    ws._images = []
    ws._charts = []
    ws.tables.clear()
    ws.defined_names.clear()
    wb.defined_names.clear()
    ws.data_validations.dataValidation = []
    ws.conditional_formatting._cf_rules.clear()
    # 未映射表头也只保留布局，不继承旧样本的自由文本或项目型号。
    for row in ws.iter_rows(min_row=1, max_row=header):
        for cell in row:
            if isinstance(cell, MergedCell):
                continue
            cell.comment = None
            cell.hyperlink = None
            if cell.row < header or cell.column not in mapping or cell.data_type == "f":
                cell.value = None
    name = str(meta.get("title") or Path(session.source_name or "BOM").stem)
    status = "待校对稿 · 不可用于投产" if mode == "draft" else "已人工确认"
    title = f"{name} — {status}"
    if header > 1:
        cell = safe_cell(ws, 1, 1, title)
        cell.font = Font(name="Microsoft YaHei", size=14, bold=True)
        ws.row_dimensions[1].height = max(ws.row_dimensions[1].height or 20, 26)
    ws.title = "待校对BOM" if mode == "draft" else "已确认BOM"
    # 模板只有表头（无标题行）时加一个状态列，不改其既有列顺序。
    status_col = original_max_col + 1
    safe_cell(ws, header, status_col, "校对状态").font = Font(bold=True)
    ws.column_dimensions[get_column_letter(status_col)].width = 25
    for c, field in mapping.items():
        if field == "batch_qty":
            safe_cell(ws, header, c, f"需求（{batch}套）")
    border = Border(*(Side(style="thin", color="D9D9D9") for _ in range(4)))
    for seq, item in enumerate(session.items, 1):
        r = header + seq
        fields, final = item["fields"], item["final"]
        values = {
            **final,
            "seq": seq,
            "qty": fields["qty"],
            "designator": fields["designator"],
            "batch_qty": fields["qty"] * batch,
            "note": item["note"],
        }
        for c in range(1, original_max_col + 1):
            cell = safe_cell(ws, r, c, values.get(mapping.get(c), ""))
            cell._style = copy.copy(body_styles[c])
            cell.alignment = Alignment(vertical="center", wrap_text=True)
            if not cell.border.bottom.style:
                cell.border = border
        state = "已人工确认" if item["confirmed"] else "待校对（不可投产）"
        safe_cell(ws, r, status_col, state).fill = GREEN if item["confirmed"] else AMBER
        if not item["confirmed"]:
            for c, field in mapping.items():
                if field in ("model", "code", "footprint"):
                    ws.cell(r, c).fill = AMBER
        ws.row_dimensions[r].height = max(body_height, 20 * (1 + len(fields["designator"]) // 55))
    ws.freeze_panes = f"A{header + 1}"
    ws.auto_filter.ref = f"A{header}:{get_column_letter(status_col)}{header + len(session.items)}"
    ws.print_area = f"A1:{get_column_letter(status_col)}{header + len(session.items)}"
    ws.print_title_rows = f"1:{header}"
    ws.oddHeader.center.text = title
    ws.oddFooter.center.text = "第 &P / &N 页"
    # 模板打印页眉页脚也可能携带旧项目字段，除本次标题/页码外不继承。
    for name in ("oddHeader", "evenHeader", "firstHeader", "oddFooter", "evenFooter", "firstFooter"):
        section = getattr(ws, name)
        for side in ("left", "center", "right"):
            if (name, side) not in (("oddHeader", "center"), ("oddFooter", "center")):
                getattr(section, side).text = None
    _audit_sheet(wb, session)
    output = io.BytesIO()
    wb.save(output)
    return output.getvalue()
