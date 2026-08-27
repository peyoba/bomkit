/**
 * 向导状态管理（Zustand）。持有向导四步（上传BOM映射 -> 上传物料库映射(可跳过)
 * -> 输出模板选择/标注 -> 转换）之间共享的数据。
 */
import { create } from "zustand";
import type {
  AnalyzeResult,
  InputProfile,
  OutputTemplateProfile,
  RenderMeta,
  RowsPayload,
} from "../types/contracts";

export type WizardStep = "bom" | "material" | "template" | "convert";

interface WizardState {
  step: WizardStep;
  bomRows: RowsPayload | null;
  bomProfile: InputProfile | null;
  materialRows: RowsPayload | null;
  materialProfile: InputProfile | null;
  outputTemplate: OutputTemplateProfile | null;
  renderMeta: RenderMeta;
  analyzeResult: AnalyzeResult | null;

  setStep: (step: WizardStep) => void;
  setBom: (rows: RowsPayload, profile: InputProfile) => void;
  setMaterial: (rows: RowsPayload | null, profile: InputProfile | null) => void;
  setOutputTemplate: (profile: OutputTemplateProfile) => void;
  setRenderMeta: (meta: RenderMeta) => void;
  setAnalyzeResult: (result: AnalyzeResult) => void;
  updateItemSelection: (rowId: number, selected: number, manualCode: string | null) => void;
  reset: () => void;
}

const initialState = {
  step: "bom" as WizardStep,
  bomRows: null,
  bomProfile: null,
  materialRows: null,
  materialProfile: null,
  outputTemplate: null,
  renderMeta: {} as RenderMeta,
  analyzeResult: null,
};

export const useWizardStore = create<WizardState>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),
  setBom: (bomRows, bomProfile) => set({ bomRows, bomProfile }),
  setMaterial: (materialRows, materialProfile) => set({ materialRows, materialProfile }),
  setOutputTemplate: (outputTemplate) => set({ outputTemplate }),
  setRenderMeta: (renderMeta) => set({ renderMeta }),
  setAnalyzeResult: (analyzeResult) => set({ analyzeResult }),

  updateItemSelection: (rowId, selected, manualCode) =>
    set((state) => {
      if (!state.analyzeResult) return state;
      const items = state.analyzeResult.items.map((item) =>
        item.row_id === rowId
          ? { ...item, match: { ...item.match, selected, manual_code: manualCode } }
          : item
      );
      return { analyzeResult: { ...state.analyzeResult, items } };
    }),

  reset: () => set(initialState),
}));
