import { DEFAULT_OUTPUT_TEMPLATE } from "./outputTemplate";
import { isCustomTemplateReady } from "./templateReady";
import type { OutputTemplateProfile } from "../types/contracts";

/** builtin → 永远用内置默认模板；custom → 必须是已标注且就绪的公司模板。 */
export function resolveOutputTemplate(
  mode: "builtin" | "custom",
  current: OutputTemplateProfile | null
): { ok: true; profile: OutputTemplateProfile } | { ok: false; message: string } {
  if (mode === "custom") {
    if (isCustomTemplateReady(current)) {
      return { ok: true, profile: current as OutputTemplateProfile };
    }
    return { ok: false, message: "请先上传公司模板，点选数据起始行并至少映射一列" };
  }
  return { ok: true, profile: DEFAULT_OUTPUT_TEMPLATE };
}
