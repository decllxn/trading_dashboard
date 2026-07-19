'use server';

import { db } from '@/db';
import { copilotSessions, copilotMessages } from '@/db/schema';
import { createServerClient } from '@/lib/supabase';
import { eq, desc, asc } from 'drizzle-orm';

async function getUserId() {
  const supabase = createServerClient();
  if (!supabase) throw new Error('Supabase is not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  return user.id;
}

export async function getSessions() {
  const userId = await getUserId();
  if (!db) return [];
  return db
    .select()
    .from(copilotSessions)
    .where(eq(copilotSessions.userId, userId))
    .orderBy(desc(copilotSessions.updatedAt));
}

export async function getSessionMessages(sessionId: string) {
  await getUserId(); // Check auth
  if (!db) return [];
  return db
    .select()
    .from(copilotMessages)
    .where(eq(copilotMessages.sessionId, sessionId))
    .orderBy(asc(copilotMessages.createdAt));
}

export async function createSession(title: string) {
  const userId = await getUserId();
  if (!db) throw new Error('Database is not configured');
  const [newSession] = await db
    .insert(copilotSessions)
    .values({
      userId,
      title,
    })
    .returning();
  return newSession;
}

export async function saveMessage(sessionId: string, role: 'user' | 'assistant', content: string) {
  await getUserId(); // Check auth
  if (!db) throw new Error('Database is not configured');

  // Insert the message
  const [newMessage] = await db
    .insert(copilotMessages)
    .values({
      sessionId,
      role,
      content,
    })
    .returning();

  // Update session updatedAt timestamp
  await db
    .update(copilotSessions)
    .set({ updatedAt: new Date() })
    .where(eq(copilotSessions.id, sessionId));

  return newMessage;
}

export async function deleteSession(sessionId: string) {
  await getUserId(); // Check auth
  if (!db) throw new Error('Database is not configured');
  await db
    .delete(copilotSessions)
    .where(eq(copilotSessions.id, sessionId));
}
