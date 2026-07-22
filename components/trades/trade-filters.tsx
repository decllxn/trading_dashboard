'use client';

import { Label, Select } from '@/components/field';
import { ASSET_CLASS_OPTIONS } from '@/lib/trades';
import type { TradeFilters } from '@/lib/trades';
import type { Tag } from '@/db/schema';
import { cn } from '@/lib/utils';

interface TradeFiltersBarProps {
  filters: TradeFilters;
  onChange: (next: TradeFilters) => void;
  /** All of the user's tags — the tag filter groups them by category. */
  tags: ReadonlyArray<Tag>;
  /** Disable the clear button when no filter is active. */
  canClear: boolean;
  onClear: () => void;
}

/**
 * Filter bar for the trades table. Controls map 1:1 to the TradeFilters shape:
 * asset class, tag, status, and an inclusive entry-date range. All controls
 * are controlled — the parent owns the filter state so the table + bar stay in
 * sync from one source of truth.
 *
 * The tag <select> groups tags by category using optgroup, matching the tag
 * picker in the entry form.
 */
export function TradeFiltersBar({
  filters,
  onChange,
  tags,
  canClear,
  onClear,
}: TradeFiltersBarProps) {
  function update<K extends keyof TradeFilters>(key: K, value: TradeFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  // Group tags by category for the optgroups, preserving the canonical order.
  const groupsByCategory = new Map<string, Tag[]>();
  for (const tag of tags) {
    const list = groupsByCategory.get(tag.category) ?? [];
    list.push(tag);
    groupsByCategory.set(tag.category, list);
  }
  const categoryLabels: Record<string, string> = {
    setup: 'Setups',
    ict_concept: 'ICT concepts',
    session: 'Sessions',
    emotion: 'Emotions',
  };

  return (
    <div className="border-hairline bg-surface grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:items-end rounded-card border p-3">
      <FilterField id="filter-assetClass" label="Asset class">
        <Select
          id="filter-assetClass"
          value={filters.assetClass}
          onChange={(e) =>
            update('assetClass', e.target.value as TradeFilters['assetClass'])
          }
        >
          <option value="all">All</option>
          {ASSET_CLASS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </FilterField>

      <FilterField id="filter-status" label="Status">
        <Select
          id="filter-status"
          value={filters.status}
          onChange={(e) =>
            update('status', e.target.value as TradeFilters['status'])
          }
        >
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </Select>
      </FilterField>

      <FilterField id="filter-tagId" label="Tag">
        <Select
          id="filter-tagId"
          value={filters.tagId}
          onChange={(e) => update('tagId', e.target.value)}
        >
          <option value="all">All</option>
          {Array.from(groupsByCategory.entries()).map(([category, list]) => (
            <optgroup key={category} label={categoryLabels[category] ?? category}>
              {[...list]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </FilterField>

      <FilterField id="filter-fromDate" label="From">
        <DateInput
          id="filter-fromDate"
          value={filters.fromDate}
          onChange={(v) => update('fromDate', v)}
        />
      </FilterField>

      <FilterField id="filter-toDate" label="To">
        <DateInput
          id="filter-toDate"
          value={filters.toDate}
          onChange={(v) => update('toDate', v)}
        />
      </FilterField>

      <div className="col-span-2 sm:col-span-1 flex items-end">
        <button
          type="button"
          onClick={onClear}
          disabled={!canClear}
          className={cn(
            'rounded-card px-3 py-2 text-xs transition-colors duration-150 min-h-[44px] w-full sm:w-auto',
            canClear
              ? 'text-secondary hover:text-primary'
              : 'text-tertiary cursor-not-allowed',
          )}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

/** Compact labeled filter field — smaller label than the form Field. */
function FilterField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[10px]">
        {label}
      </Label>
      <div className="w-full sm:w-36">{children}</div>
    </div>
  );
}

/**
 * Date input styled to match the Select primitive — native date pickers can't
 * be fully restyled, but we align the border/bg/radius so it reads as one
 * control family. Sans font (dates aren't tabular data in the filter context).
 */
function DateInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      id={id}
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-card border border-hairline bg-surface px-3 py-2 text-sm text-primary [color-scheme:dark] focus:border-accent-signal focus:outline-none focus:ring-1 focus:ring-accent-signal"
    />
  );
}
