import { useState } from "react";
import { Select, Space, Typography, message } from "antd";
import { loadTable } from "../lib/reviewInput";
import type { LoadedTable } from "../types/review";
const { Text } = Typography;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export function LocalTableInput({ label, id, value, onChange, onLoading, disabled }: {label: string; id: string; value: LoadedTable | null; onChange: (v: LoadedTable | null) => void; onLoading: (v: boolean) => void; disabled: boolean}) {
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
