/**
 * Edge 兼容的轻量稳定哈希（非加密用途），用于生成去重 ID。
 */
export function stableId(input: string, len = 24): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  const hex = (h >>> 0).toString(16).padStart(8, "0");
  return hex.repeat(Math.ceil(len / 8)).slice(0, len);
}
