// Temporary: inspect RLS enable/force state + policies on user tables.
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

const state = await sql`
  SELECT c.relname AS table_name,
         c.relrowsecurity AS rls_enabled,
         c.relforcerowsecurity AS rls_forced
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY c.relname
`;
console.log('RLS enable/force state:');
for (const r of state)
  console.log(
    `  ${r.table_name.padEnd(22)} enabled=${r.rls_enabled} forced=${r.rls_forced}`,
  );

const policies = await sql`
  SELECT tablename, policyname, cmd, roles, qual
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname
`;
console.log('\nPolicies:');
if (policies.length === 0) console.log('  (none — RLS is default-deny for all tables)');
for (const p of policies)
  console.log(
    `  ${p.tablename.padEnd(22)} ${p.policyname.padEnd(28)} ${p.cmd} roles={${p.roles.join(',')}} using=${p.qual}`,
  );

await sql.end();
