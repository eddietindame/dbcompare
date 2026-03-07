import fs from 'fs'
import path from 'path'
import notifier from 'node-notifier'
import { compareWithAdapters, resolveTableConfigs } from './compare'
import { renderReport } from './report'
import { SqliteAdapter } from './adapters/sqlite'
import { PostgresAdapter } from './adapters/postgres'
import type { CompareConfig, CompareResult } from './types'

export async function watch(
  config: CompareConfig,
  options: {
    verbose?: boolean
    interval?: number
  } = {},
): Promise<void> {
  const interval = options.interval ?? 3000
  const sqlitePath = path.resolve(config.sqlite.path)
  const pg = new PostgresAdapter(config.postgres.connectionString)
  const tableConfigs = resolveTableConfigs(config)

  let running = false
  let pending = false
  let lastDiffCount = -1

  async function run() {
    if (running) {
      pending = true
      return
    }
    running = true

    const sqlite = new SqliteAdapter(sqlitePath)
    try {
      const result = await compareWithAdapters(sqlite, pg, tableConfigs)
      const report = await renderReport(result, { verbose: options.verbose })

      const timestamp = new Date().toLocaleTimeString()
      const header = `\x1b[2m[${timestamp}] Compared ${config.tables.length} table(s)\x1b[0m\n`
      const footer =
        `\x1b[2mWatching for changes... (interval: ${interval}ms)\n` +
        `\n` +
        `q quit  r refresh  Ctrl+C exit\x1b[0m`

      // Single write to avoid flash
      const output = header + report + '\n' + footer
      console.clear()
      process.stdout.write(output + '\n')

      // Notify on new diffs
      if (shouldNotify(result.totalDiffs, lastDiffCount)) {
        notify(result)
      }
      lastDiffCount = result.totalDiffs
    } catch (err) {
      console.clear()
      console.error('Comparison failed:', err)
    } finally {
      await sqlite.close()
      running = false
    }

    if (pending) {
      pending = false
      await run()
    }
  }

  // Initial run
  await run()

  // Watch SQLite file for changes (debounced)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const watcher = fs.watch(sqlitePath, () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(run, 300)
  })

  // Also watch WAL file if it exists
  const walPath = sqlitePath + '-wal'
  let walWatcher: fs.FSWatcher | null = null
  if (fs.existsSync(walPath)) {
    walWatcher = fs.watch(walPath, () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(run, 300)
    })
  }

  // Poll Postgres on interval
  const pollTimer = setInterval(run, interval)

  // Cleanup on exit
  const cleanup = async () => {
    watcher.close()
    walWatcher?.close()
    clearInterval(pollTimer)
    if (debounceTimer) clearTimeout(debounceTimer)
    await pg.close()
    process.exit(0)
  }

  // Keyboard input
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on('data', (key: Buffer) => {
      const ch = key.toString()
      if (ch === 'q' || ch === '\x03') {
        // q or Ctrl+C
        cleanup()
      } else if (ch === 'r') {
        run()
      }
    })
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}

export function shouldNotify(
  currentDiffs: number,
  lastDiffCount: number,
): boolean {
  return currentDiffs > 0 && currentDiffs !== lastDiffCount
}

function notify(result: CompareResult) {
  const tables = result.tables.filter(
    t =>
      t.missingInPostgres > 0 || t.missingInSqlite > 0 || t.valueMismatches > 0,
  )
  const tableNames = tables.map(t => t.table).join(', ')

  notifier.notify({
    title: `dbcompare: ${result.totalDiffs} diff(s) found`,
    message: `Tables: ${tableNames}`,
  })
}
