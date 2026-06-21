export type ParentChildItem = {
  id: string;
  parent_id: string | null;
  sort_order: number;
};

export function isParentItem<T extends ParentChildItem>(item: T): boolean {
  return item.parent_id == null;
}

export function isChildItem<T extends ParentChildItem>(item: T): boolean {
  return item.parent_id != null;
}

export function parentItems<T extends ParentChildItem>(items: T[]): T[] {
  return items.filter(isParentItem);
}

export function childrenOf<T extends ParentChildItem>(
  items: T[],
  parentId: string,
): T[] {
  return items
    .filter((item) => item.parent_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

export function parentIdsWithChildren<T extends ParentChildItem>(
  items: T[],
): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.parent_id != null) ids.add(item.parent_id);
  }
  return ids;
}

export function childCountByParent<T extends ParentChildItem>(
  items: T[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.parent_id == null) continue;
    counts.set(item.parent_id, (counts.get(item.parent_id) ?? 0) + 1);
  }
  return counts;
}
