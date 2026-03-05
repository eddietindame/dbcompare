import Database from "better-sqlite3";
import type { DbAdapter } from "../types";

export class SqliteAdapter implements DbAdapter {
  private db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path, { readonly: true });
  }

  async getRows(
    table: string,
    columns: string[],
    orderBy: string[]
  ): Promise<Record<string, unknown>[]> {
    const cols = columns.map((c) => `"${c}"`).join(", ");
    const order = orderBy.map((c) => `"${c}"`).join(", ");
    const sql = `SELECT ${cols} FROM "${table}" ORDER BY ${order}`;
    return this.db.prepare(sql).all() as Record<string, unknown>[];
  }

  async getTableColumns(table: string): Promise<string[]> {
    const rows = this.db.prepare(`PRAGMA table_info("${table}")`).all() as {
      name: string;
    }[];
    return rows.map((r) => r.name);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
