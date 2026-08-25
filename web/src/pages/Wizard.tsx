/**
 * 转换向导：AntD Steps 四步。骨架阶段使用 mock Worker 跑通全流程（见
 * docs/04-agent-tasks.md T2 任务 5）。BOM_FIELD_OPTIONS/MATERIAL_FIELD_OPTIONS
 * 与 core/src/bomcore/schema.py 的字段注册表一一对应，任何一侧新增字段都要
 * 同步另一侧。
 */
import { useState } from "react";
import { Button, Steps, Upload, message } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { v4 as uuidv4 } from "uuid";
import { readXlsxRows } from "../lib/xlsx";
import { detect } from "../lib/detect";
import { MappingTable } from "../components/MappingTable";
import { useWizardStore } from "../stores/wizardStore";
import { createMockWorkerClient } from "../workers/mockWorkerClient";
import type { DetectColumn, InputProfile } from "../types/contracts";

const BOM_FIELD_OPTIONS = [
  { value: "designator", label: "位号 (designator)" },
  { value: "qty", label: "数量 (qty)" },
  { value: "value", label: "值/名称 (value)" },
  { value: "footprint", label: "封装 (footprint)" },
  { value: "mpn", label: "料号/型号 (mpn)" },
  { value: "manufacturer", label: "厂商 (manufacturer)" },
  { value: "description", label: "备注 (description)" },
  { value: "category", label: "类别 (category)" },
  { value: "tolerance", label: "精度 (tolerance)" },
];

const MATERIAL_FIELD_OPTIONS = [
  { value: "code", label: "物料编码 (code)" },
  { value: "name", label: "物料名称 (name)" },
  { value: "spec", label: "规格型号 (spec)" },
  { value: "status", label: "禁用状态 (status)" },
  { value: "category", label: "类别 (category)" },
];

const mockWorker = createMockWorkerClient();

function buildProfile(
  kind: "bom_input" | "material_input",
  headerRowIndex: number,
  columns: DetectColumn[]
): InputProfile {
  const columnMap: Record<string, string> = {};
  for (const c of columns) {
    if (c.guess_field) columnMap[c.source] = c.guess_field;
  }
  return {
    schema_version: 1,
    kind,
    id: uuidv4(),
    name: kind === "bom_input" ? "未命名BOM映射" : "未命名物料库映射",
    builtin: false,
    header_fingerprint: null,
    header_row_index: headerRowIndex,
    column_map: columnMap,
    options: kind === "bom_input" ? { dnp_markers: ["DNP"] } : { skip_disabled: true },
  };
}

export function Wizard() {
  const { step, setStep, setBom, setMaterial, setAnalyzeResult } = useWizardStore();
  const [bomColumns, setBomColumns] = useState<DetectColumn[] | null>(null);
  const [bomHeaderRowIndex, setBomHeaderRowIndex] = useState(0);
  const [bomRawRows, setBomRawRows] = useState<string[][] | null>(null);
  const [materialColumns, setMaterialColumns] = useState<DetectColumn[] | null>(null);
  const [materialHeaderRowIndex, setMaterialHeaderRowIndex] = useState(0);
  const [materialRawRows, setMaterialRawRows] = useState<string[][] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const stepIndex = { bom: 0, material: 1, template: 2, convert: 3 }[step];

  async function handleBomUpload(file: File) {
    const payload = await readXlsxRows(file);
    const result = detect(payload.rows, "bom_input");
    setBomRawRows(payload.rows);
    setBomHeaderRowIndex(result.header_row_index);
    setBomColumns(result.columns);
    return false; // 阻止 AntD Upload 自动上传行为——本来就不该有任何网络请求。
  }

  function confirmBomMapping() {
    if (!bomRawRows || !bomColumns) return;
    const profile = buildProfile("bom_input", bomHeaderRowIndex, bomColumns);
    setBom({ rows: bomRawRows, sheet_name: "Sheet1" }, profile);
    setStep("material");
  }

  async function handleMaterialUpload(file: File) {
    const payload = await readXlsxRows(file);
    const result = detect(payload.rows, "material_input");
    setMaterialRawRows(payload.rows);
    setMaterialHeaderRowIndex(result.header_row_index);
    setMaterialColumns(result.columns);
    return false;
  }

  function confirmMaterialMapping() {
    if (!materialRawRows || !materialColumns) return;
    const profile = buildProfile("material_input", materialHeaderRowIndex, materialColumns);
    setMaterial({ rows: materialRawRows, sheet_name: "Sheet1" }, profile);
    setStep("template");
  }

  function skipMaterial() {
    setMaterial(null, null);
    setStep("template");
  }

  async function runAnalyze() {
    const { bomRows, bomProfile, materialRows, materialProfile } = useWizardStore.getState();
    if (!bomRows || !bomProfile) return;
    setAnalyzing(true);
    try {
      const result = await mockWorker.analyze({
        bom_rows: bomRows.rows,
        material_rows: materialRows?.rows ?? null,
        bom_profile: bomProfile,
        material_profile: materialProfile,
      });
      setAnalyzeResult(result);
      setStep("convert");
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: "32px auto", padding: "0 24px" }}>
      <Steps
        current={stepIndex}
        items={[
          { title: "上传 BOM" },
          { title: "上传物料库（可选）" },
          { title: "输出模板" },
          { title: "转换预览" },
        ]}
        style={{ marginBottom: 32 }}
      />

      {step === "bom" && (
        <div>
          <Upload.Dragger beforeUpload={handleBomUpload} maxCount={1} accept=".xlsx,.xls">
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p>点击或拖拽 BOM 文件到此处</p>
          </Upload.Dragger>
          {bomColumns && (
            <div style={{ marginTop: 24 }}>
              <MappingTable
                columns={bomColumns}
                fieldOptions={BOM_FIELD_OPTIONS}
                onChange={(colIndex, field) =>
                  setBomColumns((prev) =>
                    prev
                      ? prev.map((c) => (c.col_index === colIndex ? { ...c, guess_field: field } : c))
                      : prev
                  )
                }
              />
              <Button type="primary" style={{ marginTop: 16 }} onClick={confirmBomMapping}>
                确认映射，下一步
              </Button>
            </div>
          )}
        </div>
      )}

      {step === "material" && (
        <div>
          <p>可选：上传企业物料库以启用自动匹配；跳过则仅做格式转换。</p>
          <Upload.Dragger beforeUpload={handleMaterialUpload} maxCount={1} accept=".xlsx,.xls">
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p>点击或拖拽物料库文件到此处</p>
          </Upload.Dragger>
          {materialColumns && (
            <div style={{ marginTop: 24 }}>
              <MappingTable
                columns={materialColumns}
                fieldOptions={MATERIAL_FIELD_OPTIONS}
                onChange={(colIndex, field) =>
                  setMaterialColumns((prev) =>
                    prev
                      ? prev.map((c) => (c.col_index === colIndex ? { ...c, guess_field: field } : c))
                      : prev
                  )
                }
              />
              <Button type="primary" style={{ marginTop: 16, marginRight: 8 }} onClick={confirmMaterialMapping}>
                确认映射，下一步
              </Button>
            </div>
          )}
          <Button style={{ marginTop: 16 }} onClick={skipMaterial}>
            跳过（仅格式转换）
          </Button>
        </div>
      )}

      {step === "template" && (
        <div>
          <p>选择输出模板：默认内置 PCBA 模板（骨架阶段仅支持默认模板）。</p>
          <Button type="primary" loading={analyzing} onClick={runAnalyze}>
            开始转换
          </Button>
        </div>
      )}

      {step === "convert" && <p>转换完成，请查看下方预览（Preview 页组件）。</p>}
    </div>
  );
}
