import type {
  DbAdapter,
  TableConfig,
  RowDiff,
  ColumnDiff,
  TableSummary,
  CompareResult,
  CompareConfig,
} from "./types";
import { SqliteAdapter } from "./adapters/sqlite";
import { PostgresAdapter } from "./adapters/postgres";

function getPkColumns(config: TableConfig): string[] {
  return Array.isArray(config.primaryKey)
    ? config.primaryKey
    : [config.primaryKey];
}

function buildPkString(row: Record<string, unknown>, pkCols: string[]): string {
  return pkCols.map((c) => String(row[c])).join("|");
}

/** Resolve which columns to compare and build the column name maps */
function resolveColumns(
  sqliteCols: string[],
  pgCols: string[],
  config: TableConfig
) {
  const ignoreSet = new Set(
    (config.ignoreColumns ?? []).map((c) => c.toLowerCase())
  );
  const mappings = config.columnMappings ?? {};

  // Build a map: sqlite column name -> postgres column name
  const sqliteToPg = new Map<string, string>();
  for (const col of sqliteCols) {
    const mapping = mappings[col];
    const pgName = mapping?.pgName ?? col;
    sqliteToPg.set(col, pgName);
  }

  // The compare columns are sqlite columns whose pg counterpart exists in pg,
  // minus ignored columns
  const compareColumns: string[] = [];
  const pgColSet = new Set(pgCols.map((c) => c.toLowerCase()));

  for (const sqliteCol of sqliteCols) {
    if (ignoreSet.has(sqliteCol.toLowerCase())) continue;
    const pgName = sqliteToPg.get(sqliteCol)!;
    if (ignoreSet.has(pgName.toLowerCase())) continue;
    if (!pgColSet.has(pgName.toLowerCase())) continue;
    compareColumns.push(sqliteCol);
  }

  return { compareColumns, sqliteToPg };
}

function comparePkValues(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  pkCols: string[],
  pgPkCols: string[]
): number {
  for (let i = 0; i < pkCols.length; i++) {
    const aVal = String(a[pkCols[i]] ?? "");
    const bVal = String(b[pgPkCols[i]] ?? "");
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
  }
  return 0;
}

async function compareTable(
  sqlite: DbAdapter,
  pg: DbAdapter,
  config: TableConfig
): Promise<TableSummary> {
  const pkCols = getPkColumns(config);
  const mappings = config.columnMappings ?? {};

  // Get columns from both sides
  const [sqliteCols, pgCols] = await Promise.all([
    sqlite.getTableColumns(config.name),
    pg.getTableColumns(config.name),
  ]);

  const { compareColumns, sqliteToPg } = resolveColumns(
    sqliteCols,
    pgCols,
    config
  );

  // Build the list of columns to fetch from each side
  const sqliteFetchCols = [
    ...new Set([...pkCols, ...compareColumns]),
  ];
  const pgPkCols = pkCols.map((c) => sqliteToPg.get(c) ?? c);
  const pgFetchCols = [
    ...new Set([
      ...pgPkCols,
      ...compareColumns.map((c) => sqliteToPg.get(c) ?? c),
    ]),
  ];

  // Fetch rows sorted by PK
  const [sqliteRows, pgRows] = await Promise.all([
    sqlite.getRows(config.name, sqliteFetchCols, pkCols),
    pg.getRows(config.name, pgFetchCols, pgPkCols),
  ]);

  const diffs: RowDiff[] = [];
  let si = 0;
  let pi = 0;

  while (si < sqliteRows.length && pi < pgRows.length) {
    const sRow = sqliteRows[si];
    const pRow = pgRows[pi];
    const cmp = comparePkValues(sRow, pRow, pkCols, pgPkCols);

    if (cmp < 0) {
      // Row only in SQLite
      diffs.push({
        table: config.name,
        primaryKey: Object.fromEntries(pkCols.map((c) => [c, sRow[c]])),
        type: "missing_in_postgres",
      });
      si++;
    } else if (cmp > 0) {
      // Row only in Postgres
      diffs.push({
        table: config.name,
        primaryKey: Object.fromEntries(pgPkCols.map((c) => [c, pRow[c]])),
        type: "missing_in_sqlite",
      });
      pi++;
    } else {
      // Both exist — compare values
      const colDiffs: ColumnDiff[] = [];
      for (const col of compareColumns) {
        if (pkCols.includes(col)) continue;
        const pgCol = sqliteToPg.get(col) ?? col;
        let sVal = sRow[col];
        let pVal = pRow[pgCol];

        const mapping = mappings[col];
        if (mapping?.normalize) {
          [sVal, pVal] = mapping.normalize(sVal, pVal);
        }

        // Handle null/undefined equivalence
        const sNull = sVal === null || sVal === undefined;
        const pNull = pVal === null || pVal === undefined;
        if (sNull && pNull) continue;

        if (sNull !== pNull || String(sVal) !== String(pVal)) {
          colDiffs.push({
            column: col,
            sqliteValue: sRow[col],
            postgresValue: pRow[pgCol],
          });
        }
      }
      if (colDiffs.length > 0) {
        diffs.push({
          table: config.name,
          primaryKey: Object.fromEntries(pkCols.map((c) => [c, sRow[c]])),
          type: "value_mismatch",
          columns: colDiffs,
        });
      }
      si++;
      pi++;
    }
  }

  // Remaining SQLite rows
  while (si < sqliteRows.length) {
    const sRow = sqliteRows[si];
    diffs.push({
      table: config.name,
      primaryKey: Object.fromEntries(pkCols.map((c) => [c, sRow[c]])),
      type: "missing_in_postgres",
    });
    si++;
  }

  // Remaining Postgres rows
  while (pi < pgRows.length) {
    const pRow = pgRows[pi];
    diffs.push({
      table: config.name,
      primaryKey: Object.fromEntries(pgPkCols.map((c) => [c, pRow[c]])),
      type: "missing_in_sqlite",
    });
    pi++;
  }

  return {
    table: config.name,
    sqliteRowCount: sqliteRows.length,
    postgresRowCount: pgRows.length,
    missingInPostgres: diffs.filter((d) => d.type === "missing_in_postgres")
      .length,
    missingInSqlite: diffs.filter((d) => d.type === "missing_in_sqlite").length,
    valueMismatches: diffs.filter((d) => d.type === "value_mismatch").length,
    diffs,
  };
}

export async function compare(config: CompareConfig): Promise<CompareResult> {
  const sqlite = new SqliteAdapter(config.sqlite.path);
  const pg = new PostgresAdapter(config.postgres.connectionString);

  try {
    const tables: TableSummary[] = [];
    for (const tableConfig of config.tables) {
      const summary = await compareTable(sqlite, pg, tableConfig);
      tables.push(summary);
    }

    return {
      tables,
      totalDiffs: tables.reduce(
        (sum, t) =>
          sum + t.missingInPostgres + t.missingInSqlite + t.valueMismatches,
        0
      ),
    };
  } finally {
    await Promise.all([sqlite.close(), pg.close()]);
  }
}
