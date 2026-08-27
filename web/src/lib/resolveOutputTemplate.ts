import { DEFAULT_OUTPUT_TEMPLATE } from "./outputTemplate";
import { isCustomTemplateReady } from "./templateReady";
import type { OutputTemplateProfile } from "../types/contracts";

/** Annotated custom profile always wins. Default is used only when none was chosen. */
export function resolveOutputTemplate(
  mode: "builtin" | "custom",
  current: OutputTemplateProfile | null
): { ok: true; profile: OutputTemplateProfile } | { ok: false; message: string } {
  if (isCustomTemplateReady(current)) {
    return { ok: true, profile: current as OutputTemplateProfile };
  }
  if (mode === "custom") {
    return { ok: false, message: "请先上传公司模板，点选数据起始行并至少映射一列" };
  }
  return { ok: true, profile: current ?? DEFAULT_OUTPUT_TEMPLATE };
}
