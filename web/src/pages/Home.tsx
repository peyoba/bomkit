import { ArrowRightOutlined } from "@ant-design/icons";
import { OutputExample } from "../components/OutputExample";

export function Home({onStart}: {onStart: () => void}) {
  return <main className="e-page e-grid-paper" id="main-content">
    <div className="e-wrap">
      <div className="e-hero">
        <div className="e-hero-copy">
          <p className="e-eyebrow">BOM → XLSX · 本地处理</p>
          <h1>清单转好，<br />回到熟悉的 <em>Excel</em>。</h1>
          <p className="e-hero-intro">导入 BOM，沿用原工具的分组合并、排序和候选展开。生成文件后，在表格里完成校对。需要人工判断的行会用红笔标出。</p>
          <div className="e-hero-actions">
            <button type="button" className="e-btn e-btn-primary e-btn-lg" onClick={onStart}>开始转换<ArrowRightOutlined aria-hidden="true" /></button>
            <span className="e-boundary">嘉立创 EDA / Altium / Cadence 已支持格式</span>
          </div>
          <dl className="e-facts">
            <div className="e-fact"><dt><span className="e-mono">01</span> 保留原有表格能力</dt><dd>公司 PCBA 模板、空板信息、厂商与匹配标色保持不变。</dd></div>
            <div className="e-fact"><dt><span className="e-mono">02</span> 网页校对，按需使用</dt><dd>需要逐项核对或自定义中文模板时，从导航进入可选工作台。</dd></div>
          </dl>
          <p className="e-privacy"><span className="e-mark e-mono">·</span>文件解析、查库与生成都在浏览器本机完成，不上传服务器。</p>
        </div>
        <OutputExample />
      </div>
      <footer className="e-page-foot"><span>方向 E / 红笔校对 · 红色只用于需要人工判断的地方</span><span>本机处理 · 原有 Excel 工作流不变</span></footer>
    </div>
  </main>;
}
