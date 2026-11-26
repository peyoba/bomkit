"""公司Excel优先CLI：保留旧命令参数、分组/候选/公司格式，网页无需确认。

与网页默认入口共享bomcore.excel_api；原v1 API及可选v2会话仍独立保留。
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from bomcore.excel_api import convert_excel
from bomcore.lineage import load_lineage
from bomcore.review_import import read_file
from bomcore.schema import ProfileError


def _read_xlsx_as_rows(path: str) -> list[list[str]]:
    """兼容保留旧内部读取函数名，统一采用可靠的本机读取器。"""
    return read_file(path)["rows"]


def read_lineage_file(path: str, label: str) -> list[list[str]]:
    """读取成品 PCBA BOM（上一版 / 物料参考表）：逐工作表找含 物料编码/规格型号/位号 的那一张。"""
    from openpyxl import load_workbook

    try:
        names = load_workbook(path, read_only=True).sheetnames
    except Exception as exc:  # noqa: BLE001 -- 统一转为用户可读错误
        raise ProfileError("INVALID_ROWS", f"{label}无法读取，请确认是 .xlsx 文件") from exc
    for name in names:
        rows = read_file(path, name)["rows"]
        if load_lineage(rows):
            return rows
    raise ProfileError(
        "INVALID_PROFILE",
        f"{label}不是成品 PCBA BOM：需要含 物料编码 / 规格型号 / 位号 表头（请确认选对文件或工作表）",
    )


def _save_with_retry(path: str, data: bytes) -> None:
    for attempt in range(3):
        try:
            Path(path).write_bytes(data)
            return
        except PermissionError:
            if attempt == 2:
                raise
            print("文件被占用，1秒后重试；请关闭Excel中的输出文件")
            time.sleep(1)


def _generate_output_filename(input_file: str) -> str:
    """非覆盖式默认输出路径（旧核心 107-123 行原样搬运）。"""
    input_path = Path(input_file)
    base_name = f"{input_path.stem}_converted"
    output_dir = input_path.parent

    output_path = output_dir / f"{base_name}.xlsx"
    if not output_path.exists():
        return str(output_path)

    for counter in range(1, 101):
        unique_path = output_dir / f"{base_name}_{counter}.xlsx"
        if not unique_path.exists():
            return str(unique_path)

    raise RuntimeError("无法生成输出文件名，请手动指定输出文件")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="bomkit",
        description="按原公司规则转换BOM，在Excel中处理候选与校对。",
    )
    parser.add_argument(
        "input_file", help="BOM文件（自动识别嘉立创/Altium/Cadence；支持XLSX/TXT/TSV/CSV）"
    )
    parser.add_argument(
        "-o",
        "--output",
        dest="output_file",
        default=None,
        help="输出文件路径（默认在输入文件旁自动生成，避免覆盖已有文件）",
    )
    parser.add_argument(
        "-m",
        "--material",
        dest="material_code_file",
        default=None,
        help="物料表文件（可选，支持金蝶完整或旧简易格式）",
    )
    parser.add_argument(
        "--pcba-name",
        dest="pcba_name",
        default="",
        help="PCBA 名称，填入输出表格表头第2行",
    )
    parser.add_argument(
        "--pcba-model",
        dest="pcba_model",
        default="",
        help="PCBA 型号，填入输出表格表头第2行",
    )
    parser.add_argument(
        "--pcb-name",
        dest="pcb_name",
        default="",
        help="PCB 空板名称，填入输出表格序号1行",
    )
    parser.add_argument(
        "--pcb-model",
        dest="pcb_model",
        default="",
        help="PCB 空板型号，填入输出表格序号1行",
    )
    parser.add_argument(
        "--platform",
        choices=["auto", "jlc", "altium", "cadence"],
        default="auto",
        help="输入平台，默认自动识别；嘉立创Device列可选",
    )
    parser.add_argument("--bom-sheet", default=None, help="选择BOM工作表")
    parser.add_argument("--material-sheet", default=None, help="选择物料表工作表")
    parser.add_argument(
        "--with-trace",
        action="store_true",
        help="附原始输入和Excel校对提示，不改变公司主表",
    )
    parser.add_argument(
        "--old",
        dest="previous_file",
        default=None,
        help="上一版成品 BOM（可选）：按位号继承编码，并作为排序与 PCBA 名称/型号来源",
    )
    parser.add_argument(
        "--ref",
        dest="reference_files",
        action="append",
        default=None,
        help="物料参考表（可选，可重复）：已有成品 BOM，按型号/阻容参数直接查编码",
    )
    parser.add_argument(
        "--sort",
        dest="sort_mode",
        choices=["auto", "legacy", "company"],
        default="auto",
        help="排序：auto=给了 --old/--ref 时用公司规则 v2；legacy=旧工具排序；company=强制 v2",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        output_file = args.output_file or _generate_output_filename(args.input_file)
        bom_rows = read_file(args.input_file, args.bom_sheet)["rows"]
        material_rows = (
            read_file(args.material_code_file, args.material_sheet)["rows"]
            if args.material_code_file
            else None
        )
        previous_rows = (
            read_lineage_file(args.previous_file, "上一版 BOM") if args.previous_file else None
        )
        reference_rows = [
            read_lineage_file(path, f"物料参考表{i + 1}")
            for i, path in enumerate(args.reference_files or [])
        ]
        if args.sort_mode == "legacy" and (previous_rows is not None or reference_rows):
            sort_mode = "legacy"
        elif args.sort_mode == "company":
            sort_mode = "company"
        else:
            sort_mode = "auto"
        result = convert_excel(
            {
                "bom_rows": bom_rows,
                "material_rows": material_rows,
                "platform": args.platform,
                "meta": {
                    "pcba_name": args.pcba_name,
                    "pcba_model": args.pcba_model,
                    "pcb_name": args.pcb_name,
                    "pcb_model": args.pcb_model,
                },
                "include_trace": args.with_trace,
                "previous_rows": previous_rows,
                "reference_rows": reference_rows,
                "sort_mode": "company" if sort_mode == "company" or (
                    sort_mode == "auto" and (previous_rows is not None or reference_rows)
                ) else "legacy",
            }
        )
        _save_with_retry(output_file, result["data"])
    except ProfileError as exc:
        print(f"错误: {exc.message}")
        return 1
    except Exception as exc:  # noqa: BLE001 -- CLI 顶层兜底，需把任何异常转为用户可读错误
        print(f"错误: {exc}")
        return 1

    stats = result["stats"]
    print(
        f"转换完成！输出文件: {output_file}\n"
        f"  原始 {stats['source_rows']} 行 / {stats['quantity']} 件 → {stats['groups']} 组 → "
        f"输出 {stats['output_rows']} 行；多候选 {stats['multi']} 组，未匹配 {stats['unmatched']} 组"
    )
    if previous_rows is not None or reference_rows:
        print(
            f"  谱系匹配：上一版继承 {stats.get('previous', 0)} 项，参考表命中 {stats.get('reference', 0)} 项；"
            f"物料表 {result['material_format']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
