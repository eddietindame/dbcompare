export type Normalizer = (
  sqliteVal: unknown,
  pgVal: unknown
) => [unknown, unknown];

export type ColumnMapping = {
  /** If the column has a different name in Postgres */
  pgName?: string;
  /** Normalize both values before comparing */
  normalize?: Normalizer;
};

export type TableConfig = {
  name: string;
  /** Column name(s) that form the primary key */
  primaryKey: string | string[];
  /** Columns to skip when comparing (e.g. deleted_at, synced_at) */
  ignoreColumns?: string[];
  /** Per-column mappings and normalizers */
  columnMappings?: Record<string, ColumnMapping>;
};

export type CompareConfig = {
  sqlite: { path: string };
  postgres: { connectionString: string };
  tables: TableConfig[];
};

export type ColumnDiff = {
  column: string;
  sqliteValue: unknown;
  postgresValue: unknown;
};

export type RowDiff = {
  table: string;
  primaryKey: Record<string, unknown>;
  type: "missing_in_postgres" | "missing_in_sqlite" | "value_mismatch";
  columns?: ColumnDiff[];
};

export type TableSummary = {
  table: string;
  sqliteRowCount: number;
  postgresRowCount: number;
  missingInPostgres: number;
  missingInSqlite: number;
  valueMismatches: number;
  diffs: RowDiff[];
};

export type CompareResult = {
  tables: TableSummary[];
  totalDiffs: number;
};

export interface DbAdapter {
  getRows(
    table: string,
    columns: string[],
    orderBy: string[]
  ): Promise<Record<string, unknown>[]>;
  getTableColumns(table: string): Promise<string[]>;
  close(): Promise<void>;
}
