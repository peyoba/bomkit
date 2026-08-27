"""表头行探测 + 列名猜测（词库 + 内容验证 + 置信度）。见 docs/02-contracts.md #5。

TS 与 Python 双实现必须遵守同一定义，共享测试用例
(core/tests/fixtures/detect_cases.json)。
"""
from __future__ import annotations

import json
import re
import unicodedata
from importlib import resources

from .models import cell_text
from .schema import BOM_FIELDS, MATERIAL_FIELDS

_ALIAS_CACHE: dict | None = None

# kind -> 该类输入允许映射的字段集合（与 schema.py 字段注册表一致）。
# 真实故障：detect 一直接收 kind 却没用它——BOM 表里天然同名/近名的
# "物料编码/物料名称/规格型号" 列被猜成物料库侧的 code/name/spec 字段，
# 这些字段在 BomItem 解析时被静默丢弃，用户看到"料号全空、编码提取不出"。
_KIND_ALLOWED = {
    "bom_input": frozenset(BOM_FIELDS),
    "material_input": frozenset(MATERIAL_FIELDS),
}


def normalize_header(text: str) -> str:
    """Unicode NFKC -> trim -> 连续空白折叠为单个空格 -> 小写。见契约 4.1。"""
    text = unicodedata.normalize("NFKC", text or "")
    text = text.strip()
    text = re.sub(r"\s+", " ", text)
    return text.lower()


def _load_aliases() -> dict[str, list[str]]:
    """加载 aliases/*.json，返回 {field: [normalized_alias, ...]}。

    dict 按 field 名字母序构建：真实故障中"物料名称"这一列名同时是 value
    与 name 两个词库的别名，谁先被遍历到谁赢。两个运行时（Py/TS）与不同
    操作系统的文件枚举顺序都可能不同，必须显式排序保证双端同判。
    """
    global _ALIAS_CACHE
    if _ALIAS_CACHE is not None:
        return _ALIAS_CACHE

    aliases: dict[str, list[str]] = {}
    try:
        alias_dir = resources.files("bomcore").joinpath("aliases")
        entries = sorted(
            (e for e in alias_dir.iterdir() if e.name.endswith(".json")),
            key=lambda e: e.name,
        )
        for entry in entries:
            data = json.loads(entry.read_text(encoding="utf-8"))
            field = data["field"]
            aliases[field] = [normalize_header(a) for a in data.get("aliases", [])]
    except (FileNotFoundError, ModuleNotFoundError):
        pass
    _ALIAS_CACHE = aliases
    return aliases


def detect_header_row(rows: list[list[str]]) -> tuple[int, bool]:
    """扫描前 10 行，返回 (header_row_index, low_confidence)。见契约 5.1。

    score = 非空单元格数 x 1 + 命中别名词库的单元格数 x 3，且要求该行下方
    至少 1 行数据。取最高分行；平分取最靠上。全部为 0 分 -> 第 0 行 + low_confidence。
    """
    aliases = _load_aliases()
    all_aliases = set()
    for words in aliases.values():
        all_aliases.update(words)

    best_row = 0
    best_score = -1
    scan_limit = min(10, len(rows))
    for i in range(scan_limit):
        if i + 1 >= len(rows):
            break  # 要求该行下方至少 1 行数据
        row = rows[i]
        score = 0
        for cell in row:
            text = cell_text(cell)
            if not text:
                continue
            score += 1
            if normalize_header(text) in all_aliases:
                score += 3
        if score > best_score:
            best_score = score
            best_row = i

    low_confidence = best_score <= 0
    if low_confidence:
        best_row = 0
    return best_row, low_confidence


_VALIDATORS = {
    "designator": re.compile(r"^[A-Za-z]{1,4}\d+(\s*,\s*[A-Za-z]{1,4}\d+)*$"),
    "code": re.compile(r"^[0-9][0-9.\-]*$"),
}


def _validate_samples(field: str, samples: list[str]) -> bool:
    """内容验证：候选列取前 20 个非空样本做正则/数值验证。见契约 5.2 第 3 条。"""
    non_empty = [s for s in samples if cell_text(s)]
    # 关键：只有当该字段本身没有内容验证规则（如 name/status 这类自由文本字段）时，
    # 样本全空才视为“无需验证、维持猜测结果”。对于有验证规则的字段（qty/designator/code），
    # 样本全空恰恰是最可疑的情况——真实故障复现过：物料表“编码”列前 20 行样本恰好全为空
    # （如尚未编号的新规格），此时旧逻辑直接判定 high 置信度放行，用户在界面上看到绿色
    # “high”标签会直接确认映射，导致后续所有匹配成功的物料行编码栏全部为空且无法察觉。
    # 现在对这种情况一律降级返回 False（外层调用处把 confidence 降为 low），提醒用户核查。
    if not non_empty:
        return field != "qty" and field not in _VALIDATORS

    if field == "qty":
        ok = 0
        for s in non_empty:
            try:
                float(str(s).replace(",", ""))
                ok += 1
            except ValueError:
                pass
        return ok / len(non_empty) >= 0.9

    validator = _VALIDATORS.get(field)
    if validator is None:
        return True

    ok = sum(1 for s in non_empty if validator.match(cell_text(s)))
    threshold = 0.6
    return ok / len(non_empty) >= threshold


def _looks_like_value_samples(samples: list[str]) -> bool:
    """value 字段专属内容校验。

    子串命中"值"的列名五花八门：真实用户表里出现"物料名称"（内容是
    主控板/贴片电阻这类中文大类描述）也会经"名称 ⊂ 物料名称"被猜成 value。
    元件值应是短 token（10kΩ、100nF、STM32F103C8T6 等），本函数按
    "非空样本多数不含 CJK 且长度有限"判定；不满足的精确/子串命中一律
    视为未猜出（调用处回退该列为未映射）。完全不影响英制表头
    （Value/Comment 之类）与纯数值样本场景。

    样本窗口全空时不做裁决（返回 True，维持猜测）：与其他自由文本字段
    同一信任策略——没有内容证据时不下结论。
    """
    non_empty = [cell_text(s) for s in samples if cell_text(s)]
    if not non_empty:
        return True
    cjk = re.compile(r"[\u4e00-\u9fff]")
    good = sum(
        1
        for s in non_empty
        if not cjk.search(s) and len(s) <= 32
    )
    return good / len(non_empty) >= 0.6


def guess_columns(
    rows: list[list[str]],
    header_row_index: int,
    allowed_fields: frozenset | set | None = None,
) -> list[dict]:
    """对表头行的每一列做别名匹配 + 内容验证，返回列猜测结果列表。见契约 5.2、6.1。

    allowed_fields：本 kind 允许映射的字段集合（None 表示不限制，测试用）。
    同名字段多列竞争时"先到先得、按置信度分级裁决"：real-world 表头常有
    "编码 + 旧物料编码" 这类新旧并存的列，旧实现两列都猜成 code，下游按
    列序覆盖后正式编码被旧编码静默替换。这里改为分三轮（high/medium/low）
    裁决且每个字段只认领一次，输掉的列保持未映射，交由用户在界面确认。
    """
    aliases = _load_aliases()
    header_row = rows[header_row_index] if header_row_index < len(rows) else []
    data_rows = rows[header_row_index + 1: header_row_index + 21]

    # 先为每列独立求候选 (field, confidence)，再做全局字段认领裁决。
    candidates = []
    for col_index, raw_header in enumerate(header_row):
        source = cell_text(raw_header)
        normalized = normalize_header(source)
        samples = [
            cell_text(r[col_index]) if col_index < len(r) else ""
            for r in data_rows
        ]
        samples = [s for s in samples if s][:20]

        guess_field = None
        confidence = None

        if normalized:
            # 1) 别名词库精确命中；field 字母序保证双端一致
            for field in sorted(aliases):
                if normalized in aliases[field]:
                    guess_field = field
                    confidence = "high"
                    break

            # 2) 词库包含式命中
            if guess_field is None:
                for field in sorted(aliases):
                    for word in aliases[field]:
                        if len(word) < 2:
                            continue
                        if word in normalized or normalized in word:
                            guess_field = field
                            confidence = "medium"
                            break
                    if guess_field:
                        break

        # 3) 内容验证修正
        if guess_field and not _validate_samples(guess_field, samples):
            confidence = "low"

        # 4) value 字段内容校验：样本不像元件值（中文大类描述等）则整个
        #    放弃猜测——value 的错认领会挤掉真正的值列并污染分组键。
        if guess_field == "value" and not _looks_like_value_samples(samples):
            guess_field = None
            confidence = None

        # 5) kind 字段域过滤：不属于该类输入的猜测一律视为未猜出，
        #    让源列落入 extras 透传而不是被解析器静默丢弃。
        if guess_field is not None and allowed_fields is not None and guess_field not in allowed_fields:
            guess_field = None
            confidence = None

        candidates.append({
            "col_index": col_index,
            "source": source,
            "guess_field": guess_field,
            "confidence": confidence,
            "samples": samples[:5],
        })

    # 认领裁决：按置信度分级、列序先到先得，每个字段只认领一列。
    winners: set[int] = set()
    claimed_fields: set[str] = set()
    for tier in ("high", "medium", "low"):
        for col in candidates:
            field = col["guess_field"]
            if field is None or col["confidence"] != tier or field in claimed_fields:
                continue
            claimed_fields.add(field)
            winners.add(col["col_index"])

    # 认领失败的列回退为未映射（保留样本与原列名供用户手动指定）。
    for col in candidates:
        if col["guess_field"] is not None and col["col_index"] not in winners:
            col["guess_field"] = None
        if col["guess_field"] is None:
            col["confidence"] = None

    return candidates


def detect(rows: list[list[str]], kind: str = "bom_input") -> dict:
    """契约 6.1 detect(rows, kind) -> DetectResult。"""
    header_row_index, low_confidence = detect_header_row(rows)
    columns = guess_columns(rows, header_row_index, _KIND_ALLOWED.get(kind))
    return {
        "header_row_index": header_row_index,
        "low_confidence": low_confidence,
        "columns": columns,
    }
