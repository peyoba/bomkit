import { ArrowRightOutlined } from "@ant-design/icons";
import { OutputExample } from "../components/OutputExample";

export function Home({onStart, onResistance}: {onStart: () => void; onResistance: () => void}) {
  return <main className="e-page e-grid-paper" id="main-content">
    <div className="e-wrap">
      <div className="e-tools-intro">
        <p className="e-eyebrow">AISTONE TOOLS · 硬件工程工具</p>
        <h1>硬件工程师的日常工具</h1>
        <p>提供 EDA 清单转换、物料候选匹配与电阻组合计算，辅助硬件设计和物料清单整理。</p>
      </div>
      <div className="e-tool-grid">
        <section className="e-block e-tool-card" aria-labelledby="bom-tool-title">
          <div className="e-tool-card-head"><span className="e-block-no">01</span><span className="e-mono">BOMKit · BOM → XLSX</span></div>
          <h2 id="bom-tool-title">BOM 整理与转换</h2>
          <p>导入 EDA 导出的 BOM，按规则归并同类物料，可结合本地物料库匹配候选，生成 PCBA Excel 表格用于后续校对。</p>
          <ul className="e-tool-features"><li>同类物料归并、数量汇总与位号排序</li><li>物料库匹配与候选展开</li><li>Excel 导出与可选网页校对</li></ul>
          <button type="button" className="e-btn e-btn-primary e-btn-lg" onClick={onStart}>开始转换<ArrowRightOutlined aria-hidden="true" /></button>
          <span className="e-boundary">支持已验证的嘉立创 EDA、Altium、Cadence BOM 导出格式。</span>
        </section>
        <section className="e-block e-tool-card" aria-labelledby="resistance-tool-title">
          <div className="e-tool-card-head"><span className="e-block-no">02</span><span className="e-mono">V · Ω · R1 / R2</span></div>
          <h2 id="resistance-tool-title">电阻计算与选型</h2>
          <p>根据供电电压、反馈基准电压或目标阻值，搜索单电阻及并联组合，计算对应的输出电压与等效阻值。</p>
          <ul className="e-tool-features"><li>电源反馈分压与普通电阻分压</li><li>单电阻及双电阻并联组合</li><li>按目标电压或阻值偏差筛选</li></ul>
          <button type="button" className="e-btn e-btn-lg" onClick={onResistance}>打开电阻计算器<ArrowRightOutlined aria-hidden="true" /></button>
          <span className="e-boundary">内置 77 个常用阻值，范围 100 Ω ～ 910 kΩ。</span>
        </section>
      </div>
      <details className="e-home-example">
        <summary>查看 Excel 导出示例</summary>
        <OutputExample />
      </details>
      <footer className="e-page-foot"><span>Aistone 工具箱 · 硬件工程辅助工具</span><span>文件解析与计算均在浏览器本地完成</span></footer>
    </div>
  </main>;
}
