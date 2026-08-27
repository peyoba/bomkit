/**
 * 真实 Pyodide Worker 脚本。在独立线程内：加载本地自托管的 Pyodide runtime
 * （web/public/pyodide/，见 scripts/prepare-pyodide.mjs）-> 用 micropip 从
 * 同目录安装 packaging/et_xmlfile/openpyxl/bomcore 四个 wheel（纯离线，不
 * 访问任何 CDN，符合 docs/01-architecture.md D1 "文件不出本机/无后端" 的
 * 约束）-> 暴露 detect/analyze/render 三个函数，通过 postMessage 响应主线程
 * 的 { id, fn, args } 请求（协议见 docs/02-contracts.md #6）。
 *
 * 加载进度通过 { type: "progress", stage, progress } 消息主动上报，供
 * workerStore 驱动 UI 进度条（docs/03-milestones.md M2 验收门 3：首次加载
 * 有进度指示）。
 */
/// <reference lib="webworker" />

declare const self: DedicatedWorkerGlobalScope;

// Vite 会把 base 路径下的 public/ 资源原样发布到构建产物根目录，运行时用绝对
// 路径 "/pyodide/" 访问即可（dev 与 build 行为一致）。
const PYODIDE_BASE = new URL("/pyodide/", self.location.origin).href;

type ProgressStage = "loading_runtime" | "installing_packages" | "ready";

function reportProgress(stage: ProgressStage, progress: number) {
  self.postMessage({ type: "progress", stage, progress });
}

// pyodide.mjs 是标准 ES 模块，Worker 以 type: "module" 方式启动时可以直接
// 用动态 import() 从绝对 URL 加载（避免 importScripts，与 module worker 一致）。
type PyodideInterface = Awaited<ReturnType<typeof import("pyodide").loadPyodide>>;

let pyodideReadyPromise: Promise<PyodideInterface> | null = null;

async function initPyodide(): Promise<PyodideInterface> {
  reportProgress("loading_runtime", 10);
  const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_BASE}pyodide.mjs`);
  const pyodide: PyodideInterface = await loadPyodide({ indexURL: PYODIDE_BASE });
  reportProgress("loading_runtime", 50);

  // micropip 是 Pyodide 官方内置包（随 pyodide-lock.json 一起分发的 wheel 文件已
  // 复制到本地 public/pyodide/），loadPackage 会走本地 indexURL 而不联网。
  await pyodide.loadPackage("micropip");
  reportProgress("installing_packages", 60);

  const micropip = pyodide.pyimport("micropip");
  // 显式传本地 wheel 的绝对 URL，跳过 micropip 默认的 PyPI/CDN 索引查询——
  // 这几个包在 PYODIDE_BASE 下已经就绪（prepare-pyodide.mjs 产物）。
  await micropip.install.callKwargs(
    [
      `${PYODIDE_BASE}packaging-23.2-py3-none-any.whl`,
      `${PYODIDE_BASE}et_xmlfile-2.0.0-py3-none-any.whl`,
      `${PYODIDE_BASE}openpyxl-3.1.5-py2.py3-none-any.whl`,
      `${PYODIDE_BASE}bomcore-0.1.0-py3-none-any.whl`,
    ],
    { keep_going: true }
  );
  reportProgress("installing_packages", 90);

  reportProgress("ready", 100);
  return pyodide;
}

function getPyodide(): Promise<PyodideInterface> {
  if (!pyodideReadyPromise) {
    pyodideReadyPromise = initPyodide();
  }
  return pyodideReadyPromise;
}

// 主线程立刻触发加载，不等第一次调用（冷启动体验：进度条从页面打开就开始跑）。
getPyodide().catch((err) => {
  self.postMessage({ type: "progress", stage: "loading_runtime", progress: 0, error: String(err) });
});

interface WorkerRequestMessage {
  id: number;
  fn: "detect" | "analyze" | "render";
  args: unknown;
}

function toErrorPayload(err: unknown): { code: string; message: string } {
  // bomcore.schema.ProfileError 在 Python 侧携带 .code/.message；Pyodide 把
  // Python 异常包装为 PythonError，真正的自定义属性挂在 err.message 文本里
  // (Pyodide 默认只序列化 str(exception))，这里做一次尽力而为的结构化提取，
  // 提取失败则退化为 INTERNAL + 原始文本（契约 6.4：message 必须中文可读）。
  const text = err instanceof Error ? err.message : String(err);
  const match = text.match(/ProfileError:\s*\[(\w+)\]\s*(.*)$/s);
  if (match) {
    return { code: match[1], message: match[2].trim() };
  }
  return { code: "INTERNAL", message: text };
}

self.onmessage = async (event: MessageEvent<WorkerRequestMessage>) => {
  const { id, fn, args } = event.data;
  try {
    const pyodide = await getPyodide();
    const bomcoreApi = pyodide.pyimport("bomcore.api");

    // 关键：普通 JS 对象/数组传给 Python 函数时，Pyodide 默认只包一层 JsProxy，
    // 不会自动转换成 Python dict/list。对于只做迭代/下标访问的参数（如 rows）
    // JsProxy 的序列协议足以让代码正常工作；但 bomcore 里 `isinstance(x, dict)`
    // /`.get()` 这类显式 dict 操作（schema.py 校验、字段映射查表）在 JsProxy 上
    // 会直接失败或行为不对。用 pyodide.toPy() 做一次深拷贝转换为原生 Python
    // 对象，避免这一整类隐蔽 bug（真实大物料表按此修复前测得 16721 行数据必现）。
    const toPy = (v: unknown) => (v === null || v === undefined ? v : pyodide.toPy(v));

    let result: unknown;
    if (fn === "detect") {
      const { rows, kind } = args as { rows: string[][]; kind: string };
      result = bomcoreApi.detect(toPy(rows), kind).toJs({ dict_converter: Object.fromEntries });
    } else if (fn === "analyze") {
      const a = args as {
        bom_rows: string[][];
        material_rows: string[][] | null;
        bom_profile: unknown;
        material_profile: unknown;
        match_config?: unknown;
      };
      result = bomcoreApi
        .analyze(
          toPy(a.bom_rows),
          toPy(a.material_rows),
          toPy(a.bom_profile),
          toPy(a.material_profile),
          a.match_config != null ? toPy(a.match_config) : undefined
        )
        .toJs({ dict_converter: Object.fromEntries });
    } else if (fn === "render") {
      const a = args as { final_items: unknown; output_profile: unknown; meta?: unknown };
      const pyBytes = bomcoreApi.render(
        toPy(a.final_items),
        toPy(a.output_profile),
        a.meta != null ? toPy(a.meta) : undefined
      );
      // openpyxl.save() 经 render() 返回 Python bytes；Pyodide 的 PyProxy.toJs()
      // 对 bytes 会给 Uint8Array，直接可用于前端 Blob 下载。
      result = pyBytes.toJs();
    } else {
      throw new Error(`未知的 Worker 函数: ${fn}`);
    }

    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: toErrorPayload(err) });
  }
};
