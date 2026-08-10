'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase';
import { encryptText, decryptText, encryptJson, decryptJson } from '@/lib/crypto';

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

  const encryptedContent = encryptJson(content, user.id);
  const encryptedTextContent = encryptText(textContent, user.id);
  const encryptedMood = mood ? encryptText(mood, user.id) : null;
  const encryptedMistakes = encryptJson(mistakes, user.id);

  const { data, error } = await supabase
    .from('journal_entries')
    .upsert({
      user_id: user.id,
      date,
      content: encryptedContent,
      text_content: encryptedTextContent,
      mood: encryptedMood,
      mistakes: encryptedMistakes,
    }, { onConflict: 'user_id,date' })
    .select('id')
    .single();

  if (error) return { error: error.message };

  // Always delete existing links first
  await supabase
    .from('journal_trade_links')
    .delete()
    .eq('journal_entry_id', data.id);

  // Match trades executed on this day
  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay = `${date}T23:59:59.999Z`;

  const { data: matchedTrades } = await supabase
    .from('trades')
    .select('id')
    .eq('user_id', user.id)
    .gte('entry_time', startOfDay)
    .lte('entry_time', endOfDay);

  if (matchedTrades && matchedTrades.length > 0) {
    const linksToInsert = matchedTrades.map((t) => ({
      journal_entry_id: data.id,
      trade_id: t.id,
    }));
    await supabase.from('journal_trade_links').insert(linksToInsert);
  }

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
