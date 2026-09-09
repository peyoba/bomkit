# bomkit Web

默认入口：Home → ExcelWorkspace。保留原公司模板/合并/候选展开，在Excel处理，不设网页确认门禁。

第二入口：Home → 网页校对（可选）→ ReviewWorkspace。保留已有自定义中文模板与逐项核对，不替代默认Excel能力。

## 构建与测试

先在仓库根打Python wheel，再在web执行：

    npm ci
    npm run prepare:pyodide
    npm test
    npm run lint
    npm run build
    npm run preview -- --host 127.0.0.1 --port 4173

另一个终端运行npm run test:e2e，默认先验证Excel路径，再验证可选网页路径。BOMKIT_E2E_URL可指定本机地址；BOMKIT_PRIVATE_TESTS=1只在本机授权样例存在时使用。

关键代码：ExcelWorkspace.tsx提供旧公司元信息与一键下载；LocalTableInput.tsx复用本机读表；Worker的独立excel调用进入bomcore.excel_api，不复用review会话的确认门禁。v2与v1调用继续保留。

原公司主表可附加原始输入/Excel校对提示，但这些不是网页待办或生产批准。默认模式暂未接入自定义模板；需使用原先模板流程时，从首页进入可选网页工作台。未声称已完成会话恢复、离线保证或远端模板/Profile合并。
