import type { CompareResult, RowDiff } from './types'
import type { ChalkInstance } from 'chalk'

let chalk: ChalkInstance

async function getChalk(): Promise<ChalkInstance> {
  if (!chalk) {
    chalk = (await import('chalk')).default
  }
  return chalk
}

function truncate(val: unknown, maxLen = 40): string {
  const str =
    val === null ? 'NULL' : val === undefined ? 'undefined' : String(val)
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '\u2026' : str
}

function pkString(pk: Record<string, unknown>): string {
  return Object.entries(pk)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ')
}

function renderDiffs(diffs: RowDiff[], c: ChalkInstance): string {
  const lines: string[] = []
  for (const diff of diffs) {
    const pk = pkString(diff.primaryKey)
    switch (diff.type) {
      case 'missing_in_postgres':
        lines.push(c.yellow(`  [${pk}] missing in Postgres`))
        break
      case 'missing_in_sqlite':
        lines.push(c.yellow(`  [${pk}] missing in SQLite`))
        break
      case 'value_mismatch':
        lines.push(c.red(`  [${pk}] value mismatch:`))
        for (const col of diff.columns ?? []) {
          lines.push(
            `    ${c.dim(col.column)}: SQLite=${c.cyan(truncate(col.sqliteValue))} Postgres=${c.magenta(truncate(col.postgresValue))}`,
          )
        }
        break
    }
  }
  return lines.join('\n')
}

export async function renderReport(
  result: CompareResult,
  options: { verbose?: boolean; json?: boolean } = {},
): Promise<string> {
  if (options.json) {
    return JSON.stringify(result, null, 2)
  }

  const c = await getChalk()
  const lines: string[] = []

  for (const table of result.tables) {
    lines.push('')
    lines.push(c.bold.underline(`Table: ${table.table}`))
    lines.push(
      `  SQLite rows: ${table.sqliteRowCount}  |  Postgres rows: ${table.postgresRowCount}`,
    )

    if (table.diffs.length === 0) {
      lines.push(c.green('  All rows match.'))
      continue
    }

    if (table.missingInPostgres > 0) {
      lines.push(c.yellow(`  Missing in Postgres: ${table.missingInPostgres}`))
    }
    if (table.missingInSqlite > 0) {
      lines.push(c.yellow(`  Missing in SQLite: ${table.missingInSqlite}`))
    }
    if (table.valueMismatches > 0) {
      lines.push(c.red(`  Value mismatches: ${table.valueMismatches}`))
    }

    if (options.verbose) {
      lines.push(renderDiffs(table.diffs, c))
    } else {
      const shown = Math.min(table.diffs.length, 5)
      lines.push(renderDiffs(table.diffs.slice(0, shown), c))
      if (table.diffs.length > shown) {
        lines.push(c.dim(`  ... and ${table.diffs.length - shown} more diffs`))
      }
    }
  }

  lines.push('')
  if (result.totalDiffs === 0) {
    lines.push(c.green.bold('All tables match.'))
  } else {
    lines.push(c.red.bold(`Total diffs: ${result.totalDiffs}`))
  }
  lines.push('')

  return lines.join('\n')
}

export async function printReport(
  result: CompareResult,
  options: { verbose?: boolean; json?: boolean } = {},
): Promise<void> {
  console.log(await renderReport(result, options))
}
