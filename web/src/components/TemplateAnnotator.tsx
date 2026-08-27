/**
 * 输出模板标注：上传公司现有 xlsx，预览前 20 行，点选数据起始行、
 * 列字段与表头区 meta_cells，生成契约 3.2 的 output_template Profile。
 */
import { useCallback, useState, type CSSProperties } from "react";
import { Button, Input, Select, Upload, message } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import type { OutputTemplateProfile } from "../types/contracts";
import { annotatorFromFile } from "./annotatorLoad";
import { emptyAnnotator, emitAnnotator, type AnnotatorLocal } from "./annotatorState";
import { cellRef, indexToColLetter } from "../lib/colLetters";
import { maxColumnCount, padRow } from "../lib/templateColumns";
import { guessOutputColumns } from "../lib/templateGuess";
import { OUTPUT_COLUMN_FIELD_OPTIONS } from "../lib/templateFieldOptions";
import { META_CELL_FIELD_OPTIONS, TEMPLATE_PREVIEW_ROWS } from "../lib/templateMeta";
import { saveProfileGuarded } from "../lib/profileGuard";
import { readXlsxRows } from "../lib/xlsx";
import { base64ToArrayBuffer } from "../lib/templateB64";
import { isCustomTemplateReady } from "../lib/templateReady";
import { buildOutputTemplateProfile } from "../lib/templateBuild";

interface TemplateAnnotatorProps {
  onChange: (profile: OutputTemplateProfile) => void;
}

const thStyle: CSSProperties = {
  border: "1px solid #f0f0f0",
  padding: 6,
  background: "#fafafa",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  border: "1px solid #f0f0f0",
  padding: "4px 8px",
  maxWidth: 160,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export function TemplateAnnotator({ onChange }: TemplateAnnotatorProps) {
  const [state, setState] = useState<AnnotatorLocal>(() => emptyAnnotator());
  const [selectedMetaRef, setSelectedMetaRef] = useState<string | null>(null);

  const commit = useCallback(
    (next: AnnotatorLocal) => {
      setState(next);
      emitAnnotator(next, onChange);
    },
    [onChange]
  );

  async function handleUpload(file: File) {
    try {
      const next = await annotatorFromFile(await file.arrayBuffer(), file.name);
      setSelectedMetaRef(null);
      commit(next);
    } catch (err) {
      message.error(`读取模板失败：${err instanceof Error ? err.message : String(err)}`);
    }
    return false;
  }

  async function handleSheetChange(sheetIndex: number) {
    if (!state.baseXlsxB64) return;
    try {
      const buffer = base64ToArrayBuffer(state.baseXlsxB64);
      const name = state.sheetNames[sheetIndex];
      const payload = await readXlsxRows(buffer, name);
      const preview = payload.rows.slice(0, TEMPLATE_PREVIEW_ROWS);
      const columnCount = maxColumnCount(preview);
      const dataStartRow = Math.min(state.dataStartRow, Math.max(1, preview.length + 1));
      const header = dataStartRow > 1 ? padRow(preview[dataStartRow - 2] ?? [], columnCount) : [];
      commit({
        ...state,
        sheetIndex,
        previewRows: preview,
        columnCount,
        dataStartRow,
        columns: header.length ? guessOutputColumns(header) : {},
      });
    } catch (err) {
      message.error(`切换工作表失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function handleDataStart(excelRow: number) {
    const header = excelRow > 1 ? padRow(state.previewRows[excelRow - 2] ?? [], state.columnCount) : [];
    commit({
      ...state,
      dataStartRow: excelRow,
      columns: header.length ? guessOutputColumns(header) : state.columns,
    });
  }

  function handleSave() {
    try {
      const profile = buildOutputTemplateProfile({
        id: state.id,
        name: state.name,
        sheetIndex: state.sheetIndex,
        dataStartRow: state.dataStartRow,
        columns: state.columns,
        metaCells: state.metaCells,
        baseXlsxB64: state.baseXlsxB64,
        columnCount: state.columnCount,
      });
      if (!isCustomTemplateReady(profile)) {
        message.error("请先上传模板，点选数据起始行并至少映射一列");
        return;
      }
      saveProfileGuarded(profile);
      onChange(profile);
      message.success("已保存到本机（localStorage）");
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  }

  const letters = Array.from({ length: state.columnCount }, (_, i) => indexToColLetter(i));
  const hasFile = Boolean(state.baseXlsxB64);

  return (
    <div>
      <Upload.Dragger beforeUpload={handleUpload} maxCount={1} accept=".xlsx,.xls">
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p>点击或拖拽公司现有 BOM 模板（xlsx）到此处</p>
        <p style={{ color: "#888", fontSize: 12 }}>文件只在本机解析，不会上传</p>
      </Upload.Dragger>

      {hasFile && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <Input
              style={{ maxWidth: 280 }}
              value={state.name}
              onChange={(e) => commit({ ...state, name: e.target.value })}
              placeholder="模板名称"
            />
            {state.sheetNames.length > 1 && (
              <Select
                style={{ minWidth: 160 }}
                value={state.sheetIndex}
                options={state.sheetNames.map((n, i) => ({ value: i, label: n }))}
                onChange={handleSheetChange}
              />
            )}
            <span style={{ color: "#888", lineHeight: "32px" }}>
              数据起始行：第 {state.dataStartRow} 行（点左侧行号选择）
            </span>
          </div>

          <div style={{ overflowX: "auto", border: "1px solid #f0f0f0" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: "100%" }}>
              <thead>
                <tr>
                  <th style={thStyle}>行</th>
                  {letters.map((letter) => (
                    <th key={letter} style={thStyle}>
                      <div>{letter}</div>
                      <Select
                        size="small"
                        allowClear
                        style={{ minWidth: 120 }}
                        placeholder="留空"
                        value={state.columns[letter] ?? undefined}
                        options={OUTPUT_COLUMN_FIELD_OPTIONS}
                        onChange={(value) =>
                          commit({
                            ...state,
                            columns: { ...state.columns, [letter]: value ?? null },
                          })
                        }
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.previewRows.map((row, i) => {
                  const excelRow = i + 1;
                  const isStart = excelRow === state.dataStartRow;
                  const isHeaderZone = excelRow < state.dataStartRow;
                  const padded = padRow(row, state.columnCount);
                  return (
                    <tr key={excelRow} style={{ background: isStart ? "#e6f4ff" : undefined }}>
                      <td
                        style={{ ...tdStyle, cursor: "pointer", fontWeight: isStart ? 600 : 400 }}
                        onClick={() => handleDataStart(excelRow)}
                        title="设为数据起始行"
                      >
                        {excelRow}
                      </td>
                      {padded.map((cell, colIndex) => {
                        const ref = cellRef(colIndex, excelRow);
                        const metaKey = state.metaCells[ref];
                        const selected = selectedMetaRef === ref;
                        return (
                          <td
                            key={ref}
                            style={{
                              ...tdStyle,
                              cursor: isHeaderZone ? "pointer" : "default",
                              background: metaKey ? "#fff7e6" : selected ? "#f6ffed" : undefined,
                            }}
                            onClick={() => {
                              if (isHeaderZone) setSelectedMetaRef(ref);
                            }}
                            title={isHeaderZone ? "点选标注表头单元格（meta_cells）" : undefined}
                          >
                            {cell}
                            {metaKey ? (
                              <div style={{ color: "#d46b08", fontSize: 10 }}>{metaKey}</div>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selectedMetaRef && (
            <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
              <span>单元格 {selectedMetaRef}：</span>
              <Select
                allowClear
                style={{ minWidth: 240 }}
                placeholder="标注为元数据字段"
                value={state.metaCells[selectedMetaRef]}
                options={META_CELL_FIELD_OPTIONS}
                onChange={(value) => {
                  const metaCells = { ...state.metaCells };
                  if (!value) delete metaCells[selectedMetaRef];
                  else metaCells[selectedMetaRef] = value;
                  commit({ ...state, metaCells });
                }}
              />
              <Button size="small" onClick={() => setSelectedMetaRef(null)}>
                完成
              </Button>
            </div>
          )}

          <Button style={{ marginTop: 12 }} onClick={handleSave}>
            保存此模板到本机
          </Button>
        </div>
      )}
    </div>
  );
}
