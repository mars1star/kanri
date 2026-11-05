import type { Inventory } from "./inventory";

export function parseOptionalCount(text: string | undefined): number | undefined {
  const normalized = (text ?? "").normalize("NFKC").replaceAll(",", "").trim();
  if (!normalized) return undefined;
  if (!/^\d+$/.test(normalized) || Number(normalized) > 99999) {
    throw new Error("個数は0〜99,999の整数で入力してください。");
  }
  return Number(normalized);
}

export function buildTargetUpdate(data: Inventory, draft: Record<string, Record<string, string>>) {
  const targets = structuredClone(data.targets ?? {});
  let changed = false;
  for (const place of data.places) for (const item of data.items) {
    const value = parseOptionalCount(draft[place.id]?.[item.id]);
    if (value === undefined || value === (targets[place.id]?.[item.id] ?? 0)) continue;
    targets[place.id] ??= {};
    targets[place.id][item.id] = value;
    changed = true;
  }
  return { targets, changed };
}

export function buildBatchEntries(data: Inventory, place: string, draft: Record<string, string>, operation: "adjust" | "transfer") {
  return data.items.flatMap(item => {
    const value = parseOptionalCount(draft[item.id]);
    if (value === undefined) return [];
    if (operation === "transfer" ? value === 0 : value === (data.counts[place]?.[item.id] ?? 0)) return [];
    return [{ item: item.id, quantity: value }];
  });
}
