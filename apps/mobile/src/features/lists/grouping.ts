import { ITEM_CATEGORIES, type ListItem } from '@fp/contracts';

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
export type ItemSection = { key: ItemCategory | 'checked'; items: ListItem[] };

/** Open items grouped by store aisle (in walking order), checked items last. */
export function groupListItems(items: readonly ListItem[]): ItemSection[] {
  const open = new Map<ItemCategory, ListItem[]>();
  const checked: ListItem[] = [];
  for (const item of items) {
    if (item.checked) {
      checked.push(item);
      continue;
    }
    const bucket = open.get(item.category) ?? [];
    bucket.push(item);
    open.set(item.category, bucket);
  }
  const sections: ItemSection[] = [];
  for (const category of ITEM_CATEGORIES) {
    const bucket = open.get(category);
    if (bucket?.length)
      sections.push({ key: category, items: bucket.sort((a, b) => a.position - b.position) });
  }
  if (checked.length) {
    sections.push({
      key: 'checked',
      items: checked.sort((a, b) => (b.checkedAt ?? '').localeCompare(a.checkedAt ?? '')),
    });
  }
  return sections;
}
