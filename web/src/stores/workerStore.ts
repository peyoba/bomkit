/**
 * Worker 加载状态（Pyodide 冷启动进度）。骨架阶段先支持 mock/pyodide 两种
 * 模式切换（T4 集成任务会把 mode 默认值改为 'pyodide' 并接入真实加载进度）。
 */
import { create } from "zustand";

export type WorkerMode = "mock" | "pyodide";
export type WorkerLoadStatus = "idle" | "loading" | "ready" | "error";

interface WorkerState {
  mode: WorkerMode;
  status: WorkerLoadStatus;
  progress: number; // 0-100
  errorMessage: string | null;
  setMode: (mode: WorkerMode) => void;
  setStatus: (status: WorkerLoadStatus) => void;
  setProgress: (progress: number) => void;
  setError: (message: string) => void;
}

export const useWorkerStore = create<WorkerState>((set) => ({
  mode: "mock",
  status: "idle",
  progress: 0,
  errorMessage: null,
  setMode: (mode) => set({ mode }),
  setStatus: (status) => set({ status }),
  setProgress: (progress) => set({ progress }),
  setError: (errorMessage) => set({ errorMessage, status: "error" }),
}));
