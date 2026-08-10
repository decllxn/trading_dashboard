import postgres from 'postgres';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  let databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl && fs.existsSync('.env')) {
    const envContent = fs.readFileSync('.env', 'utf8');
    const match = envContent.match(/^DATABASE_URL=(.*)$/m);
    if (match) {
      databaseUrl = match[1].trim();
    }
  }

  if (!databaseUrl) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  console.log('Connecting to database...');
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '0016_punishments_and_habits.sql');
    const sqlContent = fs.readFileSync(migrationPath, 'utf8');

    console.log('Executing migration 0016_punishments_and_habits.sql...');
    await sql.unsafe(sqlContent);
    console.log('Migration 0016 executed successfully!');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await sql.end();
  }
}

runMigration();
