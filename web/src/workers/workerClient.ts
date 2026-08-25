/**
 * Worker 客户端接口。见契约第 6 节 Worker API。
 *
 * 提供两种实现：
 * - createMockWorkerClient()：读 core/tests/fixtures/contract fixture 返回固定
 *   结果，用于 T2 阶段在真实 bomcore wheel 就绪前跑通全流程 UI（见
 *   docs/04-agent-tasks.md T2 任务 4）。
 * - createPyodideWorkerClient()：占位——真正的 Pyodide 加载与桥接是 T4 集成阶段
 *   的工作（需要构建 bomcore wheel + 下载 Pyodide runtime，见任务卡 T4 步骤 2），
 *   本骨架阶段仅定义接口形状，函数体在被调用时抛出明确的"未实现"错误，
 *   不假装能工作。
 */
import type {
  AnalyzeArgs,
  AnalyzeResult,
  DetectArgs,
  DetectResult,
  RenderArgs,
} from "../types/contracts";

export interface WorkerClient {
  detect(args: DetectArgs): Promise<DetectResult>;
  analyze(args: AnalyzeArgs): Promise<AnalyzeResult>;
  render(args: RenderArgs): Promise<Uint8Array>;
}

export function createPyodideWorkerClient(): WorkerClient {
  const notImplemented = (fn: string): never => {
    throw new Error(
      `Pyodide Worker 尚未接入（T4 集成任务）：${fn}() 需要真实 bomcore wheel + Pyodide runtime。` +
        `开发/测试请使用 createMockWorkerClient()。`
    );
  };
  return {
    detect: () => Promise.reject(notImplemented("detect")),
    analyze: () => Promise.reject(notImplemented("analyze")),
    render: () => Promise.reject(notImplemented("render")),
  };
}
