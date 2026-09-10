import { ArrowRightOutlined, SafetyOutlined } from "@ant-design/icons";
import { OutputExample } from "../components/OutputExample";

export function Home({onStart}: {onStart: () => void}) {
  return <main className="a-wrap a-home" id="main-content">
    <div className="a-home-content">
      <span className="a-home-label">BOM → Excel</span>
      <h1>清单转好，<br />回到熟悉的 Excel。</h1>
      <p className="a-home-intro">导入 BOM，沿用原工具的分组合并、排序和候选展开。<br className="a-desktop-break" />生成文件后，在表格里完成校对。</p>
      <button type="button" className="a-primary a-start" onClick={onStart}>开始转换<ArrowRightOutlined aria-hidden="true" /></button>
      <p className="a-home-platforms">嘉立创 EDA / Altium / Cadence 已支持格式</p>
      <div className="a-home-features">
        <div><h2>保留原有表格能力</h2><p>公司 PCBA 模板、空板信息、厂商与匹配标色保持不变。</p></div>
        <div><h2>网页校对，按需使用</h2><p>需要逐项核对或自定义中文模板时，从导航进入可选工作台。</p></div>
      </div>
      <p className="a-home-privacy"><SafetyOutlined aria-hidden="true" />文件解析、查库与生成都在浏览器本机完成。</p>
    </div>
    <OutputExample compact />
  </main>;
}
