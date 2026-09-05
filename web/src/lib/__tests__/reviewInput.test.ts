import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";
import path from "node:path";
import { decodeText, detectReviewInput, parseDelimited, workbookRows } from "../reviewInput";

const jlc = ["Designator", "Quantity", "Name", "Device", "Footprint"];

describe("v2 EDA 预设", () => {
  it.each([
    [jlc, "jlc", { Name: "value", Device: "mpn", Designator: "designator" }],
    [["Comment", "Pattern", "Quantity", "Components"], "altium", { Comment: "value", Pattern: "footprint", Components: "designator" }],
    [["Item", "Quantity", "Reference", "Part", "PCB Footprint", "PART_NUMBER"], "cadence-report", { Part: "value", Reference: "designator" }],
    [["Value", "Quantity", "Part Reference", "PCB Footprint"], "cadence-detailed", { Value: "value", "Part Reference": "designator" }],
  ])("识别 %s 且表头支持第12行", (headers, id, expected) => {
    const rows = [...Array.from({ length: 11 }, () => ["报表标题"]), headers as string[], ["data"]];
    const result = detectReviewInput(rows);
    expect(result.id).toBe(id);
    expect(result.header_row_index).toBe(11);
    expect(result.column_map).toMatchObject(expected);
    expect(result.column_map.PART_NUMBER).toBeUndefined();
  });
  it("拒绝错平台和重复关键表头", () => {
    expect(() => detectReviewInput([jlc, ["x"]], "cadence")).toThrow();
    expect(() => detectReviewInput([[...jlc, "Quantity"], ["x"]])).toThrow("重复");
    expect(() => detectReviewInput([])).toThrow("为空");
  });
});

describe("本地文本与Excel读取", () => {
  it("GBK Ω 不乱码，保留空列和前导零", () => {
    // GBK: Ω = A6 B8；不用从真实企业文件生成测试数据。
    const bytes = Uint8Array.from([0x31,0x30,0x6b,0xa6,0xb8,9,9,0x30,0x30,0x31,0x32,13,10]);
    const decoded = decodeText(bytes);
    expect(decoded.text).toBe("10kΩ\t\t0012\r\n");
    expect(parseDelimited(decoded.text, "\t")).toEqual([["10kΩ", "", "0012"]]);
  });
  it("引号转义、多行、逗号与空行保留", () => {
    expect(parseDelimited('A,B,C\r\n"R1,R2","line1\nline2","a""b"\r\n\r\n', ","))
      .toEqual([["A","B","C"],["R1,R2","line1\nline2",'a"b'],[""]]);
    expect(() => parseDelimited('"unclosed', ",")).toThrow("引号");
  });
  it("错误dimension=A1不能把ERP表截成一格", () => {
    const ws = XLSX.utils.aoa_to_sheet([["编码","规格型号"],["0012","10kΩ"],["0013","100nF"]]);
    ws["!ref"] = "A1";
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"物料");
    expect(workbookRows(wb).rows).toEqual([["编码","规格型号"],["0012","10kΩ"],["0013","100nF"]]);
  });
  it("空前置工作表跳过且显示格式前导零保留", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), "空表");
    const ws = XLSX.utils.aoa_to_sheet([["编号"], [12]]); ws.A2.z="000000";
    XLSX.utils.book_append_sheet(wb,ws,"数据");
    expect(workbookRows(wb)).toEqual({sheet_name: "数据", rows: [["编号"],["000012"]]});
    expect(() => workbookRows(wb,"不存在")).toThrow("不存在");
  });
  it("超大坐标不触发分配超大数组", () => {
    const ws = XLSX.utils.aoa_to_sheet([["data"]]); ws.A100001={t:"s",v:"x"};
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"表");
    expect(() => workbookRows(wb)).toThrow("超过限制");
  });
});

describe.skipIf(process.env.BOMKIT_PRIVATE_TESTS !== "1")("本机私有样例（显式开启，不进入git）", () => {
  const root = path.resolve(__dirname,"../../../../core/tests/fixtures/private/closed-loop/inputs");
  it.each([
    ["jlc.xlsx","jlc"], ["altium.xlsx","altium"], ["cadence-report.xlsx","cadence-report"],
    ["cadence-detail.xlsx","cadence-detailed"], ["cadence-grouped.xlsx","cadence-report"],
  ])("SheetJS真实读取 %s", (name, id) => {
    const wb=XLSX.read(readFileSync(path.join(root,name)),{type:"buffer",nodim:true});
    expect(detectReviewInput(workbookRows(wb).rows).id).toBe(id);
  });
  it("读取ERP所有17371条，TXT与Excel完全等价", () => {
    const read=(name:string) => workbookRows(XLSX.read(readFileSync(path.join(root,name)),{type:"buffer",nodim:true})).rows;
    expect(read("material.xlsx")).toHaveLength(17372);
    const txt=decodeText(readFileSync(path.join(root,"cadence-grouped.txt")));
    const parsed=parseDelimited(txt.text,"\t");
    const excel=read("cadence-grouped.xlsx");
    // 空行在TXT可能是[]，读XLSX是7个空格；按相同列数比较原值。
    expect(parsed.map(r=>Array.from({length:7},(_,i)=>r[i]??""))).toEqual(excel);
  });
});
