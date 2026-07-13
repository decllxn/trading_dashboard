'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase';

export async function saveJournalEntry(
  date: string,
  content: any,
  textContent: string,
  mood: string | null,
  mistakes: string[]
) {
  const supabase = createServerClient();
  if (!supabase) return { error: 'Database client unavailable.' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const { data, error } = await supabase
    .from('journal_entries')
    .upsert({
      user_id: user.id,
      date,
      content,
      text_content: textContent,
      mood,
      mistakes,
    }, { onConflict: 'user_id,date' })
    .select('id')
    .single();

  if (error) return { error: error.message };

  revalidatePath('/dashboard/journal');
  revalidatePath('/dashboard');
  return { id: data.id };
}

export async function linkTradeToJournal(journalEntryId: string, tradeId: string) {
  const supabase = createServerClient();
  if (!supabase) return { error: 'Database client unavailable.' };

  const { error } = await supabase
    .from('journal_trade_links')
    .insert({
      journal_entry_id: journalEntryId,
      trade_id: tradeId,
    });

  if (error) return { error: error.message };

  revalidatePath('/dashboard/journal');
  revalidatePath(`/dashboard/trades/${tradeId}`);
  return {};
}

export async function unlinkTradeFromJournal(journalEntryId: string, tradeId: string) {
  const supabase = createServerClient();
  if (!supabase) return { error: 'Database client unavailable.' };

  const { error } = await supabase
    .from('journal_trade_links')
    .delete()
    .match({
      journal_entry_id: journalEntryId,
      trade_id: tradeId,
    });

  if (error) return { error: error.message };

  revalidatePath('/dashboard/journal');
  revalidatePath(`/dashboard/trades/${tradeId}`);
  return {};
}

export async function searchJournalEntries(keyword: string) {
  const supabase = createServerClient();
  if (!supabase) return [];

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !keyword.trim()) return [];

  // Use a simple ilike for now or postgres textSearch if preferred.
  // Supabase postgrest exposes textSearch:
  const { data, error } = await supabase
    .from('journal_entries')
    .select('id, date, mood, mistakes, text_content')
    .eq('user_id', user.id)
    .textSearch('text_content', keyword, { type: 'websearch' })
    .order('date', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Search error', error);
    return [];
  }
  return data;
}
