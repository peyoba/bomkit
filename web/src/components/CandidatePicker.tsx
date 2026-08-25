/** 多候选单选组件。用户在预览页处理 match.level === 'multi' 的行时使用。 */
import { Input, Radio, Space } from "antd";
import type { MaterialCandidate } from "../types/contracts";

interface CandidatePickerProps {
  candidates: MaterialCandidate[];
  selected: number;
  manualCode: string | null;
  onSelectChange: (index: number) => void;
  onManualCodeChange: (code: string | null) => void;
}

export function CandidatePicker({
  candidates,
  selected,
  manualCode,
  onSelectChange,
  onManualCodeChange,
}: CandidatePickerProps) {
  return (
    <Space orientation="vertical" style={{ width: "100%" }}>
      <Radio.Group
        value={manualCode ? "manual" : selected}
        onChange={(e) => {
          if (e.target.value !== "manual") {
            onManualCodeChange(null);
            onSelectChange(e.target.value as number);
          }
        }}
      >
        <Space orientation="vertical">
          {candidates.map((c, i) => (
            <Radio key={c.code} value={i}>
              {c.code} · {c.name} · {c.spec}
            </Radio>
          ))}
        </Space>
      </Radio.Group>
      <Input
        placeholder="或手动填写物料编码（优先于以上选择）"
        value={manualCode ?? ""}
        onChange={(e) => onManualCodeChange(e.target.value || null)}
        style={{ width: 280 }}
      />
    </Space>
  );
}
