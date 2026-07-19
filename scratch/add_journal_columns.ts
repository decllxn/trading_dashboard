import { db } from '../db/index.ts';
import { sql } from 'drizzle-orm';

async function main() {
  if (!db) {
    console.error('Database is not configured.');
    return;
  }
  console.log('Adding columns to "journal_entries"...');
  try {
    await db.execute(sql`
      ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS text_content text;
    `);
    console.log('Column "text_content" added successfully!');
    
    await db.execute(sql`
      ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS mistakes jsonb DEFAULT '[]'::jsonb;
    `);
    console.log('Column "mistakes" added successfully!');
  } catch (err: any) {
    console.error('Failed to add columns:', err.message);
  }
}

main();
