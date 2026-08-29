/**
 * 转换向导：AntD Steps 四步。默认使用真实 Pyodide Worker（首次进入向导即开始
 * 后台冷启动加载，进度条见 workerStore），mock Worker 仅供 Vitest/开发调试
 * 通过 ?worker=mock 查询参数切换。BOM_FIELD_OPTIONS/MATERIAL_FIELD_OPTIONS
 * 与 core/src/bomcore/schema.py 的字段注册表一一对应，任何一侧新增字段都要
 * 同步另一侧。
 */
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Form, Input, Progress, Radio, Steps, Upload, message } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { v4 as uuidv4 } from "uuid";
import { readXlsxRows } from "../lib/xlsx";
import { detect } from "../lib/detect";
import { DEFAULT_OUTPUT_TEMPLATE } from "../lib/outputTemplate";
import { resolveOutputTemplate } from "../lib/resolveOutputTemplate";
import { applyStoredMapping, findMatchingProfile, listProfiles } from "../lib/profiles";
import { saveProfileGuarded, isBuiltinProfile } from "../lib/profileGuard";
import { fingerprint } from "../lib/fingerprint";
import { MappingTable } from "../components/MappingTable";
import { useWizardStore } from "../stores/wizardStore";
import { useWorkerStore } from "../stores/workerStore";
import { getWorkerClient } from "../workers/singleton";
import type { DetectColumn, InputProfile, OutputTemplateProfile, RenderMeta } from "../types/contracts";

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

const BOM_REQUIRED_FIELDS = ["designator", "qty", "value", "footprint"];
const MATERIAL_REQUIRED_FIELDS = ["code", "spec"];

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  [...BOM_FIELD_OPTIONS, ...MATERIAL_FIELD_OPTIONS].map((o) => [o.value, o.label])
);

function findMissingRequiredFields(columns: DetectColumn[], required: string[]): string[] {
  const mapped = new Set(columns.map((c) => c.guess_field).filter((f): f is string => Boolean(f)));
  return required.filter((f) => !mapped.has(f)).map((f) => FIELD_LABELS[f] ?? f);
}

function buildProfile(
  kind: "bom_input" | "material_input",
  headerRowIndex: number,
  columns: DetectColumn[],
  opts: { reused?: InputProfile; fingerprint?: string | null; name?: string } = {}
): InputProfile {
  const columnMap: Record<string, string> = {};
  for (const c of columns) {
    if (c.guess_field) columnMap[c.source] = c.guess_field;
  }
  // 复用历史配置时沿用其 id/options：同一种表头布局在 localStorage 里原地
  // 更新，不会随每次上传堆积新条目。
  const reused = opts.reused;
  return {
    schema_version: 1,
    kind,
    id: reused?.id ?? uuidv4(),
    name: opts.name ?? reused?.name ?? (kind === "bom_input" ? "未命名BOM映射" : "未命名物料库映射"),
    builtin: false,
    header_fingerprint: opts.fingerprint ?? reused?.header_fingerprint ?? null,
    header_row_index: headerRowIndex,
    column_map: columnMap,
    options: reused?.options ?? (kind === "bom_input" ? { dnp_markers: ["DNP"] } : { skip_disabled: true }),
  };
}

/** 去掉扩展名的文件名，用作保存 Profile 的默认名称。 */
function fileBaseName(fileName: string | null): string | null {
  if (!fileName) return null;
  return fileName.replace(/\.(xlsx|xls)$/i, "");
}

const STAGE_LABEL: Record<string, string> = {
  loading_runtime: "正在加载 Python 运行时…",
  installing_packages: "正在安装转换引擎…",
  ready: "转换引擎就绪",
};

/**
 * detect + 表头指纹查历史配置。精确命中时把用户上次确认的列映射套回 detect
 * 结果（包括自动猜测永远推不出的手动指定，如 Description -> value），命中的
 * Profile 返回给确认环节原地复用 id；未命中则维持纯 detect 结果。
 */
async function detectWithProfileReuse(
  rows: string[][],
  kind: "bom_input" | "material_input"
): Promise<{ result: ReturnType<typeof detect>; columns: DetectColumn[]; reused: InputProfile | null }> {
  const result = detect(rows, kind);
  const headers = rows[result.header_row_index] ?? [];
  const match = await findMatchingProfile(kind, headers);
  if (match?.exact) {
    return {
      result,
      columns: applyStoredMapping(result.columns, match.profile.column_map),
      reused: match.profile,
    };
  }
  return { result, columns: result.columns, reused: null };
}

export function Wizard() {
  const { step, setStep, setBom, setMaterial, setOutputTemplate, renderMeta, setRenderMeta, setAnalyzeResult } =
    useWizardStore();
  const { mode, status, progress, errorMessage, setStatus } = useWorkerStore();

  const [bomColumns, setBomColumns] = useState<DetectColumn[] | null>(null);
  const [bomHeaderRowIndex, setBomHeaderRowIndex] = useState(0);
  const [bomRawRows, setBomRawRows] = useState<string[][] | null>(null);
  const [bomFileName, setBomFileName] = useState<string | null>(null);
  const [bomSheetName, setBomSheetName] = useState("Sheet1");
  const [bomReusedProfile, setBomReusedProfile] = useState<InputProfile | null>(null);
  const [materialColumns, setMaterialColumns] = useState<DetectColumn[] | null>(null);
  const [materialHeaderRowIndex, setMaterialHeaderRowIndex] = useState(0);
  const [materialRawRows, setMaterialRawRows] = useState<string[][] | null>(null);
  const [materialFileName, setMaterialFileName] = useState<string | null>(null);
  const [materialSheetName, setMaterialSheetName] = useState("Sheet1");
  const [materialReusedProfile, setMaterialReusedProfile] = useState<InputProfile | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  // 输出模板选择：内置默认 or 用户在「标注输出模板」页保存的公司模板。
  // 标注是独立入口（首页「标注输出模板」），向导只做选择。
  const [templateId, setTemplateId] = useState<string>(DEFAULT_OUTPUT_TEMPLATE.id);
  const [savedTemplates, setSavedTemplates] = useState<OutputTemplateProfile[]>([]);

  const stepIndex = { bom: 0, material: 1, template: 2, convert: 3 }[step];

  const worker = useMemo(() => getWorkerClient(), []);

  useEffect(() => {
    if (mode === "pyodide" && status === "idle") setStatus("loading");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 进入「输出模板」步骤时刷新已保存模板列表（可能在模板管理页有增删）。
  useEffect(() => {
    if (step !== "template") return;
    setSavedTemplates(
      listProfiles("output_template").filter(
        (p): p is OutputTemplateProfile => p.kind === "output_template" && !isBuiltinProfile(p)
      )
    );
  }, [step]);

  function handleTemplateSelect(id: string) {
    setTemplateId(id);
    if (id === DEFAULT_OUTPUT_TEMPLATE.id) {
      setOutputTemplate(DEFAULT_OUTPUT_TEMPLATE);
      return;
    }
    const picked = savedTemplates.find((p) => p.id === id);
    if (picked) setOutputTemplate(picked);
  }

  async function handleBomUpload(file: File) {
    try {
      const payload = await readXlsxRows(file);
      const { result, columns, reused } = await detectWithProfileReuse(payload.rows, "bom_input");
      setBomRawRows(payload.rows);
      setBomSheetName(payload.sheet_name);
      setBomFileName(file.name);
      setBomHeaderRowIndex(result.header_row_index);
      setBomReusedProfile(reused);
      setBomColumns(columns);
      if (reused) {
        message.info(`检测到与历史记录相同的表头，已自动套用映射「${reused.name}」，可直接确认或调整`);
      }
    } catch (err) {
      message.error(`读取 BOM 文件失败：${err instanceof Error ? err.message : String(err)}`);
    }
    return false;
  }

  async function confirmBomMapping() {
    if (!bomRawRows || !bomColumns) return;
    const missing = findMissingRequiredFields(bomColumns, BOM_REQUIRED_FIELDS);
    if (missing.length > 0) {
      message.error(`BOM 映射缺少必填字段：${missing.join("、")}，请在下方表格中为对应列选择映射字段`);
      return;
    }
    const profile = buildProfile("bom_input", bomHeaderRowIndex, bomColumns, {
      reused: bomReusedProfile ?? undefined,
      fingerprint: await fingerprint(bomRawRows[bomHeaderRowIndex] ?? []),
      name: bomReusedProfile ? undefined : `${fileBaseName(bomFileName) ?? "未命名"} 映射`,
    });
    saveProfileGuarded(profile); // 契约第 3/4 节：确认过的映射持久化，供指纹复用
    setBom({ rows: bomRawRows, sheet_name: bomSheetName }, profile);
    setStep("material");
  }

  async function handleMaterialUpload(file: File) {
    try {
      const payload = await readXlsxRows(file);
      const { result, columns, reused } = await detectWithProfileReuse(payload.rows, "material_input");
      setMaterialRawRows(payload.rows);
      setMaterialSheetName(payload.sheet_name);
      setMaterialFileName(file.name);
      setMaterialHeaderRowIndex(result.header_row_index);
      setMaterialReusedProfile(reused);
      setMaterialColumns(columns);
      if (reused) {
        message.info(`检测到与历史记录相同的表头，已自动套用映射「${reused.name}」，可直接确认或调整`);
      }
    } catch (err) {
      message.error(`读取物料库文件失败：${err instanceof Error ? err.message : String(err)}`);
    }
    return false;
  }

  async function confirmMaterialMapping() {
    if (!materialRawRows || !materialColumns) return;
    const missing = findMissingRequiredFields(materialColumns, MATERIAL_REQUIRED_FIELDS);
    if (missing.length > 0) {
      message.error(`物料库映射缺少必填字段：${missing.join("、")}，请在下方表格中为对应列选择映射字段`);
      return;
    }
    const profile = buildProfile("material_input", materialHeaderRowIndex, materialColumns, {
      reused: materialReusedProfile ?? undefined,
      fingerprint: await fingerprint(materialRawRows[materialHeaderRowIndex] ?? []),
      name: materialReusedProfile ? undefined : `${fileBaseName(materialFileName) ?? "未命名"} 映射`,
    });
    saveProfileGuarded(profile);
    setMaterial({ rows: materialRawRows, sheet_name: materialSheetName }, profile);
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
    const { bomRows, bomProfile, materialRows, materialProfile, outputTemplate } = useWizardStore.getState();
    if (!bomRows || !bomProfile) return;
    const mode = templateId === DEFAULT_OUTPUT_TEMPLATE.id ? "builtin" : "custom";
    const resolved = resolveOutputTemplate(mode, outputTemplate);
    if (!resolved.ok) {
      message.error(resolved.message);
      return;
    }
    setOutputTemplate(resolved.profile);
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
          <p>选择输出模板（新公司模板请在首页「标注输出模板」中创建）： </p>
          <Radio.Group
            value={templateId}
            onChange={(e) => handleTemplateSelect(e.target.value)}
            style={{ marginBottom: 24, display: "block" }}
          >
            <Radio style={{ display: "block", lineHeight: 2 }} value={DEFAULT_OUTPUT_TEMPLATE.id}>
              内置默认 PCBA 模板
            </Radio>
            {savedTemplates.map((p) => (
              <Radio key={p.id} style={{ display: "block", lineHeight: 2 }} value={p.id}>
                {p.name || "未命名公司模板"}
              </Radio>
            ))}
          </Radio.Group>

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
