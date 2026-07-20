/** Toggle id in ordered selection; new picks append at the end. */
export function toggleOrderedSelection(prev: string[], id: string): string[] {
  if (prev.includes(id)) return prev.filter((x) => x !== id);
  return [...prev, id];
}

/** 1-based order number for display, or null if not selected. */
export function selectionOrderNumber(selectedIds: string[], id: string): number | null {
  const idx = selectedIds.indexOf(id);
  return idx >= 0 ? idx + 1 : null;
}
