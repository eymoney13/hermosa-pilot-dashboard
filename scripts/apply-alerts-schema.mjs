// Applies scripts/alerts-schema.sql to the Neon database in DATABASE_URL.
//
//   node scripts/apply-alerts-schema.mjs
//
// Node does not auto-load .env.local the way Next does, so the URL is read from
// the file directly when it isn't already in the environment. Idempotent — the
// schema is all CREATE ... IF NOT EXISTS.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(join(root, ".env.local"), "utf8");
  const line = env.split("\n").find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL not set and not found in .env.local");
  return line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
}

const sql = neon(databaseUrl());
const schema = readFileSync(join(here, "alerts-schema.sql"), "utf8");

// The HTTP driver sends one statement per call, so the file is split on the
// statement terminator and replayed in order.
const statements = schema
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s && !s.split("\n").every((l) => l.trim().startsWith("--")));

for (const statement of statements) {
  const label = statement.replace(/--[^\n]*\n/g, "").replace(/\s+/g, " ").slice(0, 70);
  await sql.query(statement);
  console.log("ok:", label);
}

const [{ count }] = await sql`SELECT count(*)::int AS count FROM alert_subscribers`;
console.log(`\nalert_subscribers rows: ${count}`);
