"""v2 校对会话。推荐不等于确认；导出只读取 Worker 内的受控会话。"""

from __future__ import annotations

import copy
import hashlib
import json
from collections import defaultdict

from .matching import build_material_rc_index, match_device
from .models import MaterialItem
from .review_import import detect_input, import_bom, normalize_header, validate_rows
from .schema import ProfileError


def _fingerprint(value) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def import_materials(rows: list[list[str]] | None) -> tuple[list[dict], dict]:
    if rows is None:
        return [], {"total": 0, "enabled": 0, "disabled": 0, "missing_spec": 0, "duplicate_codes": 0}
    validate_rows(rows)
    aliases = {
        "编码": "code",
        "物料编码": "code",
        "code": "code",
        "名称": "name",
        "物料名称": "name",
        "name": "name",
        "规格型号": "spec",
        "spec": "spec",
        "禁用状态": "disabled",
        "disabled": "disabled",
        "封装": "footprint",
        "footprint": "footprint",
        "精度": "tolerance",
        "tolerance": "tolerance",
        "厂商": "manufacturer",
        "manufacturer": "manufacturer",
    }
    index = None
    columns = {}
    for i, row in enumerate(rows[:50]):
        mapping = {}
        for c, h in enumerate(row):
            field = aliases.get(normalize_header(h))
            if field and field not in mapping.values():
                mapping[c] = field
        if {"code", "spec"}.issubset(mapping.values()):
            index, columns = i, mapping
            break
    if index is None:
        raise ProfileError("INVALID_PROFILE", "物料表需要编码、规格型号列（支持金蝶导出表）")
    items, codes = [], defaultdict(int)
    stats = {"total": 0, "enabled": 0, "disabled": 0, "missing_spec": 0, "duplicate_codes": 0}
    for i, row in enumerate(rows[index + 1 :], index + 1):
        if not any(v.strip() for v in row):
            continue
        d = {f: row[c] if c < len(row) else "" for c, f in columns.items()}
        stats["total"] += 1
        if d.get("disabled", "").strip().lower() in ("是", "yes", "true", "1", "disabled"):
            stats["disabled"] += 1
            continue
        if not d.get("code", "").strip():
            continue
        code = d["code"]  # 编码按文本原样保留；不截前导零或换大小写。
        spec = d.get("spec", "")
        stats["missing_spec"] += not bool(spec.strip())
        codes[code] += 1
        items.append(
            {
                "id": f"m{i + 1}",
                "source_row": i + 1,
                "code": code,
                "name": d.get("name", ""),
                "spec": spec,
                "footprint": d.get("footprint", ""),
                "tolerance": d.get("tolerance", ""),
                "manufacturer": d.get("manufacturer", ""),
            }
        )
    stats["enabled"] = len(items)
    stats["duplicate_codes"] = sum(v > 1 for v in codes.values())
    if not items:
        raise ProfileError("INVALID_ROWS", "物料表没有带编码的可用记录，请检查禁用状态和所选工作表")
    return items, stats


class ReviewSession:
    def __init__(
        self,
        bom_rows: list[list[str]],
        material_rows: list[list[str]] | None,
        platform: str = "auto",
        source_name: str = "",
        sheet_name: str = "",
    ):
        self.profile, self.items, self.skipped_rows = import_bom(bom_rows, platform)
        self.raw_rows = copy.deepcopy(bom_rows)
        self.source_name = source_name
        self.sheet_name = sheet_name
        self.materials, self.material_stats = import_materials(material_rows)
        self.by_id = {m["id"]: m for m in self.materials}
        self.by_signature = defaultdict(list)
        for m in self.materials:
            self.by_signature[(m["code"], m["name"], m["spec"])].append(m)
        self.material_fingerprint = _fingerprint(self.materials)
        materials = [
            MaterialItem(code=m["code"], name=m["name"], spec=m["spec"]) for m in self.materials if m["spec"].strip()
        ]
        rc_index = build_material_rc_index(materials)
        cache = {}
        for item in self.items:
            f = item["fields"]
            key = (item["original_model"], f["value"], f["footprint"], f["tolerance"])
            if key not in cache:
                result = match_device(key[0], materials, rc_index, name=key[1], footprint=key[2], tolerance=key[3])
                # 库器件名未命中时才尝试原始值；每次匹配只作为建议，不覆盖原文。
                if not result["candidates"] and f["mpn"].strip() and f["value"].strip():
                    result = match_device(
                        f["value"],
                        materials,
                        rc_index,
                        name=f["value"],
                        footprint=f["footprint"],
                        tolerance=f["tolerance"],
                    )
                cache[key] = result
            result = cache[key]
            candidates = []
            for c in result["candidates"]:
                candidates.extend(self.by_signature[(c["code"], c["name"], c["spec"])])
            candidates = list({c["id"]: c for c in candidates}.values())
            candidates.sort(key=lambda c: (not c["code"].startswith("01."), c["code"], c["id"]))
            item.update(
                {
                    "candidates": copy.deepcopy(candidates[:50]),
                    "candidate_count": len(candidates),
                    "match_level": result["level"] if self.materials else "skipped",
                    "match_label": result["status_text"] if self.materials else "未提供物料库",
                    "selected_id": candidates[0]["id"] if candidates else None,
                    "final": self._suggested_final(item, candidates[0] if candidates else None),
                    "note": "",
                    "confirmed": False,
                    "confirmation": None,
                    "history": [],
                }
            )
            self._refresh(item)

    def _get(self, row_id: int) -> dict:
        if type(row_id) is not int or not 0 <= row_id < len(self.items):
            raise ProfileError("INVALID_ROWS", "校对行不存在")
        return self.items[row_id]

    @staticmethod
    def _suggested_final(item: dict, candidate: dict | None) -> dict:
        f = item["fields"]
        return {
            "code": candidate["code"] if candidate else "",
            "name": candidate["name"] if candidate else f["category"],
            "model": candidate["spec"] if candidate else item["original_model"],
            "footprint": f["footprint"],
        }

    def _signature(self, item: dict) -> str:
        return _fingerprint(
            {
                "source": item["source"],
                "fields": item["fields"],
                "selected": item["selected_id"],
                "final": item["final"],
                "note": item["note"],
                "material": self.material_fingerprint,
            }
        )

    def _refresh(self, item: dict) -> None:
        candidate = self.by_id.get(item["selected_id"])
        item["selected_material"] = copy.deepcopy(candidate)
        differences = list(item["issues"])
        if candidate is None:
            differences.append("尚未关联企业物料，需人工确认保留原型号或手动校对")
        else:
            if item["original_model"] != candidate["spec"]:
                differences.append("BOM 原型号与库规格原文不同（含空格/大小写差异）")
            f = item["fields"]
            if f["value"] and f["value"] != item["original_model"] and f["value"] != candidate["spec"]:
                differences.append("BOM 另有原始元件值/参数，与型号列不同，请对照库规格核对")
            for field, label in (("footprint", "封装"), ("tolerance", "精度"), ("manufacturer", "厂商")):
                original, library = f.get(field, ""), candidate.get(field, "")
                if original and library and original != library:
                    differences.append(f"{label}原文不同")
                elif original and not library:
                    differences.append(f"库中无独立{label}字段，请结合规格原文核对")
                elif library and not original:
                    differences.append(f"BOM 缺少{label}而库中有值，不自动补入")
            if item["candidate_count"] > 1:
                differences.append("存在多个推荐候选，必须明确选择")
        final = item["final"]
        if final["model"] != item["original_model"]:
            differences.append("最终型号不同于 BOM 原型号")
        if final["footprint"] != item["fields"]["footprint"]:
            differences.append("最终封装不同于 BOM 原封装")
        if candidate and (
            final["code"] != candidate["code"]
            or final["model"] != candidate["spec"]
            or final["name"] != candidate["name"]
            or (candidate["footprint"] and final["footprint"] != candidate["footprint"])
        ):
            differences.append("最终值经过手动校对，与所选库记录不同")
        item["differences"] = list(dict.fromkeys(differences))
        if item["confirmed"] and item["confirmation"]["fingerprint"] != self._signature(item):
            item["confirmed"] = False
            item["confirmation"] = None

    def update(self, row_id: int, patch: dict) -> dict:
        item = self._get(row_id)
        if not isinstance(patch, dict) or set(patch) - {"selected_id", "final", "note"}:
            raise ProfileError("INVALID_ROWS", "只能修改候选、最终值和校对说明")
        # 先在副本校验，错误请求不能留下部分写入。
        updated = copy.deepcopy(item)
        if "selected_id" in patch:
            selected = patch["selected_id"]
            if selected is not None and (not isinstance(selected, str) or selected not in self.by_id):
                raise ProfileError("INVALID_ROWS", "物料候选已失效，请重新搜索")
            updated["selected_id"] = selected
            updated["final"] = self._suggested_final(updated, self.by_id.get(selected))
        if "final" in patch:
            final_patch = patch["final"]
            if not isinstance(final_patch, dict) or set(final_patch) - {"code", "name", "model", "footprint"}:
                raise ProfileError("INVALID_ROWS", "最终字段不正确")
            for field, value in final_patch.items():
                if not isinstance(value, str) or len(value) > 32767:
                    raise ProfileError("INVALID_ROWS", "最终值必须是有效文本")
                updated["final"][field] = value
        if "note" in patch:
            if not isinstance(patch["note"], str) or len(patch["note"]) > 2000:
                raise ProfileError("INVALID_ROWS", "校对说明不得超过 2000 字符")
            updated["note"] = patch["note"]
        updated["confirmed"] = False
        updated["confirmation"] = None
        self._refresh(updated)
        self.items[row_id] = updated
        return copy.deepcopy(updated)

    def confirm(self, row_id: int, reviewer: str, note: str | None = None) -> dict:
        from datetime import datetime, timezone

        item = self._get(row_id)
        if not isinstance(reviewer, str) or not reviewer.strip() or len(reviewer) > 100:
            raise ProfileError("CONFIRMATION_REQUIRED", "请填写校对人")
        if note is not None:
            self.update(row_id, {"note": note})
            item = self._get(row_id)
        if not item["final"]["model"].strip():
            raise ProfileError("CONFIRMATION_REQUIRED", "请填写最终型号，不能确认空型号")
        incomplete = (
            not item["final"]["code"].strip()
            or not item["final"]["footprint"].strip()
            or item["selected_id"] is None
            or bool(item["issues"])
        )
        if incomplete and not item["note"].strip():
            raise ProfileError("CONFIRMATION_REQUIRED", "存在缺失信息或原始数据异常，请填写校对/保留原因")
        self._refresh(item)
        confirmation = {
            "reviewer": reviewer.strip(),
            "at": datetime.now(timezone.utc).isoformat(),
            "fingerprint": self._signature(item),
        }
        item["confirmed"] = True
        item["confirmation"] = confirmation
        item["history"].append(
            {
                **confirmation,
                "selected_id": item["selected_id"],
                "final": copy.deepcopy(item["final"]),
                "note": item["note"],
            }
        )
        return copy.deepcopy(item)

    def invalidate(self, row_id: int) -> dict:
        return self.update(row_id, {})

    def assert_confirmed(self) -> None:
        for item in self.items:
            self._refresh(item)
        pending = sum(not i["confirmed"] for i in self.items)
        if pending:
            raise ProfileError("CONFIRMATION_REQUIRED", f"还有 {pending} 行未确认，只能导出待校对稿")

    def search(self, query: str, limit: int = 30) -> dict:
        if not isinstance(query, str) or not query.strip():
            return {"items": [], "total": 0}
        limit = max(1, min(100, int(limit)))
        tokens = query.strip().casefold().split()
        results = [
            m
            for m in self.materials
            if all(t in (m["code"] + " " + m["name"] + " " + m["spec"]).casefold() for t in tokens)
        ]
        results.sort(key=lambda m: (m["code"].casefold() != query.strip().casefold(), m["code"]))
        return {"items": copy.deepcopy(results[:limit]), "total": len(results)}

    def snapshot(self) -> dict:
        return {
            "schema_version": 2,
            "profile": self.profile,
            "source_name": self.source_name,
            "sheet_name": self.sheet_name,
            "items": copy.deepcopy(self.items),
            "material_stats": self.material_stats,
            "skipped_rows": self.skipped_rows,
            "stats": {
                "rows": len(self.items),
                "quantity": sum(i["fields"]["qty"] for i in self.items),
                "confirmed": sum(i["confirmed"] for i in self.items),
                "pending": sum(not i["confirmed"] for i in self.items),
            },
        }


_session: ReviewSession | None = None


def dispatch(action: str, args: dict):
    """Worker 唯一 v2 入口；禁止由主线程直接提交‘已确认’行绕过会话校验。"""
    global _session
    if action == "detect":
        return detect_input(args["rows"], args.get("platform", "auto"))
    if action == "start":
        _session = None
        _session = ReviewSession(
            args["bom_rows"],
            args.get("material_rows"),
            args.get("platform", "auto"),
            args.get("source_name", ""),
            args.get("sheet_name", ""),
        )
        return _session.snapshot()
    if action == "clear":
        _session = None
        return {}
    if _session is None:
        raise ProfileError("INVALID_ROWS", "会话已失效，请重新导入")
    if action == "update":
        return _session.update(args["row_id"], args["patch"])
    if action == "confirm":
        return _session.confirm(args["row_id"], args.get("reviewer", ""), args.get("note"))
    if action == "revoke":
        return _session.invalidate(args["row_id"])
    if action == "search":
        return _session.search(args.get("query", ""))
    if action == "snapshot":
        return _session.snapshot()
    if action == "export":
        from .review_export import export_review

        return export_review(_session, args.get("template_b64"), args.get("meta") or {}, args.get("mode", "draft"))
    raise ProfileError("INVALID_ROWS", "未知的校对操作")
