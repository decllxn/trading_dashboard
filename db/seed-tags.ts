/**
 * Canonical default tag set seeded into every new account.
 *
 * Single source of truth for the seed data — the matching Postgres trigger
 * (supabase/migrations/0001_tags.sql) plants these rows on signup. Keep this
 * array in sync with the `VARIADIC` list in the migration's seed function.
 *
 * Why the split: the trigger needs the data as a SQL literal to fire server-side
 * without app code (it works for OAuth/admin/email-confirm paths uniformly),
 * but app code may need the same set (e.g. a "restore defaults" action later),
 * so the typed list lives here and the migration mirrors it.
 */
import type { TagCategory } from './schema';

export interface DefaultTag {
  name: string;
  category: TagCategory;
}

/**
 * The default tag set. Categories follow the tag_category enum.
 * `setup` is intentionally empty — setups are personal strategy names the user
 * defines themselves; seeding canned ones would be presumptuous.
 */
export const DEFAULT_TAGS: readonly DefaultTag[] = [
  // ICT concepts
  { name: 'Order Block', category: 'ict_concept' },
  { name: 'FVG', category: 'ict_concept' },
  { name: 'Liquidity Sweep', category: 'ict_concept' },
  { name: 'Breaker', category: 'ict_concept' },
  { name: 'Mitigation Block', category: 'ict_concept' },
  // Sessions
  { name: 'London', category: 'session' },
  { name: 'New York', category: 'session' },
  { name: 'Asia', category: 'session' },
  // Emotions / process
  { name: 'Disciplined', category: 'emotion' },
  { name: 'FOMO', category: 'emotion' },
  { name: 'Revenge Trade', category: 'emotion' },
  { name: 'Hesitant', category: 'emotion' },
] as const;

/** Count of default tags — handy for asserting a fresh account was seeded. */
export const DEFAULT_TAG_COUNT = DEFAULT_TAGS.length;
