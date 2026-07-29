'use server';

import { db } from '@/db';
import { copilotSessions, copilotMessages } from '@/db/schema';
import { createServerClient } from '@/lib/supabase';
import { eq, desc, asc, and } from 'drizzle-orm';

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
  const userId = await getUserId();
  if (!db) return [];

  // Verify the session belongs to the authenticated user before returning
  // messages. Without this check, an authenticated user could read another
  // user's copilot conversations by guessing session UUIDs.
  const [session] = await db
    .select({ id: copilotSessions.id })
    .from(copilotSessions)
    .where(and(eq(copilotSessions.id, sessionId), eq(copilotSessions.userId, userId)))
    .limit(1);
  if (!session) return [];

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
  const userId = await getUserId();
  if (!db) throw new Error('Database is not configured');

  // Verify the session belongs to the authenticated user before inserting a
  // message. Without this, a user could inject messages into another user's
  // copilot conversation by guessing the session UUID.
  const [session] = await db
    .select({ id: copilotSessions.id })
    .from(copilotSessions)
    .where(and(eq(copilotSessions.id, sessionId), eq(copilotSessions.userId, userId)))
    .limit(1);
  if (!session) throw new Error('Session not found');

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
    .where(and(eq(copilotSessions.id, sessionId), eq(copilotSessions.userId, userId)));

  return newMessage;
}

export async function deleteSession(sessionId: string) {
  const userId = await getUserId();
  if (!db) throw new Error('Database is not configured');
  // Scope the delete to the authenticated user's own sessions so a user
  // cannot delete another user's session by guessing the UUID.
  await db
    .delete(copilotSessions)
    .where(and(eq(copilotSessions.id, sessionId), eq(copilotSessions.userId, userId)));
}
