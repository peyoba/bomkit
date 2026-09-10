import { useState } from "react";
import { CloseOutlined, FileExcelOutlined, LoadingOutlined } from "@ant-design/icons";
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
  appearance?: "default" | "a";
  optional?: boolean;
}

export function LocalTableInput({label, id, value, onChange, onLoading, disabled, appearance = "default", optional = false}: LocalTableInputProps) {
  const [file, setFile] = useState<File | null>(null);
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
    aria-label={label} aria-invalid={!!error} aria-describedby={appearance === "a" ? id + "-help" : undefined}
    className={appearance === "a" ? "a-native-file" : undefined} disabled={disabled || loading}
    onChange={e => {
      const selected = e.target.files?.[0];
      if (selected) {setFile(selected); void read(selected);}
      else {setFile(null); setError(null); onChange(null);}
    }} />;
  const sheetPicker = value && value.sheet_names.length > 1 ? <Select aria-label={label + "工作表"} value={value.sheet_name}
    disabled={disabled || loading} className={appearance === "a" ? "a-sheet-picker" : undefined}
    options={value.sheet_names.map(name => ({label: name, value: name}))}
    onChange={sheet => {if (file) void read(file, sheet);}} /> : null;

  if (appearance === "a") return <div className="a-file-field">
    <label className="a-field-label" htmlFor={id}>{label}{optional && <span>可选</span>}</label>
    <div className={"a-file-shell" + (loading ? " is-loading" : "") + (disabled ? " is-disabled" : "") + (error ? " is-error" : "") + (value ? " has-file" : "")}>
      {input}
      <div className="a-file-face" aria-hidden="true">
        <span className="a-file-icon">{loading ? <LoadingOutlined spin /> : <FileExcelOutlined />}</span>
        <span className="a-file-copy"><span className="a-file-name" title={value?.file_name || file?.name}>
          {loading ? "正在读取本地文件…" : value?.file_name || (error ? file?.name : "选择" + (optional ? "物料表" : "BOM 文件"))}
        </span><span className="a-file-meta">{value ? value.rows.length + " 行（含表头）" + (value.encoding ? " · " + value.encoding : "") : optional ? "金蝶完整 / 旧简易格式" : "XLSX · TXT · TSV · CSV"}</span></span>
        <span className="a-file-change">{loading ? "读取中" : value || error ? "更换" : "选择"}</span>
      </div>
      {(value || file) && !loading && <button type="button" className="a-clear-file" aria-label={"清除" + label}
        disabled={disabled} onClick={() => {
          const element = document.getElementById(id) as HTMLInputElement | null;
          if (element) element.value = "";
          setFile(null); setError(null); onChange(null);
        }}><CloseOutlined /></button>}
    </div>
    <div id={id + "-help"} className={"a-file-help" + (error ? " a-error-text" : "")} role={error ? "alert" : undefined}>
      {error || (value ? <span>本地文件已读取 · {value.sheet_name}</span> : optional ? "不选也能生成 Excel" : "文件不上传服务器")}
    </div>
    {sheetPicker}
  </div>;

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
