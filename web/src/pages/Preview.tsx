/**
 * 结果预览与修正：状态着色（契约第 7 节）、CandidatePicker 多候选单选、
 * stats 汇总条、下载导出（render() 调用真实/mock Worker，见
 * workers/singleton.ts）。文件名规则见契约 6.3：
 * `BOM_{pcba_model或输入文件名}_{yyyy-MM-dd}.xlsx`。
 */
import { useState } from "react";
import { Alert, Button, Statistic, Table, Tag, message } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { CandidatePicker } from "../components/CandidatePicker";
import { useWizardStore } from "../stores/wizardStore";
import { getWorkerClient } from "../workers/singleton";
import { MATCH_STATUS_COLORS } from "../types/contracts";
import type { AnalyzeItem, MatchLevel } from "../types/contracts";

const LEVEL_LABEL: Record<MatchLevel, string> = {
  exact: "精确匹配",
  model: "型号匹配",
  substring: "料号匹配",
  param: "参数匹配",
  multi: "多候选",
  none: "未匹配",
  non_component: "非物料",
  skipped: "未匹配物料库",
};

function levelColor(level: MatchLevel): string {
  return MATCH_STATUS_COLORS[level] ?? "#ffffff";
}

function todayDateString(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildOutputFilename(pcbaModel: string | undefined): string {
  const label = pcbaModel && pcbaModel.trim() ? pcbaModel.trim() : "BOM";
  return `BOM_${label}_${todayDateString()}.xlsx`;
}

export function Preview() {
  const { analyzeResult, outputTemplate, renderMeta, updateItemSelection } = useWizardStore();
  const [downloading, setDownloading] = useState(false);

  if (!analyzeResult) {
    return <Alert type="info" message="尚无转换结果，请先完成向导流程。" />;
  }

  const { items, stats } = analyzeResult;

  async function handleDownload() {
    if (!outputTemplate) {
      message.error("缺少输出模板，请返回向导重新选择模板。");
      return;
    }
    setDownloading(true);
    try {
      const worker = getWorkerClient();
      const bytes = await worker.render({
        final_items: items,
        output_profile: outputTemplate,
        meta: renderMeta,
      });
      const blob = new Blob([bytes as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildOutputFilename(renderMeta.pcba_model);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: "32px auto", padding: "0 24px" }}>
      <div style={{ display: "flex", gap: 32, marginBottom: 24, alignItems: "center" }}>
        <Statistic title="总数" value={stats.total} />
        <Statistic title="已匹配" value={stats.matched} styles={{ content: { color: "#3f8600" } }} />
        <Statistic title="低置信度" value={stats.low_confidence} styles={{ content: { color: "#d48806" } }} />
        <Statistic title="多候选" value={stats.multi} styles={{ content: { color: "#d46b08" } }} />
        <Statistic title="未匹配" value={stats.unmatched} styles={{ content: { color: "#cf1322" } }} />
        <Statistic title="非物料" value={stats.non_component} />
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          loading={downloading}
          onClick={handleDownload}
          style={{ marginLeft: "auto" }}
        >
          下载 Excel
        </Button>
      </div>

      <Table<AnalyzeItem>
        dataSource={items}
        rowKey="row_id"
        pagination={{ pageSize: 20 }}
        columns={[
          { title: "位号", dataIndex: ["fields", "designator"] },
          { title: "值", dataIndex: ["fields", "value"] },
          { title: "封装", dataIndex: ["fields", "footprint"] },
          { title: "料号", dataIndex: ["fields", "mpn"] },
          {
            title: "匹配状态",
            render: (_v, item) => (
              <Tag color={levelColor(item.match.level)} style={{ color: "#000" }}>
                {LEVEL_LABEL[item.match.level]}
              </Tag>
            ),
          },
          {
            title: "候选/编码",
            render: (_v, item) => {
              if (item.match.level !== "multi" || item.match.candidates.length <= 1) {
                const chosen = item.match.candidates[item.match.selected];
                return chosen ? `${chosen.code} · ${chosen.name}` : "—";
              }
              return (
                <CandidatePicker
                  candidates={item.match.candidates}
                  selected={item.match.selected}
                  manualCode={item.match.manual_code}
                  onSelectChange={(idx) => updateItemSelection(item.row_id, idx, null)}
                  onManualCodeChange={(code) =>
                    updateItemSelection(item.row_id, item.match.selected, code)
                  }
                />
              );
            },
          },
        ]}
      />
    </div>
  );
}
