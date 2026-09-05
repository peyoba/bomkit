import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Checkbox, Descriptions, Input, InputNumber, Modal, Progress, Select, Space, Table, Tag, Typography, message } from "antd";
import { getWorkerClient } from "../workers/singleton";
import { useWorkerStore } from "../stores/workerStore";
import { detectReviewInput, fileBase64, loadTable } from "../lib/reviewInput";
import type { FinalFields, LoadedTable, Platform, ReviewItem, ReviewMaterial, ReviewSnapshot } from "../types/review";

const { Title, Paragraph, Text } = Typography;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

function FileInput({ label, id, value, onChange, onLoading, disabled }: {label: string; id: string; value: LoadedTable | null; onChange: (v: LoadedTable | null) => void; onLoading: (v: boolean) => void; disabled: boolean}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const read = async (f: File, sheet?: string) => {
    setLoading(true); onLoading(true); onChange(null);
    try { onChange(await loadTable(f, sheet)); } catch (e) { message.error(errorText(e)); }
    finally { setLoading(false); onLoading(false); }
  };
  return <div className="file-input">
    <label htmlFor={id}><strong>{label}</strong></label>
    <input id={id} data-testid={id} type="file" accept=".xlsx,.txt,.tsv,.csv" disabled={disabled || loading}
      onChange={e => { const selected = e.target.files?.[0]; if (selected) { setFile(selected); void read(selected); } else { setFile(null); onChange(null); } }} />
    {loading && <Text>正在读取本地文件…</Text>}
    {value && <Space wrap>
      <Text type="secondary">{value.file_name} · {value.rows.length} 行（含表头）{value.encoding ? ` · ${value.encoding}` : ""}</Text>
      {value.sheet_names.length > 1 && <Select aria-label={`${label}工作表`} value={value.sheet_name} disabled={disabled || loading}
        options={value.sheet_names.map(name => ({label: name, value: name}))}
        onChange={sheet => { if (file) void read(file, sheet); }} />}
    </Space>}
  </div>;
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
      if (confirm) {
        const confirmed = await worker.review<ReviewItem>("confirm", {row_id: item.row_id, reviewer});
        onUpdate(confirmed); message.success("此行已人工确认"); onClose();
      } else { accept(updated); message.success("已保存，需重新确认"); }
    } catch (e) {setChecked(false); setError(errorText(e));} finally {setBusy(false);}
  }
  const finalLabels: Array<[keyof FinalFields, string]> = [["code", "最终物料编码"], ["name", "最终名称"], ["model", "最终型号 / 规格"], ["footprint", "最终封装"]];
  return <Modal title={`校对 ${item.fields.designator || `源行 ${item.source_row}`}`} open width={1050}
    onCancel={busy ? undefined : onClose} maskClosable={false} closable={!busy} keyboard={!busy}
    footer={<Space><Button onClick={onClose} disabled={busy}>关闭</Button><Button onClick={() => void save(false)} disabled={busy}>保存修改（不确认）</Button>
      <Button type="primary" data-testid="confirm-row" onClick={() => void save(true)} loading={busy} disabled={!checked || !reviewer.trim()}>确认此行</Button></Space>}>
    {error && <Alert type="error" showIcon title={error} style={{marginBottom: 12}} />}
    <div className="review-columns">
      <Card size="small" title="BOM 原始信息（只读）">
        <Descriptions size="small" column={1} items={[
          {key: "model", label: "原型号", children: <Text code mark={!!selected && selected.spec !== item.original_model}>{item.original_model || "（空）"}</Text>},
          {key: "value", label: "原元件值", children: item.fields.value || "（空）"},
          {key: "footprint", label: "原封装", children: item.fields.footprint || "（空）"},
          {key: "ref", label: "位号 / 数量", children: `${item.fields.designator} / ${item.fields.qty}`},
          {key: "tolerance", label: "原精度", children: item.fields.tolerance || "（空）"},
          {key: "maker", label: "原厂商", children: item.fields.manufacturer || "（空）"},
        ]} />
        <details><summary>查看所有源字段与备注</summary><dl className="source-fields">{Object.entries(item.source).map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v || "（空）"}</dd></div>)}</dl></details>
      </Card>
      <Card size="small" title="系统库候选（不等于已确认）">
        <Input.Search aria-label="搜索物料库" placeholder="编码、型号或关键词；空格分隔" value={query} onChange={e => setQuery(e.target.value)} onSearch={() => void search()} loading={busy} />
        {query && <Text type="secondary">搜索到 {totalFound} 条（显示前 30 条）</Text>}
        <Select aria-label="物料候选" style={{width: "100%", margin: "12px 0"}} value={current.selected_id ?? ""} disabled={busy}
          onChange={v => void select(v || null)} options={[{value: "", label: "不关联物料 / 保留原型号"}, ...choices.map(m => ({value: m.id, label: `${m.code} · ${m.name} · ${m.spec || "（库规格为空）"}`}))]} />
        <Descriptions size="small" column={1} items={[
          {key: "code", label: "库编码", children: selected?.code || "（未关联）"},
          {key: "name", label: "库名称", children: selected?.name || "（空）"},
          {key: "spec", label: "库规格原文", children: <Text code mark={!!selected && selected.spec !== item.original_model}>{selected?.spec || "（空）"}</Text>},
        ]} />
        <Text type="secondary">{current.candidate_count} 条自动候选；更多记录可搜索。改变候选会撤销之前的确认。</Text>
      </Card>
    </div>
    <Alert type="warning" showIcon title="差异与核对提示" description={<ul>{current.differences.length ? current.differences.map(d => <li key={d}>{d}</li>) : <li>原型号文本一致，仍请核对编码、参数与实际用途。</li>}</ul>} style={{margin: "16px 0"}} />
    <div className="review-columns">
      <Card size="small" title="最终输出值（可修改，原始信息不会丢失）">{finalLabels.map(([key,label]) => <label className="field-label" key={key}>{label}
        <Input aria-label={label} value={final[key]} disabled={busy} onChange={e => {setFinal({...final, [key]: e.target.value}); setChecked(false);}} /></label>)}
      </Card>
      <Card size="small" title="确认">
        <label className="field-label">校对人<Input aria-label="校对人" value={reviewer} maxLength={100} disabled={busy} onChange={e => {onReviewer(e.target.value); setChecked(false);}} /></label>
        <label className="field-label">校对 / 保留原因（缺失信息或不关联库时必填）<Input.TextArea aria-label="校对说明" value={note} maxLength={2000} rows={3} disabled={busy} onChange={e => {setNote(e.target.value); setChecked(false);}} /></label>
        <Checkbox checked={checked} disabled={busy} onChange={e => setChecked(e.target.checked)}>我已核对本行全部原始属性、库规格、最终值及所有提示，确认本次输出。</Checkbox>
        {current.confirmation && <Paragraph type="secondary">上次确认：{current.confirmation.reviewer} · {current.confirmation.at}</Paragraph>}
      </Card>
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
  const [pendingOnly, setPendingOnly] = useState(false);
  const [search, setSearch] = useState("");
  const engine = useWorkerStore();
  useEffect(() => {getWorkerClient();}, []);
  const format = useMemo(() => {if (!bom) return null; try {return detectReviewInput(bom.rows, platform);} catch {return null;}}, [bom,platform]);
  const ready = engine.mode === "pyodide" && engine.status === "ready";
  const confirmed = snapshot?.items.filter(i => i.confirmed).length ?? 0;
  const pending = (snapshot?.items.length ?? 0) - confirmed;
  function updateItem(item: ReviewItem) {setSnapshot(prev => prev ? {...prev, items: prev.items.map(i => i.row_id === item.row_id ? item : i)} : prev);}
  async function start() {
    if (!bom || !format) return;
    setBusy(true); setError(null);
    try { const result = await getWorkerClient().review<ReviewSnapshot>("start", {bom_rows: bom.rows, material_rows: material?.rows ?? null, platform, source_name: bom.file_name, sheet_name: bom.sheet_name}); setSnapshot(result); }
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
      const a = document.createElement("a"); a.href = url; a.download = `BOM_${snapshot.source_name.replace(/\.[^.]+$/, "")}_${mode === "draft" ? "待校对" : "已确认"}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      message.success(mode === "draft" ? "已导出待校对稿（不可投产）" : "已导出确认结果与校对记录");
    } catch(e) {setError(errorText(e));} finally {setBusy(false);}
  }
  const rows = snapshot?.items.filter(i => (!pendingOnly || !i.confirmed) && (!search || `${i.fields.designator} ${i.original_model} ${i.final.model} ${i.final.code}`.toLowerCase().includes(search.toLowerCase()))) ?? [];
  return <main className="workspace">
    <Title level={2}>BOM 校对工作台</Title>
    <Paragraph type="secondary">本地处理 · 原文留存 · 系统推荐不是人工确认 · 不自动合并不同属性的行</Paragraph>
    {!ready && <Alert type={engine.status === "error" || engine.mode === "mock" ? "error" : "info"} showIcon
      title={engine.mode === "mock" ? "校对闭环不支持 mock，请移除网址中的 worker=mock" : engine.errorMessage || "正在加载本地 Python 引擎…"}
      description={engine.status !== "error" ? <Progress percent={engine.progress} /> : "请确认已准备 Pyodide 资源，再刷新页面。"} />}
    {error && <Alert type="error" closable onClose={() => setError(null)} showIcon title={error} style={{margin: "12px 0"}} />}
    {!snapshot ? <>
      <div className="review-columns">
        <Card title="1. 选择 BOM">
          <Select aria-label="EDA 平台" value={platform} disabled={busy} style={{width: "100%", marginBottom: 12}} onChange={setPlatform}
            options={[{value: "auto", label: "自动识别已支持格式"}, {value: "jlc", label: "嘉立创 EDA"}, {value: "altium", label: "Altium Designer"}, {value: "cadence", label: "Cadence（明细 / 汇总）"}]} />
          <FileInput label="BOM 文件" id="bom-file" value={bom} onChange={setBom} onLoading={setBomReading} disabled={busy} />
          {format && <Alert type="success" title={`识别为 ${format.name}，表头第 ${format.header_row_index + 1} 行`} />}
          {bom && !format && <Alert type="warning" title="未识别到已支持格式，请检查所选平台或工作表" />}
        </Card>
        <Card title="2. 选择企业物料库">
          <FileInput label="物料库文件（可选）" id="material-file" value={material} onChange={setMaterial} onLoading={setMaterialReading} disabled={busy} />
          <Paragraph type="secondary">识别“编码、名称、规格型号、禁用状态”。不提供物料库时可校对保留原文；不会生成猜测编码。</Paragraph>
        </Card>
      </div>
    </> : <Card size="small" title={`${snapshot.profile.name} · ${snapshot.source_name}`} extra={<Button onClick={() => void reset()} disabled={busy || editing !== null}>重新导入（清空确认）</Button>}>
      <Space wrap size="large"><Text strong data-testid="row-summary">{snapshot.items.length} 行 / 数量合计 {snapshot.stats.quantity}</Text><Text>已确认 {confirmed}</Text><Text type="warning" data-testid="pending-summary">待校对 {pending}</Text><Text>物料库 {snapshot.material_stats.enabled} 条可用 / {snapshot.material_stats.disabled} 条禁用</Text></Space>
      {snapshot.material_stats.missing_spec > 0 && <Paragraph type="secondary">物料库 {snapshot.material_stats.missing_spec} 条无规格，已保留供编码搜索。</Paragraph>}
      {snapshot.skipped_rows.some(r => r.text) && <Alert type="warning" title="原表含表尾备注，请核对（不作为软件指令执行）" description={snapshot.skipped_rows.filter(r => r.text).map(r => <p key={r.row}>第 {r.row} 行：{r.text}</p>)} />}
    </Card>}
    <Card title="输出模板与标题" size="small" style={{margin: "16px 0"}}>
      <div className="template-controls">
        <label>已有中文 BOM 模板（可选）<input data-testid="template-file" aria-label="输出模板" type="file" accept=".xlsx" disabled={busy || templateBusy || editing !== null} onChange={async e => {
          const file = e.target.files?.[0]; setTemplate(null); if (!file) return; setTemplateBusy(true);
          try {setTemplate({name: file.name, b64: await fileBase64(file)});} catch (err) {setError(errorText(err));} finally {setTemplateBusy(false);}
        }} /></label>
        <label>本次输出标题<Input aria-label="输出标题" placeholder="留空使用输入文件名" value={title} disabled={busy} onChange={e => setTitle(e.target.value)} /></label>
        <label>生产套数<InputNumber aria-label="生产套数" min={1} max={1000000} precision={0} value={batch} disabled={busy} onChange={v => setBatch(v ?? 1)} /></label>
      </div>
      <Text type="secondary">{template ? `已选择：${template.name}` : "未上传时使用默认 7 列格式"}。旧明细将清空，保留列布局和样式；附原始输入与校对记录，批量列按本次套数计算。</Text>
    </Card>
    {!snapshot && <Button type="primary" size="large" data-testid="start-review" loading={busy} disabled={!bom || !format || !ready || templateBusy || bomReading || materialReading} onClick={() => void start()}>读取并开始校对</Button>}
    {snapshot && <>
      <Space wrap style={{marginBottom: 16}}>
        <Input.Search aria-label="筛选校对行" placeholder="搜索位号 / 型号 / 编码" value={search} onChange={e => setSearch(e.target.value)} allowClear />
        <Checkbox checked={pendingOnly} onChange={e => setPendingOnly(e.target.checked)}>只看未确认</Checkbox>
        <Button data-testid="export-draft" loading={busy} disabled={editing !== null || templateBusy} onClick={() => void download("draft")}>导出待校对稿</Button>
        <Button data-testid="export-final" type="primary" disabled={pending > 0 || busy || editing !== null || templateBusy} onClick={() => void download("final")}>导出正式结果</Button>
      </Space>
      <Table<ReviewItem> dataSource={rows} rowKey="row_id" size="small" scroll={{x: 1180}} pagination={{pageSize: 15, showSizeChanger: false}} columns={[
        {title: "源行 / 位号", width: 150, render: (_,i) => <><Text type="secondary">第 {i.source_row} 行</Text><div>{i.fields.designator}</div></>},
        {title: "数量", dataIndex: ["fields","qty"], width: 65},
        {title: "BOM 原型号", dataIndex: "original_model", width: 200},
        {title: "原封装", dataIndex: ["fields","footprint"], width: 130},
        {title: "库型号 / 最终型号", width: 250, render: (_,i) => <><div>{i.selected_material?.spec || "未选库记录"}</div><Text type="secondary">最终：{i.final.model}</Text></>},
        {title: "最终编码", dataIndex: ["final","code"], width: 170},
        {title: "状态", width: 150, render: (_,i) => <><Tag color={i.confirmed ? "green" : "orange"}>{i.confirmed ? "已人工确认" : "待校对"}</Tag><div>{i.differences.length} 项提示</div></>},
        {title: "操作", width: 100, fixed: "right", render: (_,i) => <Button data-testid={`review-row-${i.row_id}`} disabled={busy} onClick={() => setEditing(i.row_id)}>校对</Button>},
      ]} />
      {editing !== null && snapshot.items[editing] && <RowEditor key={editing} item={snapshot.items[editing]} reviewer={reviewer} onReviewer={setReviewer} onUpdate={updateItem} onClose={() => setEditing(null)} />}
    </>}
  </main>;
}
