/**
 * 跨入口会话状态：Excel 转换与网页校对共用同一份已选文件。
 *
 * 两个工作台在路由切换时会被卸载，各自的 useState 也随之丢失，用户必须重新上传。
 * 把"输入文件 + 表单草稿"放到这个 store 里，切换入口就只是换一层界面，不丢数据。
 * 只保存在内存中：文件依然在浏览器本地解析，不落盘、不上传。
 */
import { create } from "zustand";
import type { ExcelArgs } from "../types/excel";
import type { LoadedTable, Platform, ReviewSnapshot } from "../types/review";

export interface ReviewTemplate { name: string; b64: string }
export type ExcelMeta = ExcelArgs["meta"];

export interface SessionState {
  /** 已解析的输入表；两个入口共用。 */
  bom: LoadedTable | null;
  material: LoadedTable | null;
  /** 原始 File 引用：切换入口后仍可继续切换工作表。 */
  bomFile: File | null;
  materialFile: File | null;
  bomReading: boolean;
  materialReading: boolean;
  platform: Platform;

  excelMeta: ExcelMeta;
  excelFilename: string;
  excelTrace: boolean;

  reviewSnapshot: ReviewSnapshot | null;
  reviewTemplate: ReviewTemplate | null;
  reviewTitle: string;
  reviewBatch: number;
  reviewReviewer: string;
  reviewPendingOnly: boolean;
  reviewSearch: string;

  setBom: (bom: LoadedTable | null) => void;
  setMaterial: (material: LoadedTable | null) => void;
  setBomFile: (file: File | null) => void;
  setMaterialFile: (file: File | null) => void;
  setBomReading: (reading: boolean) => void;
  setMaterialReading: (reading: boolean) => void;
  setPlatform: (platform: Platform) => void;
  setExcelMeta: (meta: ExcelMeta) => void;
  setExcelFilename: (filename: string) => void;
  setExcelTrace: (trace: boolean) => void;
  setReviewSnapshot: (snapshot: ReviewSnapshot | null) => void;
  updateReviewSnapshot: (updater: (snapshot: ReviewSnapshot) => ReviewSnapshot) => void;
  patchReview: (patch: Partial<Pick<SessionState, "reviewTemplate" | "reviewTitle" | "reviewBatch" | "reviewReviewer" | "reviewPendingOnly" | "reviewSearch">>) => void;
  resetReview: () => void;
  /** 清空全部会话草稿（测试与"彻底重来"使用）。 */
  resetAll: () => void;
}

const emptyInputs = {
  bom: null as LoadedTable | null,
  material: null as LoadedTable | null,
  bomFile: null as File | null,
  materialFile: null as File | null,
  bomReading: false,
  materialReading: false,
  platform: "auto" as Platform,
};

const emptyExcel = {
  excelMeta: {pcba_name: "", pcba_model: "", pcb_name: "", pcb_model: ""} as ExcelMeta,
  excelFilename: "",
  excelTrace: true,
};

const emptyReview = {
  reviewSnapshot: null as ReviewSnapshot | null,
  reviewTemplate: null as ReviewTemplate | null,
  reviewTitle: "",
  reviewBatch: 1,
  reviewReviewer: "",
  reviewPendingOnly: true,
  reviewSearch: "",
};

export const useSessionStore = create<SessionState>((set) => ({
  ...emptyInputs,
  ...emptyExcel,
  ...emptyReview,
  // 输入变了，之前基于旧文件算出的校对快照就不再可信，必须作废。
  setBom: (bom) => set({ bom, reviewSnapshot: null }),
  setMaterial: (material) => set({ material, reviewSnapshot: null }),
  setBomFile: (bomFile) => set({ bomFile }),
  setMaterialFile: (materialFile) => set({ materialFile }),
  setBomReading: (bomReading) => set({ bomReading }),
  setMaterialReading: (materialReading) => set({ materialReading }),
  setPlatform: (platform) => set({ platform, reviewSnapshot: null }),
  setExcelMeta: (excelMeta) => set({ excelMeta }),
  setExcelFilename: (excelFilename) => set({ excelFilename }),
  setExcelTrace: (excelTrace) => set({ excelTrace }),
  setReviewSnapshot: (reviewSnapshot) => set({ reviewSnapshot }),
  updateReviewSnapshot: (updater) => set((state) => ({ reviewSnapshot: state.reviewSnapshot ? updater(state.reviewSnapshot) : null })),
  patchReview: (patch) => set(patch),
  resetReview: () => set({ ...emptyReview }),
  resetAll: () => set({ ...emptyInputs, ...emptyExcel, ...emptyReview }),
}));
