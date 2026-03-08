import { SQL } from 'bun'
import type { DbAdapter } from '../types'

export class PostgresAdapter implements DbAdapter {
  private sql: InstanceType<typeof SQL>

  constructor(connectionString: string) {
    this.sql = new SQL({ url: connectionString })
  }

  async getRows(
    table: string,
    columns: string[],
    orderBy: string[],
    whereNull?: string[],
  ): Promise<Record<string, unknown>[]> {
    const cols = columns.map(c => `"${c}"`).join(', ')
    const order = orderBy.map(c => `"${c}"`).join(', ')
    const whereClauses = (whereNull ?? []).map(c => `"${c}" IS NULL`)
    const where =
      whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : ''
    const query = `SELECT ${cols} FROM "${table}"${where} ORDER BY ${order}`
    const rows = await this.sql.unsafe(query)
    return rows as Record<string, unknown>[]
  }

  async getTableColumns(table: string): Promise<string[]> {
    const rows = await this
      .sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${table} ORDER BY ordinal_position`
    return rows.map((r: Record<string, unknown>) => r.column_name as string)
  }

  async close(): Promise<void> {
    await this.sql.close()
  }
}
