# bomcore

BOM 转换与物料匹配的纯 Python 核心逻辑。仅依赖 `openpyxl`，无 pandas。
供 Pyodide（Web Worker）与 CLI 共用，接口定义见仓库根 `docs/02-contracts.md`。

## 开发

```bash
pip install -e ".[dev]"
pytest tests -v
python -m build --wheel
```
