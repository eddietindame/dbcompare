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
  let sqliteDisconnected = false

  function isSqliteUnavailable(): boolean {
    return !fs.existsSync(sqlitePath)
  }

  function showDisconnected() {
    const timestamp = new Date().toLocaleTimeString()
    const header = `\x1b[2m[${timestamp}]\x1b[0m\n`
    const message =
      `\x1b[33m⚠  SQLite database not available\x1b[0m\n` +
      `\x1b[2m   ${sqlitePath}\x1b[0m\n` +
      `\n` +
      `\x1b[2m   Polling for reconnection every ${interval}ms...\x1b[0m\n`
    const footer =
      `\x1b[2mWatching for changes... (interval: ${interval}ms)\n` +
      `\n` +
      `q quit  r refresh  Ctrl+C exit\x1b[0m`

    console.clear()
    process.stdout.write(header + '\n' + message + '\n' + footer + '\n')
  }

  function showError(error: unknown) {
    const timestamp = new Date().toLocaleTimeString()
    const header = `\x1b[2m[${timestamp}]\x1b[0m\n`
    const errorMessage = error instanceof Error ? error.message : String(error)
    const message =
      `\x1b[31m✖  Error during comparison\x1b[0m\n` +
      `\x1b[2m   ${errorMessage}\x1b[0m\n`
    const footer =
      `\x1b[2mWatching for changes... (interval: ${interval}ms)\n` +
      `\n` +
      `q quit  r refresh  Ctrl+C exit\x1b[0m`

    console.clear()
    process.stdout.write(header + '\n' + message + '\n' + footer + '\n')
  }

  async function run() {
    if (running) {
      pending = true
      return
    }
    running = true

    if (isSqliteUnavailable()) {
      if (!sqliteDisconnected) {
        sqliteDisconnected = true
        lastDiffCount = -1
      }
      showDisconnected()
      running = false
      if (pending) {
        pending = false
        await run()
      }
      return
    }

    let sqlite: SqliteAdapter | null = null
    try {
      sqlite = new SqliteAdapter(sqlitePath)
      const result = await compareWithAdapters(sqlite, pg, tableConfigs)
      const report = await renderReport(result, { verbose: options.verbose })

      if (sqliteDisconnected) {
        sqliteDisconnected = false
        setupSqliteWatcher()
      }

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
    } catch (error) {
      if (isSqliteUnavailable()) {
        if (!sqliteDisconnected) {
          sqliteDisconnected = true
          lastDiffCount = -1
        }
        showDisconnected()
      } else {
        showError(error)
      }
    } finally {
      if (sqlite) await sqlite.close()
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
  let watcher: fs.FSWatcher | null = null
  let walWatcher: fs.FSWatcher | null = null

  function setupSqliteWatcher() {
    // Clean up existing watchers
    watcher?.close()
    walWatcher?.close()

    try {
      watcher = fs.watch(sqlitePath, () => {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(run, 300)
      })
      watcher.on('error', () => {
        // File was likely deleted; polling will handle reconnection
        watcher?.close()
        watcher = null
      })
    } catch {
      // File doesn't exist yet; polling will handle reconnection
      watcher = null
    }

    // Also watch WAL file if it exists
    const walPath = sqlitePath + '-wal'
    try {
      if (fs.existsSync(walPath)) {
        walWatcher = fs.watch(walPath, () => {
          if (debounceTimer) clearTimeout(debounceTimer)
          debounceTimer = setTimeout(run, 300)
        })
        walWatcher.on('error', () => {
          walWatcher?.close()
          walWatcher = null
        })
      }
    } catch {
      walWatcher = null
    }
  }

  setupSqliteWatcher()

  // Poll Postgres on interval
  const pollTimer = setInterval(run, interval)

  // Cleanup on exit
  const cleanup = async () => {
    watcher?.close()
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
