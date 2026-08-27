"""字段注册表 + Profile 校验（schema_version）。见 docs/02-contracts.md #3。"""
from __future__ import annotations

SCHEMA_VERSION = 1

# 中间模型字段注册表：kind -> 字段列表（含是否必填）
BOM_FIELDS = [
    "designator", "qty", "value", "footprint", "mpn",
    "manufacturer", "description", "category", "tolerance",
    # 源 BOM 自带的企业物料编码（如二次转换的表里已有公司编码列）。
    # 不参与分组键/输出字段白名单，仅在 analyze 里做"编码直配"预检
    # （源编码 == 物料库某条目的 code 时直接命中，跳过级联匹配）。
    "source_code",
]
BOM_REQUIRED_FIELDS = ["designator", "qty", "value", "footprint"]

MATERIAL_FIELDS = ["code", "name", "spec", "status", "category"]
MATERIAL_REQUIRED_FIELDS = ["code", "spec"]

PROFILE_KINDS = ("bom_input", "material_input", "output_template")


class ProfileError(ValueError):
    """Profile 结构或必填字段校验失败。message 面向最终用户，可直接展示。"""

    def __init__(self, code: str, message: str):
        # __str__ 编码前缀 "[CODE] message" 是 Pyodide Worker 侧 Python↔JS
        # 异常桥接的唯一可靠信息通道：Pyodide 把 Python 异常包装为 PythonError
        # 时只保留 str(exception)，不传递 self.code 属性（PyProxy 语义），所以
        # 前端要恢复契约 6.4 的 {code, message} 结构，必须能从纯文本里解析出
        # code。不要去掉这个前缀（web/src/workers/pyodide.worker.ts 依赖它）。
        super().__init__(f"[{code}] {message}")
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
