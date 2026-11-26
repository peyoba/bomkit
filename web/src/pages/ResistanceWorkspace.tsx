import { useState } from "react";
import circuit from "../features/resistance/circuit.png";
import {
  calculateVoltage, searchResistance, readNumber, formatNumber, PARALLEL_RESULT_LIMIT,
  type ResistorBranch, type VoltageResult, type ResistanceResult,
} from "../features/resistance/calculator";
import "../features/resistance/resistance.css";

interface VoltageFields { supply: string; output: string; tolerance: string }
type ResultSet =
  | { kind: "voltage"; title: string; summary: string; rows: VoltageResult[]; parallel: boolean }
  | { kind: "resistance"; title: string; summary: string; rows: ResistanceResult[]; parallel: false };

function NumberField({id, label, unit, value, onChange}: {
  id: string; label: string; unit: string; value: string; onChange: (value: string) => void;
}) {
  return <div>
    <label className="e-field-label" htmlFor={id}>{label}</label>
    <div className="rc-input-unit">
      <input className="e-input" id={id} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
        value={value} onChange={event => onChange(event.target.value)} />
      <span aria-hidden="true">{unit}</span>
    </div>
  </div>;
}

function Branch({branch}: {branch: ResistorBranch}) {
  return <><span>{formatNumber(branch.a)}{branch.b ? ` ∥ ${formatNumber(branch.b)}` : ""}</span>
    {branch.b > 0 && <small>等效 {formatNumber(branch.value)} Ω</small>}</>;
}

export function ResistanceWorkspace({active = true}: {active?: boolean}) {
  const [feedback, setFeedback] = useState<VoltageFields>({supply: "0.6", output: "3.3", tolerance: "20"});
  const [divider, setDivider] = useState<VoltageFields>({supply: "5", output: "1", tolerance: "10"});
  const [target, setTarget] = useState("");
  const [ohms, setOhms] = useState("10");
  const [result, setResult] = useState<ResultSet | null>(null);
  const [error, setError] = useState("");

  function runVoltage(mode: "feedback" | "divider", parallel: boolean) {
    try {
      const fields = mode === "feedback" ? feedback : divider;
      const supply = readNumber(fields.supply, mode === "feedback" ? "VFB" : "VCC");
      const output = readNumber(fields.output, "Vout");
      const toleranceMv = readNumber(fields.tolerance, "精度", true);
      const rows = calculateVoltage({mode, supply, output, toleranceMv, parallel});
      setResult({kind: "voltage", title: `${mode === "feedback" ? "反馈分压" : "普通分压"} · ${parallel ? "含并联组合" : "单电阻组合"}`,
        summary: `目标 ${formatNumber(output)} V · 精度 ${formatNumber(toleranceMv)} mV`, rows, parallel});
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "计算失败，请检查输入。");
      setResult(null);
    }
  }

  function runSearch() {
    try {
      const resistance = readNumber(target, "目标阻值");
      const tolerance = readNumber(ohms, "精度", true);
      const rows = searchResistance(resistance, tolerance);
      setResult({kind: "resistance", title: "目标阻值 · 两电阻并联", summary: `目标 ${formatNumber(resistance)} Ω · 精度 ${formatNumber(tolerance)} Ω`, rows, parallel: false});
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "搜索失败，请检查输入。");
      setResult(null);
    }
  }

  function voltageCard(mode: "feedback" | "divider") {
    const isFeedback = mode === "feedback";
    const fields = isFeedback ? feedback : divider;
    const update = (key: keyof VoltageFields, value: string) => {
      const setter = isFeedback ? setFeedback : setDivider;
      setter(previous => ({...previous, [key]: value}));
    };
    return <section className="e-block" aria-labelledby={`rc-${mode}-title`}>
      <div className="e-block-head"><span className="e-block-no">{isFeedback ? "01" : "02"}</span>
        <h2 id={`rc-${mode}-title`}>{isFeedback ? "电源反馈分压" : "普通电阻分压"}</h2></div>
      <form className="e-block-body" onSubmit={event => {event.preventDefault(); runVoltage(mode, false);}}>
        <p className="rc-equation e-mono">{isFeedback ? "Vout = VFB × (1 + R1 / R2)" : "Vout = VCC × R2 / (R1 + R2)"}</p>
        <div className="e-field-grid cols-3">
          <NumberField id={`rc-${mode}-supply`} label={isFeedback ? "反馈基准电压 VFB" : "供电电压 VCC"} unit="V" value={fields.supply} onChange={value => update("supply", value)} />
          <NumberField id={`rc-${mode}-output`} label={isFeedback ? "反馈输出电压 Vout" : "分压输出电压 Vout"} unit="V" value={fields.output} onChange={value => update("output", value)} />
          <NumberField id={`rc-${mode}-tolerance`} label={isFeedback ? "反馈精度" : "分压精度"} unit="mV" value={fields.tolerance} onChange={value => update("tolerance", value)} />
        </div>
        <div className="rc-actions">
          <button type="submit" className="e-btn e-btn-primary">无电阻并联组合</button>
          <button type="button" className="e-btn" onClick={() => runVoltage(mode, true)}>有电阻并联组合</button>
        </div>
        <p className="e-boundary">{isFeedback ? "结果等于或略高于目标电压，差值小于精度。" : "单电阻结果允许目标两侧偏差；含并联组合时，结果等于或略高于目标。"}</p>
      </form>
    </section>;
  }

  return <main className="e-page e-grid-paper rc-workspace" id={active ? "main-content" : undefined}>
    <div className="e-wrap">
      <div className="e-intro">
        <div><p className="e-eyebrow">RESISTANCE CALCULATOR · 电阻组合计算</p><h1>电阻计算器</h1>
          <p className="e-intro-copy">根据目标电压或阻值搜索电阻组合，支持反馈分压、普通分压与两电阻并联。</p></div>
        <div className="e-intro-meta"><p>77 个常用阻值</p><p className="e-mono">100 Ω ～ 910 kΩ</p></div>
      </div>
      <div className="rc-grid">
        <div className="rc-voltage-cards">{voltageCard("feedback")}{voltageCard("divider")}</div>
        <aside className="rc-sidebar">
          <section className="e-block" aria-labelledby="rc-target-title">
            <div className="e-block-head"><span className="e-block-no">03</span><h2 id="rc-target-title">目标阻值搜索</h2></div>
            <form className="e-block-body" onSubmit={event => {event.preventDefault(); runSearch();}}>
              <NumberField id="rc-target" label="目标阻值" unit="Ω" value={target} onChange={setTarget} />
              <NumberField id="rc-ohms" label="阻值精度" unit="Ω" value={ohms} onChange={setOhms} />
              <button type="submit" className="e-btn e-btn-primary rc-search">搜索阻值</button>
              <p className="e-boundary">搜索两个电阻的并联组合；等效阻值等于或略低于目标，差值小于精度。</p>
            </form>
          </section>
          <figure className="e-block rc-schematic"><img src={circuit} alt="分压电阻电路图：R1 位于输入与输出节点之间，R2 位于输出节点与地之间" />
            <figcaption>R1 为上臂，R2 为下臂。∥ 表示并联。</figcaption></figure>
        </aside>
      </div>
      <section className="e-block rc-result" aria-labelledby="rc-result-title">
        <div className="e-block-head"><h2 id="rc-result-title">计算结果</h2><span className="e-spacer" />
          <button type="button" className="e-btn" onClick={() => {setResult(null); setError("");}}>清空结果</button></div>
        <div className="e-block-body">
          {error && <p className="rc-error" role="alert">{error}</p>}
          <div role="status" aria-live="polite" aria-atomic="true">
            {!error && !result && <p className="e-block-note">填写参数后选择计算方式，结果会显示在这里。</p>}
            {result && <><p className="rc-result-name">{result.title} · 找到 {result.rows.length} 组</p>
              <p className="e-boundary">{result.summary}{result.parallel && result.rows.length === PARALLEL_RESULT_LIMIT ? " · 仅显示前 100 组" : ""}</p>
              {result.rows.length === 0 && <p className="e-block-note">没有符合条件的组合，请调整目标或精度。</p>}</>}
          </div>
          {result && result.rows.length > 0 && <div className="rc-table-scroll" tabIndex={0} role="region" aria-label="电阻组合结果表格，可横向滚动">
            <table className="rc-table"><caption>{result.title}；阻值单位 Ω</caption>
              <thead><tr><th scope="col">#</th><th scope="col">R1 / Ω</th>{result.kind === "voltage" && <th scope="col">R2 / Ω</th>}
                <th scope="col">{result.kind === "voltage" ? "输出电压 / V" : "等效阻值 / Ω"}</th></tr></thead>
              <tbody>{result.rows.map((row, index) => <tr key={index}>
                <td>{index + 1}</td><td><Branch branch={row.r1} /></td>
                {result.kind === "voltage" && "r2" in row && <td><Branch branch={row.r2} /></td>}
                <td>{formatNumber(row.value)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </div>
      </section>
      <footer className="e-page-foot"><span>内置常用阻值库，非完整 E96 系列 · 精度参数是搜索窗口，不是元件公差</span><span>理想公式选型，实际电路仍需校核功耗、容差与负载</span></footer>
    </div>
  </main>;
}
