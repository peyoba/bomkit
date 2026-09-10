import { InfoCircleOutlined } from "@ant-design/icons";

/** 只展示A方案中的合成局部示意；不读取用户BOM，不冒充真实匹配或实时预览。 */
export function OutputExample({compact = false}: {compact?: boolean}) {
  return <aside className={"a-output-example" + (compact ? " a-output-compact" : "")} aria-label="输出样式示意">
    <div className="a-preview-heading"><h2>输出样式示意</h2><span className="a-format-badge">XLSX</span></div>
    <p className="a-preview-caption">主表局部 · 合成示例，非实时预览</p>
    <div className="a-worksheet">
      <div className="a-sheet-bar"><span>公司 PCBA 模板</span><span>示例数据</span></div>
      <div className="a-sheet-title"><h3>示例控制板 PCBA</h3><p>PCBA 型号：DEMO-PCBA-01</p></div>
      <table aria-label="主表局部合成示例">
        <colgroup><col className="a-col-index" /><col className="a-col-ref" /><col /><col className="a-col-quantity" /></colgroup>
        <thead><tr><th scope="col">#</th><th scope="col">位号</th><th scope="col">规格 / 型号</th><th scope="col">数量</th></tr></thead>
        <tbody>
          <tr><td>01</td><td>R1, R2</td><td>10kΩ · 0603</td><td>2</td></tr>
          <tr><td>02</td><td>C1, C2</td><td>100nF · 0603</td><td>2</td></tr>
          <tr className="a-example-candidate"><td>03</td><td>U1</td><td><span>候选 A</span>DEMO-IC-A</td><td>1</td></tr>
          <tr className="a-example-candidate"><td>04</td><td>U1</td><td><span>候选 B</span>DEMO-IC-B</td><td>1</td></tr>
          <tr><td>05</td><td>J1</td><td>2×3 · 2.54mm</td><td>1</td></tr>
        </tbody>
      </table>
      <div className="a-sheet-bottom"><span>主表（局部）</span><span>样式示意</span></div>
    </div>
    <p className="a-template-note">完整 Excel 字段与原主表格式保持不变。</p>
    <div className="a-processing-note">
      <h3>沿用你熟悉的表格处理方式</h3>
      <p>分组合并 · 排序 · 多候选展开</p>
      <p className="a-candidate-note"><InfoCircleOutlined aria-hidden="true" /><span>多候选请在 Excel 中删选，再核对数量。</span></p>
    </div>
  </aside>;
}
