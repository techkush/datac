import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "./prisma";

// Schema bootstrap for the local SQLite database.
//
// The packaged app (~/.datac/app) points DATABASE_URL at ~/.datac/datac.db,
// but nothing outside the dev repo ever runs `prisma migrate deploy` — so on
// a fresh machine the driver creates an empty 0-byte file and every page
// 500s with "The table `main.docs` does not exist" (rendered by Next as
// "This page couldn’t load"). To prevent that, apply any unapplied
// migration.sql from prisma/migrations/ here, once, at server startup.
//
// Bookkeeping uses Prisma's own `_prisma_migrations` table (same DDL and
// sha256 checksums), so a dev checkout can keep using `prisma migrate` on
// the same file without conflicts.

const MIGRATIONS_TABLE_DDL = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)`;

interface Migration {
  name: string;
  sql: string;
}

function readMigrations(): Migration[] {
  // dev checkout: <repo>/prisma/migrations; installed app: install.js copies
  // the folder next to server.js, and the daemon runs with cwd = app dir.
  const dir = path.join(process.cwd(), "prisma", "migrations");
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Migration[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      out.push({
        name: e.name,
        sql: fs.readFileSync(path.join(dir, e.name, "migration.sql"), "utf8"),
      });
    } catch {}
  }
  // migration folders are timestamp-prefixed, so name order = apply order
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Split a migration.sql into single statements ($executeRawUnsafe runs one
// statement per call). Statements in Prisma-generated SQLite migrations never
// contain embedded semicolons, so a split at end-of-line semicolons is safe.
function splitStatements(sql: string): string[] {
  return sql
    .split(/;[ \t]*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.replace(/^--.*$/gm, "").trim().length > 0);
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<unknown[]>(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`,
    name,
  );
  return rows.length > 0;
}

async function recordApplied(m: Migration): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations"
       (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
     VALUES (?, ?, ?, current_timestamp, current_timestamp, 1)`,
    crypto.randomUUID(),
    crypto.createHash("sha256").update(m.sql).digest("hex"),
    m.name,
  );
}

export async function ensureSqliteSchema(): Promise<void> {
  if (!(process.env.DATABASE_URL || "").startsWith("file:")) return;

  const migrations = readMigrations();
  if (!migrations.length) return;

  await prisma.$executeRawUnsafe(MIGRATIONS_TABLE_DDL);
  const rows = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
  );
  const applied = new Set(rows.map((r) => r.migration_name));

  // Baseline: schema already present (e.g. created via `prisma db push`) but
  // no migration history — record everything as applied without executing.
  if (!applied.size && (await tableExists("docs"))) {
    for (const m of migrations) await recordApplied(m);
    return;
  }

  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    for (const stmt of splitStatements(m.sql)) {
      await prisma.$executeRawUnsafe(stmt);
    }
    await recordApplied(m);
    console.log(`datac: applied migration ${m.name}`);
  }
}
