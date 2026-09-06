"""v2 校对会话。推荐不等于确认；导出只读取 Worker 内的受控会话。"""

from __future__ import annotations

import copy
import hashlib
import json
from collections import defaultdict

from .matching import build_material_rc_index, match_device
from .models import MaterialItem
from .review_import import detect_input, import_bom, normalize_header, validate_rows
from .review_rules import candidate_findings, finding, material_evidence, model_key, rc_value, source_findings
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
        self.by_model = defaultdict(list)
        self.by_rc = defaultdict(list)
        self.evidence = {}
        code_signatures = defaultdict(set)
        self.jlc = self.profile["platform"] == "jlc"
        for m in self.materials:
            self.by_signature[(m["code"], m["name"], m["spec"])].append(m)
            evidence = material_evidence(m)
            self.evidence[m["id"]] = evidence
            for key in {model_key(t, self.jlc) for t in [m["spec"], *evidence["tokens"]]}:
                if key:
                    self.by_model[key].append(m)
            if evidence["rc"]:
                self.by_rc[evidence["rc"][:2]].append(m)
            code_signatures[m["code"]].add(tuple(m[k] for k in ("name", "spec", "footprint", "tolerance", "manufacturer")))
        self.conflicting_codes = {code for code, signatures in code_signatures.items() if len(signatures) > 1}
        self.qualified = {}
        self.possible = {}
        self.material_fingerprint = _fingerprint(self.materials)
        materials = [
            MaterialItem(code=m["code"], name=m["name"], spec=m["spec"]) for m in self.materials if m["spec"].strip()
        ]
        rc_index = build_material_rc_index(materials)
        cache = {}
        for item in self.items:
            f = item["fields"]
            key = (item["original_model"], f["value"], f["footprint"], f["tolerance"], f["manufacturer"])
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
            # 搜索只提供线索。另以完整型号/精确数值查全候选，避免 v1 软过滤
            # 漏掉正确封装，或把第一个高排名候选误认为“唯一正确”。
            primary_rc = rc_value(item["original_model"])
            strong_pool = (
                self.by_rc.get(primary_rc[:2], []) if primary_rc
                else self.by_model.get(model_key(item["original_model"], self.jlc), [])
            )
            candidates.extend(strong_pool)
            candidates = list({c["id"]: c for c in candidates}.values())
            # 同编码且各属性完全相同的重复导出行不制造人工选择任务。
            candidates = list({tuple(c[k] for k in ("code", "name", "spec", "footprint", "tolerance", "manufacturer")): c for c in candidates}.values())
            assessments = {c["id"]: self._candidate_findings(item, c) for c in candidates}
            candidates.sort(key=lambda c: (len(assessments[c["id"]][0]), not c["code"].startswith("01."), c["code"], c["id"]))
            qualified = [c["id"] for c in candidates if not assessments[c["id"]][0]]
            self.qualified[item["row_id"]] = qualified
            contradictions = {"model_mismatch", "value_mismatch", "package_mismatch", "property_mismatch", "manufacturer_mismatch"}
            self.possible[item["row_id"]] = [
                c["id"] for c in candidates
                if not any(p["code"] in contradictions for p in assessments[c["id"]][0])
            ]
            item.update(
                {
                    "candidates": copy.deepcopy(candidates[:50]),
                    "candidate_count": len(candidates),
                    "qualified_count": len(qualified),
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

    def _candidate_findings(self, item: dict, candidate: dict) -> tuple[list[dict], str]:
        problems, basis = candidate_findings(item, candidate, self.evidence[candidate["id"]], self.jlc)
        if candidate["code"] in self.conflicting_codes:
            problems.append(finding(
                "duplicate_code", "code", "物料编码", item["fields"]["source_code"],
                candidate["code"], "同一库编码对应不同规格或属性，需先确定使用哪条记录",
            ))
        return problems, basis

    def _refresh(self, item: dict) -> None:
        candidate = self.by_id.get(item["selected_id"])
        item["selected_material"] = copy.deepcopy(candidate)
        problems = source_findings(item)
        basis = ""
        if candidate is None:
            problems.append(finding(
                "unmatched", "model", "物料对应关系", item["original_model"], "",
                "未找到可确定对应的库记录，需选料或说明保留原文的原因",
            ))
        else:
            checks, basis = self._candidate_findings(item, candidate)
            problems.extend(checks)
            qualified = self.qualified[item["row_id"]]
            possible = self.possible[item["row_id"]]
            if len(possible) > 1:
                codes = [self.by_id[c]["code"] for c in possible]
                reason = (
                    f"有 {len(qualified)} 条库记录同样符合现有信息，尚不能唯一确定编码"
                    if len(qualified) == len(possible)
                    else f"还有信息不完整的候选不能排除，共 {len(possible)} 条可能记录，尚不能唯一确定编码"
                )
                problems.append(finding(
                    "ambiguous", "code", "候选编码", item["original_model"],
                    " / ".join(codes[:8]) + (" …" if len(codes) > 8 else ""),
                    reason,
                ))
            elif not checks and candidate["id"] not in qualified:
                problems.append(finding(
                    "unverified_selection", "code", "手选物料", item["original_model"], candidate["code"],
                    "手选记录不在已唯一核实的候选范围内，需确认本次选择",
                ))
        suggested = self._suggested_final(item, candidate)
        for field, label in (("code", "编码"), ("name", "名称"), ("model", "型号"), ("footprint", "封装")):
            # 人工输出改动与自动补全分开；不再笼统重复“最终型号不同于原型号”。
            if item["final"][field] != suggested[field]:
                original = {
                    "model": item["original_model"], "code": item["fields"]["source_code"],
                    "name": item["fields"]["category"], "footprint": item["fields"]["footprint"],
                }[field]
                problems.append(finding(
                    "edited_final", field, f"最终{label}", original, suggested[field],
                    f"最终{label}已手动改为其他值，需确认本次输出", item["final"][field],
                ))
        item["review_findings"] = problems
        item["differences"] = [
            f'{p["label"]}：{p["reason"]}；BOM：{p["original"] or "（空）"}；库/参考：{p["library"] or "（无）"}'
            + (f'；最终：{p["final"]}' if p["final"] else "")
            for p in problems
        ]
        if item["confirmed"] and item["confirmation"]["fingerprint"] != self._signature(item):
            item["confirmed"] = False
            item["confirmation"] = None
        item["requires_review"] = bool(problems)
        item["review_status"] = "confirmed" if item["confirmed"] else ("needs_review" if problems else "auto_passed")
        item["export_ready"] = item["confirmed"] or not problems
        item["auto_pass_basis"] = f"唯一库记录；{basis}" if not problems else ""

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
        if self._signature(updated) != self._signature(item):
            updated["confirmed"] = False
            updated["confirmation"] = None
        self._refresh(updated)
        self.items[row_id] = updated
        return copy.deepcopy(updated)

    def confirm(self, row_id: int, reviewer: str, note: str | None = None) -> dict:
        from datetime import datetime, timezone

        item = self._get(row_id)
        self._refresh(item)
        if not item["requires_review"]:
            return copy.deepcopy(item)  # 确定项不伪造人工确认记录。
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
        self._refresh(item)
        return copy.deepcopy(item)

    def invalidate(self, row_id: int) -> dict:
        item = self._get(row_id)
        item["confirmed"] = False
        item["confirmation"] = None
        self._refresh(item)
        return copy.deepcopy(item)

    def assert_confirmed(self) -> None:
        for item in self.items:
            self._refresh(item)
        pending = sum(not i["export_ready"] for i in self.items)
        if pending:
            raise ProfileError("CONFIRMATION_REQUIRED", f"还有 {pending} 项问题未确认，只能导出待校对稿")

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
                "auto_passed": sum(i["review_status"] == "auto_passed" for i in self.items),
                "pending": sum(not i["export_ready"] for i in self.items),
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
