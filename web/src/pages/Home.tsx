/** 落地页：一句话价值 + 隐私说明 + 开始按钮。见 docs/01-architecture.md #4 用户流程。 */
import { Button, Card, Typography } from "antd";

const { Title, Paragraph } = Typography;

export function Home({ onStart }: { onStart: () => void }) {
  return (
    <div style={{ maxWidth: 720, margin: "64px auto", padding: "0 24px" }}>
      <Title level={2}>bomkit — BOM 校对与标准化导出</Title>
      <Paragraph>
        导入嘉立创 EDA、Altium 或 Cadence 的 BOM，对照企业物料库逐项确认差异，按你上传的模板导出。
      </Paragraph>
      <Card title="文件不出本机" style={{ marginBottom: 24 }}>
        <Paragraph>
          所有文件解析、匹配、生成都在你的浏览器本地完成（Pyodide 运行 Python 核心），
          没有任何文件被上传到服务器。你可以打开浏览器开发者工具的"网络"面板，
          确认转换过程中没有发起任何文件上传请求来验证这一点。
        </Paragraph>
      </Card>
      <Paragraph>原型号始终保留。确定项直接通过，只标出不确定项的原因与具体差异；处理完问题即可正式导出，不需要逐行点确认。</Paragraph>
      <Button type="primary" size="large" onClick={onStart}>
        开始转换
      </Button>
    </div>
  );
}
