import { Database } from 'bun:sqlite'
import type { DbAdapter } from '../types'

export class SqliteAdapter implements DbAdapter {
  private db: Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { readonly: true })
  }

  async getRows(
    table: string,
    columns: string[],
    orderBy: string[],
  ): Promise<Record<string, unknown>[]> {
    const cols = columns.map(c => `"${c}"`).join(', ')
    const order = orderBy.map(c => `"${c}"`).join(', ')
    const sql = `SELECT ${cols} FROM "${table}" ORDER BY ${order}`
    return this.db.query(sql).all() as Record<string, unknown>[]
  }

  async getTableColumns(table: string): Promise<string[]> {
    const rows = this.db.query(`PRAGMA table_info("${table}")`).all() as {
      name: string
    }[]
    return rows.map(r => r.name)
  }

  async close(): Promise<void> {
    this.db.close()
  }
}
