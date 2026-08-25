/**
 * 列映射确认表：源列 + 样本数据 + 目标字段下拉 + 置信度着色。
 * 用户在此确认/修正 detect() 的猜测结果，生成 column_map（契约 3.1）。
 */
import { Select, Table, Tag } from "antd";
import type { DetectColumn, FieldConfidence } from "../types/contracts";

const CONFIDENCE_COLOR: Record<NonNullable<FieldConfidence> | "unknown", string> = {
  high: "green",
  medium: "gold",
  low: "orange",
  unknown: "default",
};

interface MappingTableProps {
  columns: DetectColumn[];
  fieldOptions: { value: string; label: string }[];
  onChange: (colIndex: number, field: string | null) => void;
}

export function MappingTable({ columns, fieldOptions, onChange }: MappingTableProps) {
  const dataSource = columns.map((c) => ({ key: c.col_index, ...c }));

  return (
    <Table
      dataSource={dataSource}
      pagination={false}
      size="small"
      columns={[
        { title: "源列", dataIndex: "source" },
        {
          title: "样本",
          dataIndex: "samples",
          render: (samples: string[]) => samples.join(", "),
        },
        {
          title: "映射到字段",
          dataIndex: "guess_field",
          render: (_value, record) => (
            <Select
              style={{ width: 180 }}
              allowClear
              placeholder="不映射（进 extras）"
              value={record.guess_field ?? undefined}
              options={fieldOptions}
              onChange={(value) => onChange(record.col_index, value ?? null)}
            />
          ),
        },
        {
          title: "置信度",
          dataIndex: "confidence",
          render: (confidence: FieldConfidence) => (
            <Tag color={CONFIDENCE_COLOR[confidence ?? "unknown"]}>{confidence ?? "未识别"}</Tag>
          ),
        },
      ]}
    />
  );
}
