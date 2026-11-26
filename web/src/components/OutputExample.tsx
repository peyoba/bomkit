/** 只展示合成的工作表局部；不读取用户 BOM，不冒充真实匹配或实时预览。 */
export function OutputExample() {
  return <aside className="e-block" aria-label="输出样式示意">
    <div className="e-block-head">
      <span className="e-block-no">02</span>
      <h2>输出样式示意</h2>
      <span className="e-spacer"></span>
      <span className="e-tag">合成示例</span>
    </div>
    <div className="e-worksheet">
      <div className="e-ws-bar"><span>DEMO-PCBA-01 · 公司 PCBA 模板</span><span>XLSX</span></div>
      <div className="e-ws-title"><h3>示例控制板 PCBA</h3><p>主表局部 · 合成示例，非实时预览</p></div>
      <div className="e-ws-ruler" aria-hidden="true"><span className="e-idx">#</span><span className="e-col">A</span><span className="e-col">B</span><span className="e-col">C</span><span className="e-col">D</span></div>
      <table className="e-ws-table" aria-label="主表局部合成示例">
        <colgroup><col style={{width: 34}} /><col style={{width: 84}} /><col /><col style={{width: 52}} /></colgroup>
        <thead><tr><th scope="col" className="e-idx">#</th><th scope="col">位号</th><th scope="col">规格 / 型号</th><th scope="col" className="e-qty">数量</th></tr></thead>
        <tbody>
          <tr><td className="e-idx">01</td><td>R1, R2</td><td>10kΩ · 0603</td><td className="e-qty">2</td></tr>
          <tr><td className="e-idx">02</td><td>C1, C2</td><td>100nF · 0603</td><td className="e-qty">2</td></tr>
          <tr className="e-ws-cand"><td className="e-idx">03</td><td>U1</td><td><span className="e-cand-label">候选 A</span>DEMO-IC-A</td><td className="e-qty">1</td></tr>
          <tr className="e-ws-cand"><td className="e-idx">04</td><td>U1</td><td><span className="e-cand-label">候选 B</span>DEMO-IC-B</td><td className="e-qty">1</td></tr>
          <tr><td className="e-idx">05</td><td>J1</td><td>2×3 · 2.54mm</td><td className="e-qty">1</td></tr>
        </tbody>
      </table>
      <div className="e-ws-tabs"><span className="e-tab">主表</span><span>样式示意</span></div>
    </div>
    <div className="e-block-body">
      <p className="e-block-note">完整 Excel 字段与原主表格式保持不变。沿用分组合并、排序与多候选展开。</p>
      <p className="e-findings"><span className="e-mark">!</span><span className="e-text">候选行以红笔标出，请在 Excel 中删选后再核对数量。</span></p>
    </div>
  </aside>;
}
