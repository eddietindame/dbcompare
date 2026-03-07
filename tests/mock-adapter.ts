import type { DbAdapter } from '../src/types'

export class MockAdapter implements DbAdapter {
  private tables: Record<
    string,
    { columns: string[]; rows: Record<string, unknown>[] }
  > = {}

  addTable(
    name: string,
    columns: string[],
    rows: Record<string, unknown>[],
  ): void {
    this.tables[name] = { columns, rows }
  }

  async getRows(
    table: string,
    columns: string[],
    orderBy: string[],
    whereNull?: string[],
  ): Promise<Record<string, unknown>[]> {
    const t = this.tables[table]
    if (!t) throw new Error(`Table ${table} not found`)

    // Filter out rows where whereNull columns are not null
    let filtered = t.rows
    if (whereNull) {
      filtered = filtered.filter(row =>
        whereNull.every(col => row[col] === null || row[col] === undefined),
      )
    }

    // Filter to requested columns
    const rows = filtered.map(row => {
      const picked: Record<string, unknown> = {}
      for (const col of columns) {
        if (col in row) picked[col] = row[col]
      }
      return picked
    })

    // Sort by orderBy columns
    rows.sort((a, b) => {
      for (const col of orderBy) {
        const aVal = String(a[col] ?? '')
        const bVal = String(b[col] ?? '')
        if (aVal < bVal) return -1
        if (aVal > bVal) return 1
      }
      return 0
    })

    return rows
  }

  async getTableColumns(table: string): Promise<string[]> {
    const t = this.tables[table]
    if (!t) throw new Error(`Table ${table} not found`)
    return t.columns
  }

  async close(): Promise<void> {}
}
