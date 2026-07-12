'use client';

import { type Tag, type TagCategory } from '@/db/schema';
import { TAG_CATEGORY_ORDER } from '@/lib/trades';
import { cn } from '@/lib/utils';

/**
 * Group a flat tag list by category, preserving the canonical category order
 * from TAG_CATEGORY_ORDER and name order within each group. Categories with no
 * tags are omitted from the result so the picker shows no empty sections for
 * accounts that have no user-created setups.
 */
function groupTags(tags: ReadonlyArray<Tag>): ReadonlyArray<{
  category: TagCategory;
  label: string;
  tags: ReadonlyArray<Tag>;
}> {
  const byCategory = new Map<TagCategory, Tag[]>();
  for (const tag of tags) {
    const list = byCategory.get(tag.category) ?? [];
    list.push(tag);
    byCategory.set(tag.category, list);
  }
  return TAG_CATEGORY_ORDER.map((c) => ({
    category: c.value,
    label: c.label,
    tags: [...(byCategory.get(c.value) ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  })).filter((g) => g.tags.length > 0);
}

interface TagPickerProps {
  tags: ReadonlyArray<Tag>;
  /** Currently selected tag ids. */
  selected: ReadonlyArray<string>;
  onToggle: (tagId: string) => void;
}

/**
 * Multi-select tag picker, grouped by category. Each tag is a native checkbox
 * (name="tags") so the selection submits with the form without hidden-input
 * syncing. Selected tags pick up an accent-signal border — no colored pills,
 * per the design system's anti-slop rules.
 */
export function TagPicker({ tags, selected, onToggle }: TagPickerProps) {
  const selectedSet = new Set(selected);
  const groups = groupTags(tags);

  if (groups.length === 0) {
    return (
      <p className="text-tertiary text-xs">
        No tags available. Tags are seeded on signup — sign out and back in if
        this account predates the tag migration.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.category} className="space-y-2">
          <p className="text-tertiary text-[10px] uppercase tracking-wide">
            {group.label}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {group.tags.map((tag) => {
              const active = selectedSet.has(tag.id);
              return (
                <label
                  key={tag.id}
                  className={cn(
                    'flex cursor-pointer items-center rounded-card border px-2.5 py-1 text-xs transition-colors duration-150',
                    active
                      ? 'border-accent-signal/60 text-accent-signal bg-surface-raised'
                      : 'border-hairline text-secondary hover:text-primary',
                  )}
                >
                  <input
                    type="checkbox"
                    name="tags"
                    value={tag.id}
                    checked={active}
                    onChange={() => onToggle(tag.id)}
                    className="sr-only"
                  />
                  {tag.name}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
