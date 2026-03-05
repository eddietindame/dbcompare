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

export async function printReport(
  result: CompareResult,
  options: { verbose?: boolean; json?: boolean } = {},
): Promise<void> {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  const c = await getChalk()

  for (const table of result.tables) {
    console.log('')
    console.log(c.bold.underline(`Table: ${table.table}`))
    console.log(
      `  SQLite rows: ${table.sqliteRowCount}  |  Postgres rows: ${table.postgresRowCount}`,
    )

    if (table.diffs.length === 0) {
      console.log(c.green('  All rows match.'))
      continue
    }

    if (table.missingInPostgres > 0) {
      console.log(c.yellow(`  Missing in Postgres: ${table.missingInPostgres}`))
    }
    if (table.missingInSqlite > 0) {
      console.log(c.yellow(`  Missing in SQLite: ${table.missingInSqlite}`))
    }
    if (table.valueMismatches > 0) {
      console.log(c.red(`  Value mismatches: ${table.valueMismatches}`))
    }

    if (options.verbose) {
      printDiffs(table.diffs, c)
    } else {
      const shown = Math.min(table.diffs.length, 5)
      printDiffs(table.diffs.slice(0, shown), c)
      if (table.diffs.length > shown) {
        console.log(c.dim(`  ... and ${table.diffs.length - shown} more diffs`))
      }
    }
  }

  console.log('')
  if (result.totalDiffs === 0) {
    console.log(c.green.bold('All tables match.'))
  } else {
    console.log(c.red.bold(`Total diffs: ${result.totalDiffs}`))
  }
  console.log('')
}

function printDiffs(diffs: RowDiff[], c: ChalkInstance) {
  for (const diff of diffs) {
    const pk = pkString(diff.primaryKey)
    switch (diff.type) {
      case 'missing_in_postgres':
        console.log(c.yellow(`  [${pk}] missing in Postgres`))
        break
      case 'missing_in_sqlite':
        console.log(c.yellow(`  [${pk}] missing in SQLite`))
        break
      case 'value_mismatch':
        console.log(c.red(`  [${pk}] value mismatch:`))
        for (const col of diff.columns ?? []) {
          console.log(
            `    ${c.dim(col.column)}: SQLite=${c.cyan(truncate(col.sqliteValue))} Postgres=${c.magenta(truncate(col.postgresValue))}`,
          )
        }
        break
    }
  }
}
