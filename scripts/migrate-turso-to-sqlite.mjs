import { createClient } from "@libsql/client";

const sourceUrl = process.env.TURSO_DATABASE_URL;
const sourceAuthToken = process.env.TURSO_AUTH_TOKEN;
const targetPath = process.env.TARGET_SQLITE_PATH || "./prisma/dev.db";
const batchSize = Number(process.env.MIGRATION_BATCH_SIZE || 500);

if (!sourceUrl || !sourceAuthToken) {
  throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required");
}

const source = createClient({
  url: sourceUrl,
  authToken: sourceAuthToken,
});

const target = createClient({
  url: `file:${targetPath}`,
});

const tables = [
  "Project",
  "CanvasNode",
  "CanvasEdge",
  "ImageJob",
  "ImageHistoryItem",
  "User",
  "Session",
  "Account",
  "Verification",
];

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function normalizeValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "bigint") return value.toString();
  return value;
}

async function tableExists(client, table) {
  const result = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [table],
  });
  return result.rows.length > 0;
}

async function getColumns(client, table) {
  const result = await client.execute(`PRAGMA table_info(${quoteIdent(table)})`);
  return result.rows.map((row) => String(row.name));
}

async function countRows(client, table) {
  const result = await client.execute(`SELECT COUNT(*) AS count FROM ${quoteIdent(table)}`);
  return Number(result.rows[0]?.count ?? 0);
}

async function clearTargetTables() {
  await target.execute("PRAGMA foreign_keys = OFF");
  for (const table of [...tables].reverse()) {
    if (await tableExists(target, table)) {
      await target.execute(`DELETE FROM ${quoteIdent(table)}`);
    }
  }
  await target.execute("DELETE FROM sqlite_sequence WHERE name IN (" + tables.map(() => "?").join(",") + ")", tables).catch(() => {});
  await target.execute("PRAGMA foreign_keys = ON");
}

async function copyTable(table) {
  if (!(await tableExists(source, table))) {
    console.log(`${table}: skipped, missing in source`);
    return;
  }

  if (!(await tableExists(target, table))) {
    console.log(`${table}: skipped, missing in target`);
    return;
  }

  const sourceColumns = await getColumns(source, table);
  const targetColumns = await getColumns(target, table);
  const columns = targetColumns.filter((column) => sourceColumns.includes(column));
  const total = await countRows(source, table);

  if (columns.length === 0) {
    console.log(`${table}: skipped, no shared columns`);
    return;
  }

  const columnList = columns.map(quoteIdent).join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  const insertSql = `INSERT INTO ${quoteIdent(table)} (${columnList}) VALUES (${placeholders})`;

  let copied = 0;
  while (copied < total) {
    const selectSql = `SELECT ${columnList} FROM ${quoteIdent(table)} LIMIT ? OFFSET ?`;
    const result = await source.execute({
      sql: selectSql,
      args: [batchSize, copied],
    });

    if (result.rows.length === 0) break;

    await target.batch(
      result.rows.map((row) => ({
        sql: insertSql,
        args: columns.map((column) => normalizeValue(row[column])),
      })),
      "write",
    );

    copied += result.rows.length;
    console.log(`${table}: ${copied}/${total}`);
  }
}

try {
  console.log(`Target SQLite: ${targetPath}`);
  await clearTargetTables();
  for (const table of tables) {
    await copyTable(table);
  }

  console.log("Final target counts:");
  for (const table of tables) {
    if (await tableExists(target, table)) {
      console.log(`${table}: ${await countRows(target, table)}`);
    }
  }
} finally {
  source.close();
  target.close();
}
