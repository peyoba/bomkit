import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Checkbox, Descriptions, Input, InputNumber, Modal, Progress, Select, Space, Table, Typography, message } from "antd";
import { getWorkerClient } from "../workers/singleton";
import { useWorkerStore } from "../stores/workerStore";
import { detectReviewInput, fileBase64 } from "../lib/reviewInput";
import { LocalTableInput } from "../components/LocalTableInput";
import { ReviewFindings } from "../components/ReviewFindings";
import type { FinalFields, LoadedTable, Platform, ReviewItem, ReviewMaterial, ReviewSnapshot } from "../types/review";

const { Paragraph, Text } = Typography;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

/** 方向 E 纸块：弹窗内用 h3 级标题，不带编号。 */
function Block({title, no, helper, children, labelledBy}: {title: string; no?: string; helper?: React.ReactNode; children: React.ReactNode; labelledBy?: string}) {
  return <section className="e-block" aria-labelledby={labelledBy}>
    <div className="e-block-head">{no && <span className="e-block-no">{no}</span>}{no ? <h2 id={labelledBy}>{title}</h2> : <h3 id={labelledBy}>{title}</h3>}{helper && <><span className="e-spacer"></span>{helper}</>}</div>
    <div className="e-block-body">{children}</div>
  </section>;
}

function RowEditor({item, reviewer, onReviewer, onUpdate, onClose}: {item: ReviewItem; reviewer: string; onReviewer: (v: string) => void; onUpdate: (v: ReviewItem) => void; onClose: () => void}) {
  const [current, setCurrent] = useState(item);
  const [final, setFinal] = useState<FinalFields>({...item.final});
  const [note, setNote] = useState(item.note);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<ReviewMaterial[]>([]);
  const [totalFound, setTotalFound] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const worker = getWorkerClient();
  const choices = [...new Map([...current.candidates, ...found, ...(current.selected_material ? [current.selected_material] : [])].map(m => [m.id, m])).values()];
  const selected = current.selected_material;
  const valuesDirty = (Object.keys(final) as Array<keyof FinalFields>).some(key => final[key] !== current.final[key]);
  const needsReview = current.requires_review;
  const accept = (updated: ReviewItem) => {setCurrent(updated); setFinal({...updated.final}); setNote(updated.note); setChecked(false); onUpdate(updated);};
  async function select(id: string | null) {
    setBusy(true); setError(null);
    try { accept(await worker.review<ReviewItem>("update", {row_id: item.row_id, patch: {selected_id: id}})); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function search() {
    setBusy(true); setError(null);
    try { const result = await worker.review<{items: ReviewMaterial[]; total: number}>("search", {query}); setFound(result.items); setTotalFound(result.total); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function save(confirm: boolean) {
    setBusy(true); setError(null);
    try {
      const updated = await worker.review<ReviewItem>("update", {row_id: item.row_id, patch: {final, note}});
      onUpdate(updated); setCurrent(updated);
      if (confirm && updated.requires_review) {
        const confirmed = await worker.review<ReviewItem>("confirm", {row_id: item.row_id, reviewer});
        onUpdate(confirmed); message.success("此行已人工确认"); onClose();
      } else { accept(updated); message.success(updated.export_ready ? "已保存，无需人工确认" : "已重新检查，请处理列出的问题"); }
    } catch (e) {setChecked(false); setError(errorText(e));} finally {setBusy(false);}
  }
  const finalLabels: Array<[keyof FinalFields, string]> = [["code", "最终物料编码"], ["name", "最终名称"], ["model", "最终型号 / 规格"], ["footprint", "最终封装"]];
  const designator = item.fields.designator || `源行 ${item.source_row}`;
  return <Modal title={<span style={{display: "flex", alignItems: "center", gap: 12}}>{needsReview ? "处理" : "查看"} {designator}<span className={"e-tag" + (needsReview ? " is-red" : current.confirmed ? " is-green" : "")}>{needsReview ? "需确认" : current.confirmed ? "已处理" : "无需人工确认"}</span></span>}
    open width={1050} onCancel={busy ? undefined : onClose} maskClosable={false} closable={!busy} keyboard={!busy}
    footer={<Space><Button onClick={onClose} disabled={busy}>关闭</Button><Button onClick={() => void save(false)} disabled={busy || (!valuesDirty && note === current.note)}>保存并重新检查</Button>
      {needsReview && <Button type="primary" data-testid="confirm-row" onClick={() => void save(true)} loading={busy} disabled={valuesDirty || !checked || !reviewer.trim()}>确认此项问题已核实</Button>}</Space>}>
    {error && <Alert type="error" showIcon title={error} style={{marginBottom: 12}} />}
    <div className="e-split">
      <Block title="BOM 原始信息（只读）">
        <Descriptions size="small" column={1} items={[
          {key: "model", label: "原型号", children: <code>{item.original_model || "（空）"}</code>},
          {key: "value", label: "原元件值", children: item.fields.value || "（空）"},
          {key: "footprint", label: "原封装", children: item.fields.footprint || "（空）"},
          {key: "ref", label: "位号 / 数量", children: <span className="e-mono">{item.fields.designator} / {item.fields.qty}</span>},
          {key: "tolerance", label: "原精度", children: item.fields.tolerance || "（空）"},
          {key: "maker", label: "原厂商", children: item.fields.manufacturer || "（空）"},
        ]} />
        <details><summary>查看所有源字段与备注</summary><dl className="e-source-fields">{Object.entries(item.source).map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v || "（空）"}</dd></div>)}</dl></details>
      </Block>
      <Block title="系统库记录">
        <Input.Search aria-label="搜索物料库" placeholder="编码、型号或关键词；空格分隔" value={query} onChange={e => setQuery(e.target.value)} onSearch={() => void search()} loading={busy} />
        {query && <Text type="secondary">搜索到 {totalFound} 条（显示前 30 条）</Text>}
        <Select aria-label="物料候选" style={{width: "100%"}} value={current.selected_id ?? ""} disabled={busy}
          onChange={v => void select(v || null)} options={[{value: "", label: "不关联物料 / 保留原型号"}, ...choices.map(m => ({value: m.id, label: `${m.code} · ${m.name} · ${m.spec || "（库规格为空）"}`}))]} />
        <Descriptions size="small" column={1} items={[
          {key: "code", label: "库编码", children: <code>{selected?.code || "（未关联）"}</code>},
          {key: "name", label: "库名称", children: selected?.name || "（空）"},
          {key: "spec", label: "库规格原文", children: <code>{selected?.spec || "（空）"}</code>},
        ]} />
        <p className="e-boundary">{current.candidate_count} 条搜索候选，{current.qualified_count} 条符合已知条件。改变候选后重新判断。</p>
      </Block>
    </div>
    {current.review_findings.length > 0 && <div className={"e-alert " + (current.confirmed ? "is-info" : "is-warning")} style={{margin: "16px 0"}}>
      <span className="e-mark">{current.confirmed ? "i" : "!"}</span>
      <div style={{minWidth: 0}}><p className="e-alert-title">{current.confirmed ? "已核实的问题记录" : "仅以下问题需要人工确认"}</p><div style={{marginTop: 8}}><ReviewFindings findings={current.review_findings} /></div></div>
    </div>}
    {valuesDirty && <Paragraph type="secondary">请先保存修改，系统将重新判断是否仍有需要确认的问题。</Paragraph>}
    <div className="e-split" style={{marginTop: 16}}>
      <Block title="最终输出值（可修改，原始信息不会丢失）">
        <div className="e-field-grid">{finalLabels.map(([key,label]) => <div key={key}><label className="e-field-label" htmlFor={"final-" + key}>{label}</label>
          <Input id={"final-" + key} aria-label={label} value={final[key]} disabled={busy} onChange={e => {setFinal({...final, [key]: e.target.value}); setChecked(false);}} /></div>)}</div>
      </Block>
      {needsReview && <Block title="确认问题">
        <div><label className="e-field-label" htmlFor="reviewer">校对人</label><Input id="reviewer" aria-label="校对人" value={reviewer} maxLength={100} disabled={busy} onChange={e => {onReviewer(e.target.value); setChecked(false);}} /></div>
        <div><label className="e-field-label" htmlFor="review-note">校对 / 保留原因<span className="e-optional">缺失信息或不关联库时必填</span></label><Input.TextArea id="review-note" aria-label="校对说明" value={note} maxLength={2000} rows={2} disabled={busy} onChange={e => {setNote(e.target.value); setChecked(false);}} /></div>
        <Checkbox checked={checked} disabled={busy || valuesDirty} onChange={e => setChecked(e.target.checked)}>我已核实上面列出的问题及最终输出。</Checkbox>
        {current.confirmation && <p className="e-boundary">上次确认：{current.confirmation.reviewer} · {current.confirmation.at}</p>}
      </Block>}
    </div>
  </Modal>;
}

export function ReviewWorkspace() {
  const [bom, setBom] = useState<LoadedTable | null>(null);
  const [material, setMaterial] = useState<LoadedTable | null>(null);
  const [bomReading, setBomReading] = useState(false);
  const [materialReading, setMaterialReading] = useState(false);
  const [platform, setPlatform] = useState<Platform>("auto");
  const [template, setTemplate] = useState<{name: string; b64: string} | null>(null);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [batch, setBatch] = useState(1);
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null);
  const [reviewer, setReviewer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [pendingOnly, setPendingOnly] = useState(true);
  const [search, setSearch] = useState("");
  const engine = useWorkerStore();
  useEffect(() => {getWorkerClient();}, []);
  const format = useMemo(() => {if (!bom) return null; try {return detectReviewInput(bom.rows, platform);} catch {return null;}}, [bom,platform]);
  const ready = engine.mode === "pyodide" && engine.status === "ready";
  const engineFailed = engine.status === "error" || engine.mode === "mock";
  const confirmed = snapshot?.items.filter(i => i.confirmed).length ?? 0;
  const automatic = snapshot?.items.filter(i => i.review_status === "auto_passed").length ?? 0;
  const pending = snapshot?.items.filter(i => !i.export_ready).length ?? 0;
  function updateItem(item: ReviewItem) {setSnapshot(prev => prev ? {...prev, items: prev.items.map(i => i.row_id === item.row_id ? item : i)} : prev);}
  async function start() {
    if (!bom || !format) return;
    setBusy(true); setError(null);
    try { const result = await getWorkerClient().review<ReviewSnapshot>("start", {bom_rows: bom.rows, material_rows: material?.rows ?? null, platform, source_name: bom.file_name, sheet_name: bom.sheet_name}); setSnapshot(result); setPendingOnly(true); setSearch(""); }
    catch (e) {setError(errorText(e));} finally {setBusy(false);}
  }
  async function reset() {
    setBusy(true);
    try {await getWorkerClient().review("clear"); setSnapshot(null); setError(null); setEditing(null);}
    catch (e) {setError(errorText(e));} finally {setBusy(false);}
  }
  async function download(mode: "draft" | "final") {
    if (!snapshot) return;
    setBusy(true); setError(null);
    try {
      const data = await getWorkerClient().review<Uint8Array>("export", {mode, template_b64: template?.b64 ?? null, meta: {title: title || snapshot.source_name.replace(/\.[^.]+$/, ""), batch_size: batch}});
      const bytes = new Uint8Array(data); const url = URL.createObjectURL(new Blob([bytes], {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
      const a = document.createElement("a"); a.href = url; a.download = `BOM_${snapshot.source_name.replace(/\.[^.]+$/, "")}_${mode === "draft" ? "待校对" : "正式"}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      message.success(mode === "draft" ? "已导出待校对稿（不可投产）" : "已导出正式结果与问题处理记录");
    } catch(e) {setError(errorText(e));} finally {setBusy(false);}
  }
  const rows = snapshot?.items.filter(i => (!pendingOnly || !i.export_ready) && (!search || `${i.fields.designator} ${i.original_model} ${i.final.model} ${i.final.code}`.toLowerCase().includes(search.toLowerCase()))) ?? [];
  const templateBlock = <Block no="03" title="输出模板与标题" labelledBy="template-heading" helper={<span className="e-block-helper">全部可选</span>}>
    <div className="e-template-grid">
      <div><label className="e-field-label" htmlFor="template-file">已有中文 BOM 模板<span className="e-optional">可选</span></label>
        <div className={"e-file-cell is-compact" + (template ? " has-file" : " is-empty") + (busy || templateBusy || editing !== null ? " is-disabled" : "")}>
          <input className="e-native-file" id="template-file" data-testid="template-file" aria-label="输出模板" type="file" accept=".xlsx" disabled={busy || templateBusy || editing !== null} onChange={async e => {
            const file = e.target.files?.[0]; setTemplate(null); if (!file) return; setTemplateBusy(true);
            try {setTemplate({name: file.name, b64: await fileBase64(file)});} catch (err) {setError(errorText(err));} finally {setTemplateBusy(false);}
          }} />
          <div className="e-file-hit" aria-hidden="true"><span className="e-file-tag">模板</span><span className="e-file-copy"><span className={"e-file-name" + (template ? "" : " is-placeholder")}>{templateBusy ? "正在读取…" : template?.name ?? "选择 .xlsx 模板"}</span></span><span className="e-file-act">{template ? "更换" : "选择"}</span></div>
        </div></div>
      <div><label className="e-field-label" htmlFor="review-title">本次输出标题</label><Input id="review-title" aria-label="输出标题" placeholder="留空使用输入文件名" value={title} disabled={busy} onChange={e => setTitle(e.target.value)} /></div>
      <div><label className="e-field-label" htmlFor="review-batch">生产套数</label><InputNumber id="review-batch" aria-label="生产套数" min={1} max={1000000} precision={0} value={batch} disabled={busy} onChange={v => setBatch(v ?? 1)} /></div>
    </div>
    <p className="e-block-note">{template ? `已选择：${template.name}` : "未上传模板时使用默认 7 列格式"}。旧明细将清空，保留列布局和样式；附原始输入与校对记录，批量列按本次套数计算。</p>
  </Block>;

  return <main className="e-page e-grid-paper" id="main-content">
    <div className="e-wrap">
      <div className="e-intro">
        <div>
          <p className="e-eyebrow">REVIEW WORKSPACE · 可选入口</p>
          <h1>BOM 校对工作台</h1>
          <p className="e-intro-copy">确定项直接通过，只处理不确定项 · 原文留存 · 不自动合并不同属性的行</p>
        </div>
        <div className="e-intro-meta"><p className="e-meta-label">{snapshot ? "当前文件" : "输出"}</p><p>{snapshot ? `${snapshot.source_name} · ${snapshot.profile.name}` : "默认 7 列中文格式 / 可上传已有模板"}</p></div>
      </div>
      {!ready && <div className={"e-alert " + (engineFailed ? "is-error" : "is-info")} role="status" style={{marginBottom: 16}}>
        <span className="e-mark">{engineFailed ? "×" : "i"}</span>
        <div style={{minWidth: 0, flex: 1}}>
          <p className="e-alert-title">{engine.mode === "mock" ? "校对闭环不支持 mock，请移除网址中的 worker=mock" : engine.errorMessage || "正在加载本地 Python 引擎…"}</p>
          {engine.status !== "error" ? <Progress percent={engine.progress} size="small" /> : <p className="e-alert-body">请确认已准备 Pyodide 资源，再刷新页面。</p>}
        </div>
      </div>}
      {error && <Alert type="error" closable onClose={() => setError(null)} showIcon title={error} style={{marginBottom: 16}} />}

      {!snapshot ? <>
        <div className="e-split">
          <Block no="01" title="选择 BOM" labelledBy="step-1" helper={<span className="e-block-helper">必选</span>}>
            <Select aria-label="EDA 平台" value={platform} disabled={busy} style={{width: "100%"}} onChange={setPlatform}
              options={[{value: "auto", label: "自动识别已支持格式"}, {value: "jlc", label: "嘉立创 EDA"}, {value: "altium", label: "Altium Designer"}, {value: "cadence", label: "Cadence（明细 / 汇总）"}]} />
            <LocalTableInput label="BOM 文件" id="bom-file" value={bom} appearance="e" onChange={setBom} onLoading={setBomReading} disabled={busy} />
            {format && <p className="e-detected" role="status"><span className="e-mark">OK</span>识别为 {format.name}，表头第 {format.header_row_index + 1} 行</p>}
            {bom && !format && <p className="e-file-help is-error" role="alert">未识别到已支持格式，请检查所选平台或工作表</p>}
          </Block>
          <Block no="02" title="选择企业物料库" labelledBy="step-2" helper={<span className="e-block-helper">可选</span>}>
            <LocalTableInput label="物料库文件" id="material-file" value={material} appearance="e" optional onChange={setMaterial} onLoading={setMaterialReading} disabled={busy} />
            <p className="e-block-note">识别「编码、名称、规格型号、禁用状态」。不提供物料库时可校对保留原文；不会生成猜测编码。</p>
          </Block>
        </div>
        <div style={{marginTop: 16}}>{templateBlock}</div>
        <div className="e-workbench">
          <Block no="04" title="本次校对范围" labelledBy="rules-heading" helper={<span className="e-block-helper">检查前先说明</span>}>
            <ul className="e-rule-list">
              <li><span className="e-mark">01</span><span className="e-text"><strong>确定项直接通过。</strong>能唯一匹配库记录的行不打扰你。</span></li>
              <li><span className="e-mark">02</span><span className="e-text"><strong>只处理不确定项。</strong>多候选、参数冲突、缺规格的行以红笔标出。</span></li>
              <li><span className="e-mark">03</span><span className="e-text"><strong>原文留存。</strong>最终值可改，BOM 原始字段不会被覆盖。</span></li>
              <li><span className="e-mark">04</span><span className="e-text"><strong>不自动合并不同属性的行。</strong>合并只发生在分组键一致时。</span></li>
            </ul>
          </Block>
          <Block no="05" title="开始检查" labelledBy="start-heading">
            <p className="e-block-note">检查在本机完成。需要人工确认的项会列出原因与差异，处理后可导出待校对稿或正式结果。</p>
            <div className="e-action-row">
              <div><p className="e-action-title">检查 BOM</p><p className="e-action-detail">{!bom ? "尚未选择 BOM 文件" : !format ? "请先识别到已支持格式" : !ready ? "本地引擎就绪后即可开始" : "需确认项以红笔标出"}</p></div>
              <Button type="primary" size="large" data-testid="start-review" loading={busy} disabled={!bom || !format || !ready || templateBusy || bomReading || materialReading} onClick={() => void start()}>检查 BOM</Button>
            </div>
          </Block>
        </div>
      </> : <>
        <section className="e-block" aria-labelledby="result-heading">
          <div className="e-block-head">
            <span className="e-block-no">01</span>
            <h2 id="result-heading">校对结果</h2>
            <span className="e-spacer"></span>
            <Button onClick={() => void reset()} disabled={busy || editing !== null}>重新导入（清空确认）</Button>
          </div>
          <dl className="e-summary">
            <div className="e-summary-item"><dt>校对行 / 数量合计</dt><dd data-testid="row-summary">{snapshot.items.length} 行 / 数量合计 {snapshot.stats.quantity}</dd></div>
            <div className="e-summary-sep"></div>
            <div className="e-summary-item"><dt>无需人工确认</dt><dd data-testid="automatic-summary">无需人工确认 {automatic}</dd></div>
            <div className="e-summary-sep"></div>
            <div className="e-summary-item"><dt>已处理</dt><dd>{confirmed}</dd></div>
            <div className="e-summary-sep"></div>
            <div className={"e-summary-item" + (pending ? " is-red" : "")}><dt>需确认</dt><dd data-testid="pending-summary">需确认 {pending}</dd></div>
            <div className="e-summary-sep"></div>
            <div className="e-summary-item"><dt>物料库 可用 / 禁用</dt><dd>{snapshot.material_stats.enabled} / {snapshot.material_stats.disabled}</dd></div>
          </dl>
          {(snapshot.material_stats.missing_spec > 0 || snapshot.skipped_rows.some(r => r.text)) && <div className="e-block-body" style={{paddingBottom: 0}}>
            {snapshot.material_stats.missing_spec > 0 && <p className="e-block-note">物料库 {snapshot.material_stats.missing_spec} 条无规格，已保留供编码搜索。</p>}
            {snapshot.skipped_rows.some(r => r.text) && <div className="e-alert is-warning"><span className="e-mark">!</span><div><p className="e-alert-title">原表含表尾备注，请核对（不作为软件指令执行）</p>{snapshot.skipped_rows.filter(r => r.text).map(r => <p className="e-alert-body" key={r.row}>第 {r.row} 行：{r.text}</p>)}</div></div>}
          </div>}
          <div className="e-toolbar">
            <Input.Search aria-label="筛选校对行" placeholder="搜索位号 / 型号 / 编码" value={search} onChange={e => setSearch(e.target.value)} allowClear style={{width: 280}} />
            <Checkbox checked={pendingOnly} onChange={e => setPendingOnly(e.target.checked)}>只看需确认项</Checkbox>
            <span className="e-spacer"></span>
            <Button data-testid="export-draft" loading={busy} disabled={editing !== null || templateBusy} onClick={() => void download("draft")}>导出待校对稿</Button>
            <Button data-testid="export-final" type="primary" disabled={pending > 0 || busy || editing !== null || templateBusy} onClick={() => void download("final")}>导出正式结果</Button>
          </div>
          <Table<ReviewItem> dataSource={rows} rowKey="row_id" size="small" scroll={{x: 1320}} pagination={{pageSize: 15, showSizeChanger: false}}
            rowClassName={i => i.export_ready ? (i.confirmed ? "e-row-done" : "") : "e-row-needs"}
            locale={{emptyText: pendingOnly && pending === 0 ? "没有需要人工确认的项，可直接导出正式结果。" : "没有符合筛选条件的项"}} columns={[
            {title: "源行 / 位号", width: 120, render: (_,i) => <><span className={"e-row-badge" + (i.export_ready ? (i.confirmed ? " is-done" : "") : " is-need")}>第 {i.source_row} 行</span><div className="e-sub">{i.fields.designator}</div></>},
            {title: "数量", dataIndex: ["fields","qty"], width: 56, render: v => <span className="e-mono">{v}</span>},
            {title: "BOM 原型号", dataIndex: "original_model", width: 190},
            {title: "原封装", dataIndex: ["fields","footprint"], width: 100},
            {title: "库型号 / 最终型号", width: 210, render: (_,i) => <><div>{i.selected_material?.spec || <span className="e-empty">未选库记录</span>}</div><div className="e-sub">最终：{i.final.model}</div></>},
            {title: "最终编码", dataIndex: ["final","code"], width: 130, render: v => <span className="e-mono">{v || "—"}</span>},
            {title: "需要确认的原因与差异", width: 400, render: (_,i) => <>{i.confirmed && <span className="e-tag is-green" style={{marginBottom: 6}}>已处理</span>}<ReviewFindings findings={i.review_findings} /></>},
            {title: "操作", width: 96, fixed: "right", render: (_,i) => <Button type={i.export_ready ? "default" : "primary"} data-testid={`review-row-${i.row_id}`} disabled={busy} onClick={() => setEditing(i.row_id)}>{i.export_ready ? "查看" : "处理"}</Button>},
          ]} />
        </section>
        <div style={{marginTop: 16}}>{templateBlock}</div>
        {editing !== null && snapshot.items[editing] && <RowEditor key={editing} item={snapshot.items[editing]} reviewer={reviewer} onReviewer={setReviewer} onUpdate={updateItem} onClose={() => setEditing(null)} />}
      </>}
      <footer className="e-page-foot"><span>方向 E / 红笔校对 · 红色只用于需要人工判断的行</span><span>本机处理 · 结果不代表生产审批</span></footer>
    </div>
  </main>;
}
