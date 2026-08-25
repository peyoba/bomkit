"""标准中间模型（Canonical Model）。见 docs/02-contracts.md #1。"""
from __future__ import annotations

from dataclasses import dataclass, field


def cell_text(value) -> str:
    """把原始单元格值（rows-JSON 规则下已是字符串或 None）归一化为去空白文本。

    None -> ""。不对字面字符串 "nan" 做特殊处理——rows-JSON 全字符串化后不会
    再产生 "nan"（那是旧版 pandas 的产物，见 docs/05-migration-map.md #3）。
    """
    if value is None:
        return ""
    return str(value).strip()


def is_dnp(description: str, dnp_markers: list[str] | None = None) -> bool:
    """description 命中任一 dnp 标记（大小写不敏感）即为 DNP。见契约 3.1。"""
    markers = dnp_markers or ["DNP"]
    text = cell_text(description).upper()
    return any(marker.upper() in text for marker in markers)


@dataclass
class BomItem:
    """BOM 行（分组合并前后共用）。字段含义见契约 1.1。"""

    designator: str = ""
    qty: float = 0.0
    value: str = ""
    footprint: str = ""
    mpn: str = ""
    manufacturer: str = ""
    description: str = ""
    category: str = ""
    tolerance: str = ""
    dnp: bool = False
    extras: dict = field(default_factory=dict)


@dataclass
class MaterialItem:
    """物料库条目。字段含义见契约 1.2。"""

    code: str = ""
    name: str = ""
    spec: str = ""
    status: str = "enabled"
    category: str = ""
    extras: dict = field(default_factory=dict)

    @property
    def spec_upper(self) -> str:
        return self.spec.upper()

    @property
    def spec_core(self) -> str:
        """规格型号 '/' 前的核心型号段（大写）。用于 Level-2 型号匹配。"""
        return self.spec.split("/")[0].strip().upper()
