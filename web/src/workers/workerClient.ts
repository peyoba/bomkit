/**
 * Worker 客户端接口。见契约第 6 节 Worker API。
 *
 * 提供两种实现：
 * - createMockWorkerClient()：读 core/tests/fixtures/contract fixture 返回固定
 *   结果，用于 T2 阶段在真实 bomcore wheel 就绪前跑通全流程 UI（见
 *   docs/04-agent-tasks.md T2 任务 4），现仍保留供 Vitest/开发调试使用。
 * - createPyodideWorkerClient()：真正的实现（T4 集成任务）。在独立 Web Worker
 *   线程内加载本地自托管的 Pyodide runtime + bomcore wheel（见
 *   src/workers/pyodide.worker.ts 与 scripts/prepare-pyodide.mjs），通过
 *   postMessage 做 { id, fn, args } / { id, ok, result|error } RPC（契约 6 节）。
 *   加载进度通过 onProgress 回调上报，供 workerStore 驱动 UI 进度条。
 */
import type {
  AnalyzeArgs,
  AnalyzeResult,
  DetectArgs,
  DetectResult,
  RenderArgs,
  WorkerErrorPayload,
} from "../types/contracts";

export interface WorkerClient {
  detect(args: DetectArgs): Promise<DetectResult>;
  analyze(args: AnalyzeArgs): Promise<AnalyzeResult>;
  render(args: RenderArgs): Promise<Uint8Array>;
}

export interface PyodideProgressEvent {
  stage: "loading_runtime" | "installing_packages" | "ready";
  progress: number;
  error?: string;
}

export interface PyodideWorkerClientOptions {
  onProgress?: (event: PyodideProgressEvent) => void;
}

interface RawWorkerResultMessage {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: WorkerErrorPayload["error"];
  type?: undefined;
}

interface RawWorkerProgressMessage {
  type: "progress";
  stage: PyodideProgressEvent["stage"];
  progress: number;
  error?: string;
}

type RawWorkerResponse = RawWorkerResultMessage | RawWorkerProgressMessage;

/** Worker 侧抛出的、带契约错误码的异常，供 UI 层判定错误类型（如区分用户输入
 * 错误 vs 内部异常）。message 已经是中文可读文案（契约 6.4）。 */
export class WorkerCallError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "WorkerCallError";
  }
}

/** 真正的 Pyodide Worker 客户端：spawn 一个 module worker，用递增 id 做请求/
 * 响应配对（契约 6 节协议），并把加载期的 progress 广播消息转发给 onProgress。
 */
export function createPyodideWorkerClient(options: PyodideWorkerClientOptions = {}): WorkerClient {
  const worker = new Worker(new URL("./pyodide.worker.ts", import.meta.url), { type: "module" });

  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();

  worker.onmessage = (event: MessageEvent<RawWorkerResponse>) => {
    const data = event.data;
    if (data.type === "progress") {
      options.onProgress?.({
        stage: data.stage as PyodideProgressEvent["stage"],
        progress: data.progress ?? 0,
        error: data.error,
      });
      return;
    }
    if (typeof data.id !== "number") return;
    const handler = pending.get(data.id);
    if (!handler) return;
    pending.delete(data.id);
    if (data.ok) {
      handler.resolve(data.result);
    } else {
      const err = data.error ?? { code: "INTERNAL", message: "Worker 未返回错误详情" };
      handler.reject(new WorkerCallError(err.code, err.message));
    }
  };

  worker.onerror = (event: ErrorEvent) => {
    // Worker 顶层未捕获异常（如加载脚本失败）：拒绝所有挂起请求，避免 UI 卡死等待。
    const err = new WorkerCallError("INTERNAL", event.message || "Pyodide Worker 发生未知错误");
    for (const [id, handler] of pending) {
      handler.reject(err);
      pending.delete(id);
    }
  };

  function call<TResult>(fn: "detect" | "analyze" | "render", args: unknown): Promise<TResult> {
    const id = nextId++;
    return new Promise<TResult>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ id, fn, args });
    });
  }

  return {
    detect: (args: DetectArgs) => call<DetectResult>("detect", args),
    analyze: (args: AnalyzeArgs) => call<AnalyzeResult>("analyze", args),
    render: (args: RenderArgs) => call<Uint8Array>("render", args),
  };
}
