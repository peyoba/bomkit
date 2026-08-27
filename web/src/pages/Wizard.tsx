/**
 * 转换向导：AntD Steps 四步。默认使用真实 Pyodide Worker（首次进入向导即开始
 * 后台冷启动加载，进度条见 workerStore），mock Worker 仅供 Vitest/开发调试
 * 通过 ?worker=mock 查询参数切换。BOM_FIELD_OPTIONS/MATERIAL_FIELD_OPTIONS
 * 与 core/src/bomcore/schema.py 的字段注册表一一对应，任何一侧新增字段都要
 * 同步另一侧。
 */
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Form, Input, Progress, Steps, Upload, message } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { v4 as uuidv4 } from "uuid";
import { readXlsxRows } from "../lib/xlsx";
import { detect } from "../lib/detect";
import { DEFAULT_OUTPUT_TEMPLATE } from "../lib/outputTemplate";
import { MappingTable } from "../components/MappingTable";
import { useWizardStore } from "../stores/wizardStore";
import { useWorkerStore } from "../stores/workerStore";
import { getWorkerClient } from "../workers/singleton";
import type { DetectColumn, InputProfile, RenderMeta } from "../types/contracts";

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
  { value: "source_code", label: "企业物料编码 (source_code，可直配物料库)" },
];

const MATERIAL_FIELD_OPTIONS = [
  { value: "code", label: "物料编码 (code)" },
  { value: "name", label: "物料名称 (name)" },
  { value: "spec", label: "规格型号 (spec)" },
  { value: "status", label: "禁用状态 (status)" },
  { value: "category", label: "类别 (category)" },
];

// 必填字段清单，与 core/src/bomcore/schema.py 的 BOM_REQUIRED_FIELDS /
// MATERIAL_REQUIRED_FIELDS 严格保持一致——两侧任一改动都要同步另一侧，否则
// 前端会"放行"一个后端必然拒绝的映射，用户直到最后一步点「开始转换」才会
// 看到报错（真实故障复现过，见开发报告）。
const BOM_REQUIRED_FIELDS = ["designator", "qty", "value", "footprint"];
const MATERIAL_REQUIRED_FIELDS = ["code", "spec"];

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  [...BOM_FIELD_OPTIONS, ...MATERIAL_FIELD_OPTIONS].map((o) => [o.value, o.label])
);

/** 校验 column_map 是否覆盖了全部必填字段；返回缺失字段的中文标签列表
 * （空数组表示校验通过）。在「确认映射」按钮点击时调用，把后端 analyze()
 * 才会抛出的 MISSING_REQUIRED_FIELD 错误提前到映射步骤拦截，避免用户走完
 * 整个向导后才在最后一步发现问题。 */
function findMissingRequiredFields(columns: DetectColumn[], required: string[]): string[] {
  const mapped = new Set(columns.map((c) => c.guess_field).filter((f): f is string => Boolean(f)));
  return required.filter((f) => !mapped.has(f)).map((f) => FIELD_LABELS[f] ?? f);
}

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

const STAGE_LABEL: Record<string, string> = {
  loading_runtime: "正在加载 Python 运行时…",
  installing_packages: "正在安装转换引擎…",
  ready: "转换引擎就绪",
};

export function Wizard() {
  const { step, setStep, setBom, setMaterial, setOutputTemplate, renderMeta, setRenderMeta, setAnalyzeResult } =
    useWizardStore();
  const { mode, status, progress, errorMessage, setStatus } = useWorkerStore();

  const [bomColumns, setBomColumns] = useState<DetectColumn[] | null>(null);
  const [bomHeaderRowIndex, setBomHeaderRowIndex] = useState(0);
  const [bomRawRows, setBomRawRows] = useState<string[][] | null>(null);
  const [materialColumns, setMaterialColumns] = useState<DetectColumn[] | null>(null);
  const [materialHeaderRowIndex, setMaterialHeaderRowIndex] = useState(0);
  const [materialRawRows, setMaterialRawRows] = useState<string[][] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const stepIndex = { bom: 0, material: 1, template: 2, convert: 3 }[step];

  // worker 是全局单例（见 workers/singleton.ts）：Wizard 用它做 detect/analyze，
  // Preview 页面用同一个实例做 render()，避免重复 spawn Worker / 重复冷启动。
  const worker = useMemo(() => getWorkerClient(), []);

  useEffect(() => {
    if (mode === "pyodide" && status === "idle") setStatus("loading");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleBomUpload(file: File) {
    try {
      const payload = await readXlsxRows(file);
      const result = detect(payload.rows, "bom_input");
      setBomRawRows(payload.rows);
      setBomHeaderRowIndex(result.header_row_index);
      setBomColumns(result.columns);
    } catch (err) {
      // 不吞异常：xlsx 解析失败（如损坏文件/极端 ZIP 编码）必须给用户可见提示，
      // 否则会表现为"上传后无反应"（真实故障曾在此复现，见开发报告）。
      message.error(`读取 BOM 文件失败：${err instanceof Error ? err.message : String(err)}`);
    }
    return false; // 阻止 AntD Upload 自动上传行为——本来就不该有任何网络请求。
  }

  function confirmBomMapping() {
    if (!bomRawRows || !bomColumns) return;
    const missing = findMissingRequiredFields(bomColumns, BOM_REQUIRED_FIELDS);
    if (missing.length > 0) {
      message.error(`BOM 映射缺少必填字段：${missing.join("、")}，请在下方表格中为对应列选择映射字段`);
      return;
    }
    const profile = buildProfile("bom_input", bomHeaderRowIndex, bomColumns);
    setBom({ rows: bomRawRows, sheet_name: "Sheet1" }, profile);
    setStep("material");
  }

  async function handleMaterialUpload(file: File) {
    try {
      const payload = await readXlsxRows(file);
      const result = detect(payload.rows, "material_input");
      setMaterialRawRows(payload.rows);
      setMaterialHeaderRowIndex(result.header_row_index);
      setMaterialColumns(result.columns);
    } catch (err) {
      message.error(`读取物料库文件失败：${err instanceof Error ? err.message : String(err)}`);
    }
    return false;
  }

  function confirmMaterialMapping() {
    if (!materialRawRows || !materialColumns) return;
    const missing = findMissingRequiredFields(materialColumns, MATERIAL_REQUIRED_FIELDS);
    if (missing.length > 0) {
      message.error(`物料库映射缺少必填字段：${missing.join("、")}，请在下方表格中为对应列选择映射字段`);
      return;
    }
    const profile = buildProfile("material_input", materialHeaderRowIndex, materialColumns);
    setMaterial({ rows: materialRawRows, sheet_name: "Sheet1" }, profile);
    setStep("template");
  }

  function skipMaterial() {
    setMaterial(null, null);
    setStep("template");
  }

  function handleMetaChange(patch: Partial<RenderMeta>) {
    setRenderMeta({ ...renderMeta, ...patch });
  }

  async function runAnalyze() {
    const { bomRows, bomProfile, materialRows, materialProfile } = useWizardStore.getState();
    if (!bomRows || !bomProfile) return;
    setOutputTemplate(DEFAULT_OUTPUT_TEMPLATE);
    setAnalyzing(true);
    try {
      const result = await worker.analyze({
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

  const engineNotReady = mode === "pyodide" && status !== "ready";

  return (
    <div style={{ maxWidth: 960, margin: "32px auto", padding: "0 24px" }}>
      {mode === "pyodide" && status !== "error" && (
        <div style={{ marginBottom: 16 }}>
          <Progress
            percent={progress}
            status={status === "ready" ? "success" : "active"}
            format={() => (status === "ready" ? "引擎就绪" : `${progress}%`)}
          />
          <span style={{ color: "#888", fontSize: 12 }}>
            {STAGE_LABEL[status === "ready" ? "ready" : progress < 50 ? "loading_runtime" : "installing_packages"]}
            {status !== "ready" && "（首次加载约需数秒到数十秒，取决于网络与设备性能；仅本次会话，页面数据不出本机）"}
          </span>
        </div>
      )}
      {status === "error" && (
        <Alert
          type="error"
          showIcon
          message="转换引擎加载失败"
          description={errorMessage ?? "未知错误"}
          style={{ marginBottom: 16 }}
        />
      )}

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
          <p>输出模板：默认内置 PCBA 模板（前期阶段仅支持默认模板）。</p>
          <Form layout="vertical" style={{ maxWidth: 480, marginBottom: 16 }}>
            <Form.Item label="PCBA 名称">
              <Input
                value={renderMeta.pcba_name ?? ""}
                onChange={(e) => handleMetaChange({ pcba_name: e.target.value })}
              />
            </Form.Item>
            <Form.Item label="PCBA 型号">
              <Input
                value={renderMeta.pcba_model ?? ""}
                onChange={(e) => handleMetaChange({ pcba_model: e.target.value })}
              />
            </Form.Item>
            <Form.Item label="PCB 空板名称">
              <Input
                value={renderMeta.pcb_name ?? ""}
                onChange={(e) => handleMetaChange({ pcb_name: e.target.value })}
              />
            </Form.Item>
            <Form.Item label="PCB 空板型号">
              <Input
                value={renderMeta.pcb_model ?? ""}
                onChange={(e) => handleMetaChange({ pcb_model: e.target.value })}
              />
            </Form.Item>
          </Form>
          <Button type="primary" loading={analyzing} disabled={engineNotReady} onClick={runAnalyze}>
            {engineNotReady ? "转换引擎加载中…" : "开始转换"}
          </Button>
        </div>
      )}

      {step === "convert" && <p>转换完成，请查看下方预览（Preview 页组件）。</p>}
    </div>
  );
}
