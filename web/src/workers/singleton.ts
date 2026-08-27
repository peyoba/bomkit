/**
 * Worker 客户端单例。Wizard/Preview 两个页面组件共用同一个 worker 实例
 * （Preview 需要调用 render() 下载文件，Wizard 负责 detect/analyze），
 * 避免各自 useMemo 出两个 Web Worker、重复冷启动加载 Pyodide。
 *
 * ?worker=mock 查询参数强制使用 mock worker（供 Playwright/手工调试），
 * 默认使用真实 Pyodide worker。
 */
import { createMockWorkerClient } from "./mockWorkerClient";
import { createPyodideWorkerClient, type PyodideProgressEvent, type WorkerClient } from "./workerClient";
import { useWorkerStore, type WorkerMode } from "../stores/workerStore";

function resolveWorkerMode(): WorkerMode {
  if (typeof window === "undefined") return "pyodide";
  const params = new URLSearchParams(window.location.search);
  return params.get("worker") === "mock" ? "mock" : "pyodide";
}

let clientInstance: WorkerClient | null = null;

/** 获取（惰性创建）全局唯一的 worker 客户端，并把加载状态同步进 workerStore。 */
export function getWorkerClient(): WorkerClient {
  if (clientInstance) return clientInstance;

  const store = useWorkerStore.getState();
  const mode = resolveWorkerMode();
  store.setMode(mode);

  if (mode === "mock") {
    store.setStatus("ready");
    store.setProgress(100);
    clientInstance = createMockWorkerClient();
    return clientInstance;
  }

  store.setStatus("loading");
  clientInstance = createPyodideWorkerClient({
    onProgress: (event: PyodideProgressEvent) => {
      if (event.error) {
        useWorkerStore.getState().setError(`Python 运行时加载失败：${event.error}`);
        return;
      }
      useWorkerStore.getState().setProgress(event.progress);
      if (event.stage === "ready") useWorkerStore.getState().setStatus("ready");
    },
  });
  return clientInstance;
}
