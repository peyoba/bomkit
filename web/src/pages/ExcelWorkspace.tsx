import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Checkbox, Input, Progress, Select, Space, Typography, message } from "antd";
import { LocalTableInput } from "../components/LocalTableInput";
import { detectReviewInput } from "../lib/reviewInput";
import { getWorkerClient } from "../workers/singleton";
import { useWorkerStore } from "../stores/workerStore";
import type { ExcelArgs, ExcelResult } from "../types/excel";
import type { LoadedTable, Platform } from "../types/review";

const { Title, Paragraph, Text } = Typography;
const metaFields: Array<[keyof ExcelArgs["meta"], string]> = [
  ["pcba_name", "PCBA名称"], ["pcba_model", "PCBA型号"],
  ["pcb_name", "PCB空板名称"], ["pcb_model", "PCB空板型号"],
];

export function ExcelWorkspace() {
  const [bom, setBom] = useState<LoadedTable | null>(null);
  const [material, setMaterial] = useState<LoadedTable | null>(null);
  const [bomReading, setBomReading] = useState(false);
  const [materialReading, setMaterialReading] = useState(false);
  const [platform, setPlatform] = useState<Platform>("auto");
  const [meta, setMeta] = useState<ExcelArgs["meta"]>({pcba_name: "", pcba_model: "", pcb_name: "", pcb_model: ""});
  const [filename, setFilename] = useState("");
  const [trace, setTrace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExcelResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const engine = useWorkerStore();
  useEffect(() => {getWorkerClient();}, []);
  const format = useMemo(() => {
    if (!bom) return null;
    try {return detectReviewInput(bom.rows, platform);} catch {return null;}
  }, [bom, platform]);
  const ready = engine.mode === "pyodide" && engine.status === "ready";
  async function convert() {
    if (!bom || !format) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const converted = await getWorkerClient().excel({bom_rows: bom.rows, material_rows: material?.rows ?? null,
        platform, meta, include_trace: trace});
      const bytes = new Uint8Array(converted.data);
      const url = URL.createObjectURL(new Blob([bytes], {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
      const requested = filename.trim() || bom.file_name.replace(/\.[^.]+$/, "") + "_converted.xlsx";
      const a = document.createElement("a");
      a.href = url; a.download = (/\.xlsx$/i.test(requested) ? requested : requested + ".xlsx").replace(/[\\/]/g, "_");
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      setResult(converted); message.success("Excel已生成，请在表格内选择候选、核对并保存");
    } catch (e) {setError(e instanceof Error ? e.message : String(e));} finally {setBusy(false);}
  }
  return <main className="workspace">
    <Title level={2}>BOM 转换 · 在 Excel 中处理</Title>
    <Paragraph type="secondary">保留原公司模板、分组合并、排序和候选展开。网页只负责生成文件，不要求逐项确认。</Paragraph>
    <Alert type="info" showIcon title="按旧工具方式，在 Excel 里完成校对"
      description="多候选会展开并标色；请保留正确候选、删除其余行后再核对数量。未匹配项在表格中补充，不会阻止下载。" />
    {!ready && <Alert style={{marginTop: 16}} type={engine.status === "error" || engine.mode === "mock" ? "error" : "info"}
      title={engine.mode === "mock" ? "请移除网址中的 worker=mock，Excel转换使用真实Python引擎" : engine.errorMessage || "正在加载本地 Python 引擎…"}
      description={engine.status !== "error" && engine.mode !== "mock" ? <Progress percent={engine.progress} /> : "请准备运行时后刷新页面。"} />}
    {error && <Alert role="alert" type="error" showIcon title={error} style={{marginTop: 16}} />}
    <div className="review-columns" style={{marginTop: 16}}>
      <Card title="1. 选择 BOM">
        <Select aria-label="EDA 平台" value={platform} disabled={busy} style={{width: "100%", marginBottom: 12}} onChange={setPlatform}
          options={[{value: "auto", label: "自动识别"}, {value: "jlc", label: "嘉立创 EDA"},
            {value: "altium", label: "Altium Designer"}, {value: "cadence", label: "Cadence"}]} />
        <LocalTableInput label="BOM 文件" id="bom-file" value={bom} onChange={v => {setBom(v); setResult(null);}} onLoading={setBomReading} disabled={busy} />
        {format && <Text type="success">识别为 {format.name}，表头第 {format.header_row_index + 1} 行</Text>}
        {bom && !format && <Text type="warning">未识别到已支持格式，请检查工作表或平台。</Text>}
      </Card>
      <Card title="2. 选择物料表（可选）">
        <LocalTableInput label="物料库文件" id="material-file" value={material} onChange={v => {setMaterial(v); setResult(null);}} onLoading={setMaterialReading} disabled={busy} />
        <Paragraph type="secondary">同时支持金蝶完整物料表，以及“规格、物料编码、金蝶系统型号”的旧简易表。不选物料表也能生成 Excel。</Paragraph>
      </Card>
    </div>
    <Card title="3. 公司表头与 PCB 空板信息（可选）" style={{marginTop: 16}}>
      <div className="review-columns">{metaFields.map(([key, label]) => <label className="field-label" key={key}>{label}
        <Input aria-label={label} value={meta[key]} disabled={busy} onChange={e => setMeta({...meta, [key]: e.target.value})} />
      </label>)}</div>
      <Paragraph type="secondary">默认使用原公司 PCBA BOM表：保留空板行、厂商、JLC规格、Description、匹配状态及原标色。</Paragraph>
      <label className="field-label">输出文件名<Input aria-label="输出文件名" value={filename} disabled={busy}
        placeholder="留空按输入文件名自动生成" onChange={e => setFilename(e.target.value)} /></label>
      <Checkbox data-testid="excel-trace" checked={trace} disabled={busy} onChange={e => setTrace(e.target.checked)}>
        可选增强：附原始输入和 Excel 校对提示（不改变公司主表、不阻止导出）
      </Checkbox>
    </Card>
    <Space style={{marginTop: 20}} wrap>
      <Button type="primary" size="large" data-testid="excel-convert" loading={busy}
        disabled={!bom || !format || !ready || bomReading || materialReading} onClick={() => void convert()}>生成 Excel，在表格中校对</Button>
      <Text type="secondary">不需要网页确认；文件始终在本机处理。</Text>
    </Space>
    {result && <Card title="Excel 已生成" data-testid="excel-result" style={{marginTop: 20}}>
      <Paragraph data-testid="excel-stats">原始 {result.stats.source_rows} 行 / {result.stats.quantity} 件 → 按旧规则合并为 {result.stats.groups} 组 → 输出 {result.stats.output_rows} 行元件明细（另含 PCB 空板行）。</Paragraph>
      <Paragraph>{result.material_format} · {result.stats.material_count} 条可匹配记录 · 多候选 {result.stats.multi} 组 · 未匹配 {result.stats.unmatched} 组 · 非物料 {result.stats.non_component} 组。</Paragraph>
      {result.stats.multi > 0 && <Alert type="warning" showIcon title="候选仍需在 Excel 中删选"
        description={"表格展示数量合计 " + result.stats.display_quantity + "，包含候选重复展示；源 BOM 数量为 " + result.stats.quantity + "。请删去多余候选后再核对，不能直接把展示合计用于采购。"} />}
      <Paragraph type="secondary">本文件是转换结果，不代表物料已获生产审批。需要自定义中文模板或网页逐项核对，可回首页使用可选工作台。</Paragraph>
    </Card>}
  </main>;
}
