import { normalizeHeader } from "./detect";
import { indexToColLetter } from "./colLetters";

const OUTPUT_HEADER_ALIASES: Record<string, string> = {
  序号: "seq",
  seq: "seq",
  no: "seq",
  物料编码: "code",
  编码: "code",
  code: "code",
  物料名称: "material_name",
  名称: "material_name",
  规格型号: "material_spec",
  规格: "material_spec",
  位号: "designator",
  designator: "designator",
  数量: "qty",
  quantity: "qty",
  qty: "qty",
  封装: "footprint",
  footprint: "footprint",
  厂商: "manufacturer",
  manufacturer: "manufacturer",
  备注: "description",
  description: "description",
  jlc规格: "mpn",
  料号: "mpn",
  mpn: "mpn",
  匹配状态: "match_status",
  值: "value",
  类别: "category",
  精度: "tolerance",
};

export function guessOutputColumns(headerRow: string[]): Record<string, string | null> {
  const aliasByNorm = new Map(
    Object.entries(OUTPUT_HEADER_ALIASES).map(([alias, field]) => [normalizeHeader(alias), field])
  );
  const columns: Record<string, string | null> = {};
  headerRow.forEach((cell, i) => {
    const key = normalizeHeader(cell);
    columns[indexToColLetter(i)] = (key && aliasByNorm.get(key)) || null;
  });
  return columns;
}
