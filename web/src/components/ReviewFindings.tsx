import type { ReviewFinding } from "../types/review";

/** 列表和详情共用同一份后端证据；没有问题时不制造标签或占位提示。 */
export function ReviewFindings({ findings }: { findings: ReviewFinding[] }) {
  if (!findings.length) return null;
  return <ul className="review-findings" data-testid="review-findings">
    {findings.map((finding, index) => <li key={`${finding.code}-${finding.field}-${index}`}>
      <strong>{finding.label}：{finding.reason}</strong>
      <div><span>BOM 原值：</span><code>{finding.original || "（空）"}</code></div>
      <div><span>库值 / 参考：</span><code>{finding.library || "（无可对照值）"}</code></div>
      {finding.final && <div><span>修改后的值：</span><code>{finding.final}</code></div>}
    </li>)}
  </ul>;
}
