import {readFileSync} from 'node:fs';
import {neon} from '@neondatabase/serverless';

// Explicit test-only entry point. Never loads production credentials implicitly.
if (!process.env.DATABASE_URL || !process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ||
    process.env.NEPTUNE_TEST_DATABASE_CONFIRMED !== 'true') {
  throw new Error('Set an isolated test DATABASE_URL, a Stripe test key, and NEPTUNE_TEST_DATABASE_CONFIRMED=true.');
}
const sql = neon(process.env.DATABASE_URL);
const files = ['subscriptions-schema.sql', 'payment-first-schema.sql'];
const statements = files.flatMap(file => readFileSync(new URL(file, import.meta.url), 'utf8')
  .replace(/--[^\n]*/g, '').split(';').map(value => value.trim()).filter(Boolean));
await sql.transaction(statements.map(statement => sql.query(statement)));
console.log('Applied payment-first schema to the explicitly selected test database.');
