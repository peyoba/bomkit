"""公司Excel优先CLI：保留旧命令参数、分组/候选/公司格式，网页无需确认。

与网页默认入口共享bomcore.excel_api；原v1 API及可选v2会话仍独立保留。
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from bomcore.excel_api import convert_excel
from bomcore.review_import import read_file
from bomcore.schema import ProfileError


def _read_xlsx_as_rows(path: str) -> list[list[str]]:
    """兼容保留旧内部读取函数名，统一采用可靠的本机读取器。"""
    return read_file(path)["rows"]


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
            }
        )
        _save_with_retry(output_file, result["data"])
    except ProfileError as exc:
        print(f"错误: {exc.message}")
        return 1
    except Exception as exc:  # noqa: BLE001 -- CLI 顶层兜底，需把任何异常转为用户可读错误
        print(f"错误: {exc}")
        return 1

    print(f"转换完成！输出文件: {output_file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
