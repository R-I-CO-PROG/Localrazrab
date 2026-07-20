import type { BlacklistItem } from "@/lib/brand-palette";

export async function fetchBlacklist(): Promise<BlacklistItem[]> {
  const res = await fetch("/api/blacklist", { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return data.items ?? [];
}

export async function addToBlacklist(input: {
  itemType: "product" | "supplier";
  itemId: string;
  title: string;
  projectId?: string;
}): Promise<BlacklistItem | null> {
  const res = await fetch("/api/blacklist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.item ?? null;
}

export async function removeFromBlacklist(id: string): Promise<boolean> {
  const res = await fetch(`/api/blacklist/${id}`, { method: "DELETE" });
  return res.ok;
}

export function isBlacklisted(
  items: BlacklistItem[],
  product: { id?: string; name?: string; sourceId?: string | null },
  supplierId?: string | null,
): boolean {
  if (supplierId && items.some((i) => i.itemType === "supplier" && i.itemId === supplierId)) {
    return true;
  }
  if (product.id && items.some((i) => i.itemType === "product" && i.itemId === product.id)) {
    return true;
  }
  return false;
}

export function filterBlacklistedProducts<T extends { id?: string; name?: string }>(
  products: T[],
  blacklist: BlacklistItem[],
): T[] {
  const blockedProductIds = new Set(
    blacklist.filter((i) => i.itemType === "product").map((i) => i.itemId),
  );
  const blockedSuppliers = new Set(
    blacklist.filter((i) => i.itemType === "supplier").map((i) => i.itemId),
  );

  return products.filter((p) => {
    if (p.id && blockedProductIds.has(p.id)) return false;
    const supplierKey = (p as { sourceId?: string }).sourceId;
    if (supplierKey && blockedSuppliers.has(supplierKey)) return false;
    return true;
  });
}
