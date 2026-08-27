"""分组合并 / 排序。去 pandas 重写自旧核心 625-667 行 process_data
及工具函数（956-1035 行 _component_order/_join_designators/_natural_key 等）。
"""
from __future__ import annotations

import re

from .models import BomItem, cell_text

# 元件类型排序表（旧核心 18-47 行 COMPONENT_ORDER），保持可配置入口，默认原值。
COMPONENT_ORDER = {
    "电阻": 1,
    "电容": 2,
    "电感": 3,
    "磁珠": 4,
    "二极管": 5,
    "三极管": 6,
    "MOS管": 7,
    "MOSFET": 7,
    "TVS": 8,
    "ESD": 8,
    "浪涌": 8,
    "保险丝": 9,
    "晶振": 10,
    "芯片": 11,
    "IC": 11,
    "电源": 11,
    "运放": 11,
    "MCU": 11,
    "ADC": 11,
    "DAC": 11,
    "开关": 12,
    "连接器": 13,
    "端子": 13,
    "针座": 13,
    "排针": 13,
    "贴片螺母": 14,
    "螺母": 14,
    "测试点": 15,
}


def natural_key(value: str):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", value)]


def join_designators(values: list[str]) -> str:
    items = [cell_text(v) for v in values]
    items = [item for item in items if item]
    return ", ".join(sorted(items, key=natural_key))


def first_not_empty(values: list[str]) -> str:
    for value in values:
        text = cell_text(value)
        if text:
            return text
    return ""


def join_unique(values: list[str]) -> str:
    seen = []
    for value in values:
        text = cell_text(value)
        if text and text not in seen:
            seen.append(text)
    return "; ".join(seen)


def clean_secondary_category(value: str) -> str:
    return re.sub(r"[（(].*?[）)]", "", cell_text(value)).strip()


def component_order(category: str, order_table: dict | None = None) -> int:
    table = order_table or COMPONENT_ORDER
    text = cell_text(category)
    if not text:
        return 11
    for key, order in table.items():
        if key in text:
            return order
    return 11


def _nan_last_key(text: str) -> tuple:
    """Emulate legacy pandas.groupby(dropna=False) implicit ordering:
    empty values (cell_text normalizes None -> empty string) must sort
    LAST, matching pandas NaN with na_position='last'. Otherwise an
    empty string sorts FIRST as the smallest string, reversing the
    relative order of all uncategorized rows (test points, mounting
    holes, connectors whose Name/Footprint are blank) compared to the
    legacy tool. See docs/05-migration-map.md edge-case addendum.
    """
    return (1, "") if text == "" else (0, text)


def group_and_sort(items: list[BomItem], order_table: dict | None = None) -> list[BomItem]:
    """分组键 (value, footprint, dnp) 三元组；designator 自然排序合并；
    qty 求和；其余字段取首个非空。排序链：非 DNP 优先 -> 有类别优先 ->
    COMPONENT_ORDER -> value 字母序（旧核心 642-663 行）。
    """
    groups: dict[tuple, list[BomItem]] = {}
    for item in items:
        key = (item.value, item.footprint, item.dnp)
        groups.setdefault(key, []).append(item)

    # Legacy core used pandas.groupby(dropna=False), which sorts groups by
    # key BEFORE the later sort_values() call. When that sort ties (same
    # value but different footprint, or several uncategorized rows), the
    # stable sort falls back to this pre-sorted grouping order. Building
    # groups from raw file order and skipping this step made tie-broken
    # output order diverge from the legacy tool on real BOM data, so we
    # replicate the implicit pre-sort here.
    order_keys: list[tuple] = sorted(
        groups.keys(),
        key=lambda k: (_nan_last_key(k[0]), _nan_last_key(k[1]), k[2]),
    )

    merged: list[BomItem] = []
    for key in order_keys:
        rows = groups[key]
        value, footprint, dnp = key
        merged_item = BomItem(
            designator=join_designators([r.designator for r in rows]),
            qty=sum(r.qty for r in rows),
            value=value,
            footprint=footprint,
            mpn=first_not_empty([r.mpn for r in rows]),
            manufacturer=first_not_empty([r.manufacturer for r in rows]),
            description=join_unique([r.description for r in rows]),
            category=first_not_empty([r.category for r in rows]),
            tolerance=first_not_empty([r.tolerance for r in rows]),
            # 与 mpn 同规则：组内首个非空。缺失会导致 analyze 的编码直配
            # 预检在合并后的行上静默失效。
            source_code=first_not_empty([r.source_code for r in rows]),
            dnp=dnp,
            extras={},
        )
        merged.append(merged_item)

    def sort_key(item: BomItem):
        is_empty_category = cell_text(item.category) == ""
        return (
            item.dnp,
            is_empty_category,
            component_order(item.category, order_table),
            _nan_last_key(item.value),
        )

    merged.sort(key=sort_key)
    return merged
