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

_ALIAS_CACHE: dict | None = None


def normalize_header(text: str) -> str:
    """Unicode NFKC -> trim -> 连续空白折叠为单个空格 -> 小写。见契约 4.1。"""
    text = unicodedata.normalize("NFKC", text or "")
    text = text.strip()
    text = re.sub(r"\s+", " ", text)
    return text.lower()


def _load_aliases() -> dict[str, list[str]]:
    """加载 aliases/*.json，返回 {field: [normalized_alias, ...]}。"""
    global _ALIAS_CACHE
    if _ALIAS_CACHE is not None:
        return _ALIAS_CACHE

    aliases: dict[str, list[str]] = {}
    try:
        alias_dir = resources.files("bomcore").joinpath("aliases")
        for entry in alias_dir.iterdir():
            if not entry.name.endswith(".json"):
                continue
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
    if not non_empty:
        return True  # 无样本可验证时不降级

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


def guess_columns(rows: list[list[str]], header_row_index: int) -> list[dict]:
    """对表头行的每一列做别名匹配 + 内容验证，返回列猜测结果列表。见契约 5.2、6.1。"""
    aliases = _load_aliases()
    header_row = rows[header_row_index] if header_row_index < len(rows) else []
    data_rows = rows[header_row_index + 1: header_row_index + 21]

    columns = []
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
            # 1) 别名词库精确命中
            for field, words in aliases.items():
                if normalized in words:
                    guess_field = field
                    confidence = "high"
                    break

            # 2) 词库包含式命中
            if guess_field is None:
                for field, words in aliases.items():
                    for word in words:
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

        columns.append({
            "col_index": col_index,
            "source": source,
            "guess_field": guess_field,
            "confidence": confidence,
            "samples": samples[:5],
        })

    return columns


def detect(rows: list[list[str]], kind: str = "bom_input") -> dict:
    """契约 6.1 detect(rows, kind) -> DetectResult。"""
    header_row_index, low_confidence = detect_header_row(rows)
    columns = guess_columns(rows, header_row_index)
    return {
        "header_row_index": header_row_index,
        "low_confidence": low_confidence,
        "columns": columns,
    }
