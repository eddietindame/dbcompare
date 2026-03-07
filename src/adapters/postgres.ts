import { Client } from 'pg'
import type { DbAdapter } from '../types'

export class PostgresAdapter implements DbAdapter {
  private client: Client
  private connected = false

  constructor(connectionString: string) {
    this.client = new Client({ connectionString })
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.client.connect()
      this.connected = true
    }
  }

  async getRows(
    table: string,
    columns: string[],
    orderBy: string[],
    whereNull?: string[],
  ): Promise<Record<string, unknown>[]> {
    await this.ensureConnected()
    const cols = columns.map(c => `"${c}"`).join(', ')
    const order = orderBy.map(c => `"${c}"`).join(', ')
    const whereClauses = (whereNull ?? []).map(c => `"${c}" IS NULL`)
    const where =
      whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : ''
    const sql = `SELECT ${cols} FROM "${table}"${where} ORDER BY ${order}`
    const result = await this.client.query(sql)
    return result.rows
  }

  async getTableColumns(table: string): Promise<string[]> {
    await this.ensureConnected()
    const result = await this.client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      [table],
    )
    return result.rows.map((r: { column_name: string }) => r.column_name)
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.client.end()
      this.connected = false
    }
  }
}
