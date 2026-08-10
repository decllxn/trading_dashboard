'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase';
import { db } from '@/db';
import { capitalTransactions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { encryptText } from '@/lib/crypto';

export async function addCapitalTransaction(formData: FormData) {
  const supabase = createServerClient();
  if (!supabase) return { error: 'Not authenticated' };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const type = formData.get('type') as 'deposit' | 'withdrawal';
  const amountStr = formData.get('amount') as string;
  const dateStr = formData.get('date') as string;
  const rawBrokerName = (formData.get('brokerName') as string)?.trim() || null;
  const rawNote = (formData.get('note') as string)?.trim() || null;

  const brokerName = rawBrokerName ? encryptText(rawBrokerName, user.id) : null;
  const note = rawNote ? encryptText(rawNote, user.id) : null;

  if (!type || (type !== 'deposit' && type !== 'withdrawal')) {
    return { error: 'Invalid transaction type.' };
  }

  const amount = Number(amountStr);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Amount must be a positive number.' };
  }

  const date = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(date.getTime())) {
    return { error: 'Invalid date.' };
  }

  try {
    if (db) {
      await db.insert(capitalTransactions).values({
        userId: user.id,
        type,
        amount: amount.toString(),
        date,
        brokerName,
        note,
      });
    } else {
      const { error } = await supabase.from('capital_transactions').insert({
        user_id: user.id,
        type,
        amount,
        date: date.toISOString(),
        broker_name: brokerName,
        note,
      });
      if (error) throw error;
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/capital');
    return { success: true };
  } catch (err: any) {
    console.error('Error adding capital transaction:', err);
    return { error: err.message || 'Failed to save capital transaction.' };
  }
}

export async function deleteCapitalTransaction(id: string) {
  const supabase = createServerClient();
  if (!supabase) return { error: 'Not authenticated' };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  try {
    if (db) {
      await db
        .delete(capitalTransactions)
        .where(eq(capitalTransactions.id, id));
    } else {
      const { error } = await supabase
        .from('capital_transactions')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/capital');
    return { success: true };
  } catch (err: any) {
    console.error('Error deleting capital transaction:', err);
    return { error: err.message || 'Failed to delete transaction.' };
  }
}
