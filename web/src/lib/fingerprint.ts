/**
 * 表头指纹算法（契约 4.1/4.2）。用 Web Crypto sha256，与 Python 侧
 * bomcore.fingerprint 的算法定义保持一致：两端共用同一份归一化规则
 * (normalizeHeader)，任何一侧改动都必须同步另一侧，否则指纹复用会失效。
 */
import { normalizeHeader } from "./detect";

export async function fingerprint(headers: string[]): Promise<string> {
  const normalized = Array.from(
    new Set(headers.map(normalizeHeader).filter((h) => h.length > 0))
  ).sort();
  const joined = normalized.join("\x1f");
  const data = new TextEncoder().encode(joined);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function jaccardSimilarity(headersA: string[], headersB: string[]): number {
  const setA = new Set(headersA.map(normalizeHeader).filter((h) => h.length > 0));
  const setB = new Set(headersB.map(normalizeHeader).filter((h) => h.length > 0));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}
