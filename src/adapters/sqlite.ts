import initSqlJs, { type Database } from "sql.js";
import fs from "fs";
import type { DbAdapter } from "../types";

export class SqliteAdapter implements DbAdapter {
  private db: Database | null = null;
  private initPromise: Promise<Database>;

  constructor(dbPath: string) {
    this.initPromise = (async () => {
      const SQL = await initSqlJs();
      const buffer = fs.readFileSync(dbPath);
      this.db = new SQL.Database(buffer);
      return this.db;
    })();
  }

  private async getDb(): Promise<Database> {
    if (this.db) return this.db;
    return this.initPromise;
  }

  async getRows(
    table: string,
    columns: string[],
    orderBy: string[]
  ): Promise<Record<string, unknown>[]> {
    const db = await this.getDb();
    const cols = columns.map((c) => `"${c}"`).join(", ");
    const order = orderBy.map((c) => `"${c}"`).join(", ");
    const sql = `SELECT ${cols} FROM "${table}" ORDER BY ${order}`;
    const stmt = db.prepare(sql);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push(row as Record<string, unknown>);
    }
    stmt.free();
    return rows;
  }

  async getTableColumns(table: string): Promise<string[]> {
    const db = await this.getDb();
    const stmt = db.prepare(`PRAGMA table_info("${table}")`);
    const columns: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { name: string };
      columns.push(row.name);
    }
    stmt.free();
    return columns;
  }

  async close(): Promise<void> {
    const db = await this.getDb();
    db.close();
    this.db = null;
  }
}
