export type Entry = { id: string; name: string };
export type Item = Entry & { unit: string };
export type Inventory = { places: Entry[]; items: Item[]; counts: Record<string, Record<string, number>>; targets?: Record<string, number> };
export type Change = {
  type: "transfer" | "adjust" | "place" | "item" | "delete_place" | "delete_item" | "target";
  item?: string; from?: string; to?: string; quantity?: number;
  name?: string; unit?: string; note?: string;
};
export type Detail = { type: Change["type"]; title: string; description: string; quantity?: number; unit?: string };
export function initialInventory(): Inventory {
  return {
    places: [{ id: "storage", name: "倉庫" }, { id: "gym", name: "体育館" }, { id: "classroom", name: "教室（仮）" }],
    items: [{ id: "desk", name: "机", unit: "台" }, { id: "chair", name: "椅子", unit: "脚" }, { id: "tent", name: "テント", unit: "張" }],
    counts: {}, targets: {},
  };
}
export function countAt(data: Inventory, place: string, item: string) { return data.counts[place]?.[item] ?? 0; }
function shortText(value: unknown, label: string, max: number, required = true): string {
  if (typeof value !== "string" || (required && !value.trim()) || value.trim().length > max) throw new Error(`${label}を${max}文字以内で入力してください。`);
  return value.trim();
}
export function applyChange(original: Inventory, change: Change, id: string): { data: Inventory; detail: Detail } {
  const data = structuredClone(original);
  if (change.type === "place" || change.type === "item") {
    const name = shortText(change.name, "名前", 30);
    const list = change.type === "place" ? data.places : data.items;
    if (list.some(e => e.name.normalize("NFKC") === name.normalize("NFKC"))) throw new Error("同じ名前がすでに登録されています。");
    if (list.length >= 100) throw new Error("登録できる数は100件までです。");
    if (change.type === "place") data.places.push({ id, name });
    else data.items.push({ id, name, unit: shortText(change.unit, "単位", 5) });
    return { data, detail: { type: change.type, title: `${name}を追加`, description: change.type === "place" ? "管理する場所を追加しました" : "管理する備品を追加しました" } };
  }
  if (change.type !== "transfer" && change.type !== "adjust") throw new Error("操作が正しくありません。");
  const item = data.items.find(e => e.id === change.item);
  const from = data.places.find(e => e.id === change.from);
  if (!item || !from) throw new Error("備品と場所を選んでください。");
  const quantity = change.quantity;
  if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < (change.type === "transfer" ? 1 : 0) || quantity > 99999) throw new Error("個数は0〜99,999の整数で入力してください（移動は1以上）。");
  const note = shortText(change.note ?? "", "メモ", 200, change.type === "adjust");
  const previous = countAt(data, from.id, item.id);
  data.counts[from.id] ??= {};
  if (change.type === "adjust") {
    if (previous === quantity) throw new Error("現在の個数と同じです。");
    data.counts[from.id][item.id] = quantity;
    return { data, detail: { type: "adjust", title: `${item.name}の個数を設定`, description: `${from.name}：${previous}${item.unit} → ${quantity}${item.unit} ／ ${note}`, quantity, unit: item.unit } };
  }
  const to = data.places.find(e => e.id === change.to);
  if (!to || to.id === from.id) throw new Error("移動先には別の場所を選んでください。");
  if (previous < quantity) throw new Error(`移動元には${previous}${item.unit}しかありません。最新の個数を確認してください。`);
  if (countAt(data, to.id, item.id) + quantity > 99999) throw new Error("移動先の個数が上限を超えます。");
  data.counts[from.id][item.id] = previous - quantity;
  data.counts[to.id] ??= {};
  data.counts[to.id][item.id] = countAt(data, to.id, item.id) + quantity;
  return { data, detail: { type: "transfer", title: `${item.name}を${quantity}${item.unit}移動`, description: `${from.name} → ${to.name}${note ? ` ／ ${note}` : ""}`, quantity, unit: item.unit } };
}
