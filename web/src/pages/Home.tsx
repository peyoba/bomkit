/** 落地页：一句话价值 + 隐私说明 + 开始按钮。见 docs/01-architecture.md #4 用户流程。 */
import { Button, Card, Space, Typography } from "antd";

const { Title, Paragraph } = Typography;

export function Home({ onStart, onReview }: { onStart: () => void; onReview: () => void }) {
  return (
    <div style={{ maxWidth: 720, margin: "64px auto", padding: "0 24px" }}>
      <Title level={2}>bomkit — BOM 转换与 Excel 校对</Title>
      <Paragraph>
        导入嘉立创 EDA、Altium 或 Cadence 的 BOM，按原公司工具合并、排序、展开候选并生成 Excel。校对在表格中完成，不强制网页逐项确认。
      </Paragraph>
      <Card title="文件不出本机" style={{ marginBottom: 24 }}>
        <Paragraph>
          所有文件解析、匹配、生成都在你的浏览器本地完成（Pyodide 运行 Python 核心），
          没有任何文件被上传到服务器。你可以打开浏览器开发者工具的"网络"面板，
          确认转换过程中没有发起任何文件上传请求来验证这一点。
        </Paragraph>
      </Card>
      <Paragraph>默认保留公司 PCBA 模板、空板信息、厂商、原型号辅助列和匹配颜色。多候选、未匹配项下载后在 Excel 中处理；原始输入与校对提示可作为附表保留。</Paragraph>
      <Space wrap>
      <Button type="primary" size="large" onClick={onStart}>
        开始转换
      </Button>
      <Button onClick={onReview}>网页校对（可选）</Button>
      </Space>
      <Paragraph type="secondary" style={{marginTop: 16}}>可选网页工作台保留自定义中文模板与逐项核对能力，不影响默认 Excel 工作流。转换结果不代表生产审批。</Paragraph>
    </div>
  );
}
