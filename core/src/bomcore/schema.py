"""字段注册表 + Profile 校验（schema_version）。见 docs/02-contracts.md #3。"""
from __future__ import annotations

SCHEMA_VERSION = 1

# 中间模型字段注册表：kind -> 字段列表（含是否必填）
BOM_FIELDS = [
    "designator", "qty", "value", "footprint", "mpn",
    "manufacturer", "description", "category", "tolerance",
]
BOM_REQUIRED_FIELDS = ["designator", "qty", "value", "footprint"]

MATERIAL_FIELDS = ["code", "name", "spec", "status", "category"]
MATERIAL_REQUIRED_FIELDS = ["code", "spec"]

PROFILE_KINDS = ("bom_input", "material_input", "output_template")


class ProfileError(ValueError):
    """Profile 结构或必填字段校验失败。message 面向最终用户，可直接展示。"""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def validate_input_profile(profile: dict) -> None:
    """校验 bom_input / material_input Profile 的基本结构与必填字段覆盖。

    契约 1.3：BOM 必须映射 designator/qty/value/footprint；
    物料库必须映射 code/spec。
    """
    if not isinstance(profile, dict):
        raise ProfileError("INVALID_PROFILE", "Profile 格式错误：应为对象")

    kind = profile.get("kind")
    if kind not in ("bom_input", "material_input"):
        raise ProfileError("INVALID_PROFILE", f"未知的 Profile kind: {kind}")

    column_map = profile.get("column_map") or {}
    mapped_fields = set(column_map.values())

    required = BOM_REQUIRED_FIELDS if kind == "bom_input" else MATERIAL_REQUIRED_FIELDS
    missing = [f for f in required if f not in mapped_fields]
    if missing:
        label = "BOM" if kind == "bom_input" else "物料库"
        raise ProfileError(
            "MISSING_REQUIRED_FIELD",
            f"{label} 映射缺少必填字段: {', '.join(missing)}",
        )


def validate_output_template(profile: dict) -> None:
    """校验 output_template Profile 的基本结构。"""
    if not isinstance(profile, dict):
        raise ProfileError("BAD_TEMPLATE", "输出模板格式错误：应为对象")
    if profile.get("kind") != "output_template":
        raise ProfileError("BAD_TEMPLATE", "输出模板 kind 不正确")
    if "columns" not in profile or not isinstance(profile["columns"], dict):
        raise ProfileError("BAD_TEMPLATE", "输出模板缺少 columns 定义")
    if "data_start_row" not in profile:
        raise ProfileError("BAD_TEMPLATE", "输出模板缺少 data_start_row")
