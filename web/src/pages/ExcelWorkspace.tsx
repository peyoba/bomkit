import { useEffect, useMemo, useState } from "react";
import { DownloadOutlined, LoadingOutlined } from "@ant-design/icons";
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
  const engineFailed = engine.status === "error" || engine.mode === "mock";

  return <main className="e-page e-grid-paper" id="main-content">
    <div className="e-wrap">
      <div className="e-intro">
        <div>
          <p className="e-eyebrow">EXCEL CONVERSION</p>
          <h1>BOM 转换工作台</h1>
          <p className="e-intro-copy">导入已有清单，按公司 PCBA 模板输出。在 Excel 中完成校对。</p>
        </div>
        <div className="e-intro-meta"><p className="e-meta-label">已适配格式</p><p>嘉立创 EDA / Altium / Cadence</p></div>
      </div>

      <div className="e-workbench">
        <div className="e-form-pane">
          <form onSubmit={e => {e.preventDefault(); void convert();}} aria-busy={busy}>
            {!ready && <div className={"e-alert e-engine-notice " + (engineFailed ? "is-error" : "is-info")} data-testid="engine-status" role="status">
              <span className="e-mark">{engineFailed ? "×" : "i"}</span>
              <div style={{minWidth: 0, flex: 1}}>
                <p className="e-alert-title">{engine.mode === "mock" ? "请移除网址中的 worker=mock，Excel转换使用真实Python引擎" : engine.errorMessage || "正在加载本地 Python 引擎…"}</p>
                {engineFailed ? <p className="e-alert-body">请准备运行时后刷新页面。</p> : <Progress percent={engine.progress} size="small" />}
              </div>
            </div>}

            <section className="e-block" aria-labelledby="input-heading">
              <div className="e-block-head">
                <span className="e-block-no">01</span>
                <h2 id="input-heading">输入文件</h2>
                <span className="e-spacer"></span>
                <label className="e-inline-label">EDA 平台
                  <select className="e-select" aria-label="EDA 平台" value={platform} disabled={busy || bomReading || materialReading}
                    onChange={e => {setPlatform(e.target.value as Platform); setResult(null);}}>
                    <option value="auto">自动识别</option><option value="jlc">嘉立创 EDA</option>
                    <option value="altium">Altium Designer</option><option value="cadence">Cadence</option>
                  </select>
                </label>
              </div>
              <div className="e-block-body">
                <div className="e-field-grid">
                  <LocalTableInput label="BOM 文件" id="bom-file" value={bom} appearance="e" onChange={v => {setBom(v); setResult(null); setError(null);}} onLoading={setBomReading} disabled={busy} />
                  <LocalTableInput label="物料库文件" id="material-file" value={material} appearance="e" optional onChange={v => {setMaterial(v); setResult(null); setError(null);}} onLoading={setMaterialReading} disabled={busy} />
                </div>
                {format && <p className="e-detected" role="status"><span className="e-mark">OK</span>识别为 {format.name}，表头第 {format.header_row_index + 1} 行</p>}
                {bom && !format && <p className="e-file-help is-error" role="alert">未识别到已支持格式，请检查所选平台或工作表。</p>}
                <p className="e-block-note">保留原有分组合并、排序与多候选展开。物料表支持金蝶完整与旧简易格式。</p>
              </div>
            </section>

            <section className="e-block" aria-labelledby="output-heading">
              <div className="e-block-head">
                <span className="e-block-no">02</span>
                <h2 id="output-heading">输出信息与下载</h2>
                <span className="e-spacer"></span>
                <span className="e-block-helper">四项均为可选</span>
              </div>
              <div className="e-block-body">
                <div className="e-field-grid cols-4">{metaFields.map(([key, label]) => <div key={key}>
                  <label className="e-field-label" htmlFor={key}>{label}</label>
                  <input className="e-input" id={key} aria-label={label} value={meta[key]} disabled={busy}
                    autoComplete="off" maxLength={32767} placeholder="选填" onChange={e => {setMeta({...meta, [key]: e.target.value}); setResult(null);}} />
                </div>)}</div>
                <div className="e-row-pair">
                  <div>
                    <label className="e-field-label" htmlFor="output-name">输出文件名</label>
                    <div className="e-filename">
                      <input className="e-input" id="output-name" aria-label="输出文件名" value={filename} disabled={busy}
                        placeholder={bom ? bom.file_name.replace(/\.[^.]+$/, "") + "_converted" : "留空按输入文件名自动生成"}
                        autoComplete="off" onChange={e => setFilename(e.target.value)} />
                      {!/\.xlsx$/i.test(filename.trim()) && <span className="e-filename-suffix" aria-hidden="true">.xlsx</span>}
                    </div>
                  </div>
                  <label className="e-checkbox-line"><input type="checkbox" data-testid="excel-trace" checked={trace} disabled={busy}
                    onChange={e => {setTrace(e.target.checked); setResult(null);}} />
                    <span>附原始输入与校对提示</span><span className="e-optional">可选</span>
                  </label>
                </div>
                <div className="e-action-row">
                  <div><p className="e-action-title">在 Excel 中完成校对</p><p id="excel-action-hint" className="e-action-detail" role="status">{actionHint}</p></div>
                  <button className="e-btn e-btn-primary e-btn-lg e-generate" type="submit" data-testid="excel-convert" disabled={blocked}
                    aria-busy={busy} aria-describedby="excel-action-hint">
                    {busy ? "正在生成…" : "生成 Excel"}
                    {busy ? <LoadingOutlined spin aria-hidden="true" /> : <DownloadOutlined aria-hidden="true" />}
                  </button>
                </div>
              </div>
            </section>
            {error && <Alert role="alert" type="error" showIcon title={error} />}
          </form>

          {result && <section className="e-block" data-testid="excel-result" aria-labelledby="result-heading">
            <div className="e-block-head">
              <span className="e-block-no">03</span>
              <h2 id="result-heading">Excel 已生成</h2>
              <span className="e-spacer"></span>
              <span className="e-tag is-green">已下载</span>
            </div>
            <div className="e-block-body">
              <p className="e-block-note" data-testid="excel-stats">原始 <span className="e-mono">{result.stats.source_rows}</span> 行 / <span className="e-mono">{result.stats.quantity}</span> 件 → 按旧规则合并为 <span className="e-mono">{result.stats.groups}</span> 组 → 输出 <span className="e-mono">{result.stats.output_rows}</span> 行元件明细（另含 PCB 空板行）。</p>
              <p className="e-block-note">{result.material_format} · <span className="e-mono">{result.stats.material_count}</span> 条可匹配记录 · 多候选 <span className="e-mono">{result.stats.multi}</span> 组 · 未匹配 <span className="e-mono">{result.stats.unmatched}</span> 组 · 非物料 <span className="e-mono">{result.stats.non_component}</span> 组。</p>
              {result.stats.multi > 0 && <div className="e-alert is-warning"><span className="e-mark">!</span><div>
                <p className="e-alert-title">候选仍需在 Excel 中删选</p>
                <p className="e-alert-body">表格展示数量合计 {result.stats.display_quantity}，包含候选重复展示；源 BOM 数量为 {result.stats.quantity}。请删去多余候选后再核对，不能直接把展示合计用于采购。</p>
              </div></div>}
              <p className="e-boundary">这是转换结果，不代表生产审批。需要逐项核对或自定义中文模板，可使用导航中的可选网页工作台。</p>
            </div>
          </section>}
        </div>
        <OutputExample />
      </div>
      <footer className="e-page-foot"><span>方向 E / 红笔校对 · 红色只用于需要人工判断的地方</span><span>本机处理 · 原有 Excel 工作流不变</span></footer>
    </div>
  </main>;
}
