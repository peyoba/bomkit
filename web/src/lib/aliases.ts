/**
 * 别名词库 TS 侧镜像。数据内容必须与
 * core/src/bomcore/aliases/*.json 保持同步——这是 T3 任务的正式产出物，
 * 此处只是 T0/T2 骨架阶段的最小可用集合，供 detect.ts 与 Vitest 共享用例使用。
 * TODO(T3): 词库应改为从单一数据源生成（构建脚本读 core aliases 生成本文件），
 * 避免中英文别名在两处漂移不一致。
 */
export const ALIASES: Record<string, string[]> = {
  designator: ["designator", "位号", "reference", "refdes", "ref", "位置", "标号"],
  qty: ["quantity", "qty", "数量", "用量"],
  value: ["name", "value", "名称", "值", "元件值"],
  footprint: ["footprint", "封装", "package", "pcb footprint"],
  mpn: ["device", "mpn", "manufacturer part number", "型号", "器件型号", "料号", "jlc规格"],
  manufacturer: ["manufacturer", "厂商", "厂家", "制造商"],
  description: ["comment", "description", "备注", "说明"],
  category: ["secondary category", "category", "类别", "分类", "元件类别"],
  tolerance: ["tolerance", "精度", "误差"],
  code: ["编码", "code"],
  source_code: ["物料编码", "物料编号", "物料代码"],
  spec: ["规格型号", "spec", "规格", "型号"],
  name: ["名称", "name", "物料名称"],
  status: ["禁用状态", "status", "状态"],
};

/**
 * kind -> 允许映射的字段集合。必须与 core/src/bomcore/schema.py 的
 * BOM_FIELDS / MATERIAL_FIELDS 保持同步，并与 detect.ts 的 kind 过滤、
 * Wizard 页的 *_FIELD_OPTIONS 三方一致。
 */
export const KIND_ALLOWED_FIELDS: Record<"bom_input" | "material_input", ReadonlySet<string>> = {
  bom_input: new Set([
    "designator", "qty", "value", "footprint", "mpn",
    "manufacturer", "description", "category", "tolerance", "source_code",
  ]),
  material_input: new Set(["code", "name", "spec", "status", "category"]),
};
