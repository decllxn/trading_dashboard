import { db } from './db/index.ts';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  if (!db) {
    console.error('Database is not configured. Check DATABASE_URL.');
    process.exit(1);
  }

  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/0008_market_data_cache.sql');
  console.log(`Reading migration from ${migrationPath}...`);
  
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  
  // Remove SQL comments (lines starting with --)
  const cleanSql = migrationSql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');

  // Split migration statements by semicolon, ignoring empty lines
  const statements = cleanSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  console.log(`Executing ${statements.length} SQL statements...`);
  
  for (const statement of statements) {
    console.log(`Running: ${statement.substring(0, 100).replace(/\n/g, ' ')}...`);
    await db.execute(sql.raw(statement));
  }
  
  console.log('Migration successfully executed!');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
