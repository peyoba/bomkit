import { useEffect, useMemo, useState } from "react";
import { CheckCircleOutlined, DownloadOutlined, LoadingOutlined } from "@ant-design/icons";
import { Alert, Progress, message } from "antd";
import { LocalTableInput } from "../components/LocalTableInput";
import { OutputExample } from "../components/OutputExample";
import { detectReviewInput } from "../lib/reviewInput";
import { getWorkerClient } from "../workers/singleton";
import { useWorkerStore } from "../stores/workerStore";
import type { ExcelArgs, ExcelResult } from "../types/excel";
import type { LoadedTable, Platform } from "../types/review";

const metaFields: Array<[keyof ExcelArgs["meta"], string]> = [
  ["pcba_name", "PCBA名称"], ["pcba_model", "PCBA型号"],
  ["pcb_name", "PCB空板名称"], ["pcb_model", "PCB空板型号"],
];

export function ExcelWorkspace({onActivityChange}: {onActivityChange?: (busy: boolean) => void}) {
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
  useEffect(() => {
    onActivityChange?.(busy || bomReading || materialReading);
    return () => onActivityChange?.(false);
  }, [busy, bomReading, materialReading, onActivityChange]);
  const format = useMemo(() => {
    if (!bom) return null;
    try {return detectReviewInput(bom.rows, platform);} catch {return null;}
  }, [bom, platform]);
  const ready = engine.mode === "pyodide" && engine.status === "ready";
  const blocked = !bom || !format || !ready || bomReading || materialReading || busy;
  async function convert() {
    if (!bom || !format || blocked) return;
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
  const actionHint = busy ? "正在本机生成，请稍候" : bomReading || materialReading ? "正在读取所选文件" : !ready ? "本地引擎就绪后即可生成" : !bom ? "先选择一份 BOM 文件即可开始" : !format ? "请检查文件格式或所选工作表" : "不需要网页逐项确认";

  return <main className="a-wrap a-workspace" id="main-content">
    <div className="a-intro">
      <div><h1>BOM 转换工作台</h1><p>导入已有清单，按公司 PCBA 模板输出。在 Excel 中完成校对。</p></div>
      <p className="a-supported"><span>支持已适配的 EDA 格式</span>嘉立创 / Altium / Cadence</p>
    </div>
    <div className="a-workbench">
      <div className="a-form-pane">
        <form onSubmit={e => {e.preventDefault(); void convert();}} aria-busy={busy}>
          {!ready && <div className="a-engine-notice" data-testid="engine-status">
            <Alert type={engine.status === "error" || engine.mode === "mock" ? "error" : "info"} showIcon
              title={engine.mode === "mock" ? "请移除网址中的 worker=mock，Excel转换使用真实Python引擎" : engine.errorMessage || "正在加载本地 Python 引擎…"}
              description={engine.status !== "error" && engine.mode !== "mock" ? <Progress percent={engine.progress} /> : "请准备运行时后刷新页面。"} />
          </div>}
          <section className="a-input-section" aria-labelledby="input-heading">
            <div className="a-section-head"><h2 id="input-heading">输入文件</h2>
              <label className="a-platform-label">EDA 平台
                <select aria-label="EDA 平台" value={platform} disabled={busy || bomReading || materialReading}
                  onChange={e => {setPlatform(e.target.value as Platform); setResult(null);}}>
                  <option value="auto">自动识别</option><option value="jlc">嘉立创 EDA</option>
                  <option value="altium">Altium Designer</option><option value="cadence">Cadence</option>
                </select>
              </label>
            </div>
            <div className="a-file-grid">
              <LocalTableInput label="BOM 文件" id="bom-file" value={bom} appearance="a" onChange={v => {setBom(v); setResult(null); setError(null);}} onLoading={setBomReading} disabled={busy} />
              <LocalTableInput label="物料库文件" id="material-file" value={material} appearance="a" optional onChange={v => {setMaterial(v); setResult(null); setError(null);}} onLoading={setMaterialReading} disabled={busy} />
            </div>
            {format && <p className="a-detected" role="status"><CheckCircleOutlined aria-hidden="true" />识别为 {format.name}，表头第 {format.header_row_index + 1} 行</p>}
            {bom && !format && <p className="a-error-text" role="alert">未识别到已支持格式，请检查所选平台或工作表。</p>}
            <p className="a-input-note">保留原有分组合并、排序与多候选展开。物料表支持金蝶完整与旧简易格式。</p>
          </section>
          <section className="a-information" aria-labelledby="output-heading">
            <div className="a-section-head"><h2 id="output-heading">输出信息</h2><span className="a-section-helper">以下四项均为可选</span></div>
            <div className="a-info-grid">{metaFields.map(([key, label]) => <div key={key}>
              <label className="a-field-label" htmlFor={key}>{label}</label>
              <input className="a-text-input" id={key} aria-label={label} value={meta[key]} disabled={busy}
                autoComplete="off" maxLength={32767} placeholder="选填" onChange={e => {setMeta({...meta, [key]: e.target.value}); setResult(null);}} />
            </div>)}</div>
          </section>
          <section className="a-export-settings" aria-label="生成设置">
            <label className="a-field-label" htmlFor="output-name">输出文件名</label>
            <div className="a-filename-field">
              <input className="a-text-input" id="output-name" aria-label="输出文件名" value={filename} disabled={busy}
                placeholder={bom ? bom.file_name.replace(/\.[^.]+$/, "") + "_converted" : "留空按输入文件名自动生成"}
                autoComplete="off" onChange={e => setFilename(e.target.value)} />
              {!/\.xlsx$/i.test(filename.trim()) && <span className="a-filename-suffix" aria-hidden="true">.xlsx</span>}
            </div>
            <label className="a-checkbox-line"><input type="checkbox" data-testid="excel-trace" checked={trace} disabled={busy}
              onChange={e => {setTrace(e.target.checked); setResult(null);}} />
              <span>附原始输入与校对提示</span><span className="a-optional">可选</span>
            </label>
            <div className="a-action-row">
              <div><p className="a-action-title">在 Excel 中完成校对</p><p id="excel-action-hint" className="a-action-detail" role="status">{actionHint}</p></div>
              <button className="a-primary a-generate" type="submit" data-testid="excel-convert" disabled={blocked}
                aria-busy={busy} aria-describedby="excel-action-hint">
                {busy ? <LoadingOutlined spin aria-hidden="true" /> : <DownloadOutlined aria-hidden="true" />}
                {busy ? "正在生成…" : "生成 Excel"}
              </button>
            </div>
          </section>
          {error && <Alert className="a-convert-error" role="alert" type="error" showIcon title={error} />}
        </form>
        {result && <section className="a-conversion-result" data-testid="excel-result" aria-labelledby="result-heading">
          <h2 id="result-heading"><CheckCircleOutlined aria-hidden="true" />Excel 已生成</h2>
          <p data-testid="excel-stats">原始 {result.stats.source_rows} 行 / {result.stats.quantity} 件 → 按旧规则合并为 {result.stats.groups} 组 → 输出 {result.stats.output_rows} 行元件明细（另含 PCB 空板行）。</p>
          <p>{result.material_format} · {result.stats.material_count} 条可匹配记录 · 多候选 {result.stats.multi} 组 · 未匹配 {result.stats.unmatched} 组 · 非物料 {result.stats.non_component} 组。</p>
          {result.stats.multi > 0 && <Alert type="warning" showIcon title="候选仍需在 Excel 中删选"
            description={"表格展示数量合计 " + result.stats.display_quantity + "，包含候选重复展示；源 BOM 数量为 " + result.stats.quantity + "。请删去多余候选后再核对，不能直接把展示合计用于采购。"} />}
          <p className="a-result-boundary">这是转换结果，不代表生产审批。需要逐项核对或自定义中文模板，可使用导航中的可选网页工作台。</p>
        </section>}
      </div>
      <OutputExample />
    </div>
    <footer className="a-workspace-footer"><span>从输入清单到输出表格</span><span>本机处理 · 原有 Excel 工作流不变</span></footer>
  </main>;
}
