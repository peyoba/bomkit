/**
 * Mock Worker：读 core/tests/fixtures/contract 下的固定 fixture 返回结果，
 * 供 T2 web-app 在真实 bomcore wheel 接入前跑通完整向导流程 UI。
 *
 * 注意：这不是"模拟计算"，而是直接返回预先算好的 analyze_expected.json——
 * 输入内容会被忽略。用于 UI 流程联调，不用于验证匹配算法本身（算法正确性
 * 由 core/tests 的 pytest 用例保证）。
 */
import { detect } from "../lib/detect";
import type { WorkerClient } from "./workerClient";
import type { AnalyzeResult, DetectResult } from "../types/contracts";

// Vite 的 JSON import：构建时内联，无需运行时 fetch。
import analyzeExpected from "../../../core/tests/fixtures/contract/analyze_expected.json";

export function createMockWorkerClient(): WorkerClient {
  return {
    detect: ({ rows, kind }) => Promise.resolve(detect(rows, kind) as DetectResult),
    analyze: () => Promise.resolve(analyzeExpected as unknown as AnalyzeResult),
    render: () => Promise.reject(new Error("Mock Worker 不支持 render()：请在真实 Worker 接入后测试导出。")),
  };
}
