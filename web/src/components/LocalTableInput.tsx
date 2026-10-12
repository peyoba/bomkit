import { useState } from "react";
import { CloseOutlined } from "@ant-design/icons";
import { Select, Space, Typography, message } from "antd";
import { loadTable } from "../lib/reviewInput";
import type { LoadedTable } from "../types/review";

const { Text } = Typography;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

interface LocalTableInputProps {
  label: string;
  id: string;
  value: LoadedTable | null;
  onChange: (value: LoadedTable | null) => void;
  onLoading: (loading: boolean) => void;
  disabled: boolean;
  /** "e"：方向 E 文件格；"default"：旧版裸输入，仅供未接入新样式的页面使用。 */
  appearance?: "default" | "e";
  optional?: boolean;
  /** 文件格左侧的等宽短标签，如 BOM / 库 / 模板。 */
  tag?: string;
  compact?: boolean;
  /** 受控的原始 File，由上层共享 store 持有；省略时退回组件内部状态。 */
  file?: File | null;
  onFileChange?: (file: File | null) => void;
}

export function LocalTableInput({label, id, value, onChange, onLoading, disabled, appearance = "default", optional = false, tag, compact = false, file: controlledFile, onFileChange}: LocalTableInputProps) {
  // File 无法从 LoadedTable 还原；由 store 受控后，跨入口切换仍能继续换工作表。
  const [innerFile, setInnerFile] = useState<File | null>(null);
  const file = controlledFile === undefined ? innerFile : controlledFile;
  const setFile = (next: File | null) => { setInnerFile(next); onFileChange?.(next); };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const read = async (f: File, sheet?: string) => {
    setLoading(true); onLoading(true); onChange(null); setError(null);
    try {onChange(await loadTable(f, sheet));} catch (e) {
      const text = errorText(e);
      setError(text);
      if (appearance === "default") message.error(text);
    } finally {setLoading(false); onLoading(false);}
  };
  const input = <input id={id} data-testid={id} type="file" accept=".xlsx,.txt,.tsv,.csv"
    aria-label={label} aria-invalid={!!error} aria-describedby={appearance === "e" ? id + "-help" : undefined}
    className={appearance === "e" ? "e-native-file" : undefined} disabled={disabled || loading}
    onChange={e => {
      const selected = e.target.files?.[0];
      if (selected) {setFile(selected); void read(selected);}
      else {setFile(null); setError(null); onChange(null);}
    }} />;
  const sheetPicker = value && value.sheet_names.length > 1 ? <Select aria-label={label + "工作表"} value={value.sheet_name}
    disabled={disabled || loading} style={appearance === "e" ? {width: "100%"} : undefined}
    options={value.sheet_names.map(name => ({label: name, value: name}))}
    onChange={sheet => {if (file) void read(file, sheet);}} /> : null;

  if (appearance === "e") {
    const state = (loading ? " is-loading" : "") + (disabled ? " is-disabled" : "") + (error ? " is-error" : "") + (value ? " has-file" : " is-empty") + (compact ? " is-compact" : "");
    const placeholder = "选择" + (optional ? "物料表" : "BOM 文件");
    return <div className="e-file-field">
      <label className="e-field-label" htmlFor={id}>{label}{optional && <span className="e-optional">可选</span>}</label>
      <div className={"e-file-cell" + state}>
        {input}
        <div className="e-file-hit" aria-hidden="true">
          <span className="e-file-tag">{tag ?? (optional ? "库" : "BOM")}</span>
          <span className="e-file-copy">
            <span className={"e-file-name" + (value || error ? "" : " is-placeholder")} title={value?.file_name || file?.name}>
              {loading ? "正在读取本地文件…" : value?.file_name || (error ? file?.name : placeholder)}
            </span>
            <span className="e-file-meta">{value ? value.rows.length + " 行（含表头）" + (value.encoding ? " · " + value.encoding : "") : optional ? "金蝶完整 / 旧简易格式" : "XLSX · TXT · TSV · CSV"}</span>
          </span>
          <span className="e-file-act">{loading ? "读取中" : value || error ? "更换" : "选择"}</span>
        </div>
        {(value || file) && !loading && <button type="button" className="e-clear-file" aria-label={"清除" + label}
          disabled={disabled} onClick={() => {
            const element = document.getElementById(id) as HTMLInputElement | null;
            if (element) element.value = "";
            setFile(null); setError(null); onChange(null);
          }}><CloseOutlined /></button>}
      </div>
      <div id={id + "-help"} className={"e-file-help" + (error ? " is-error" : "")} role={error ? "alert" : undefined}>
        {error || (value ? <span>本地文件已读取 · {value.sheet_name}</span> : optional ? "不选也能生成 Excel" : "文件不上传服务器")}
      </div>
      {sheetPicker && <div style={{marginTop: 8}}>{sheetPicker}</div>}
    </div>;
  }

  return <div className="file-input">
    <label htmlFor={id}><strong>{label}</strong></label>
    {input}
    {loading && <Text>正在读取本地文件…</Text>}
    {value && <Space wrap>
      <Text type="secondary">{value.file_name} · {value.rows.length} 行（含表头）{value.encoding ? " · " + value.encoding : ""}</Text>
      {sheetPicker}
    </Space>}
  </div>;
}
