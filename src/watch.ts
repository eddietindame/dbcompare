import fs from 'fs'
import path from 'path'
import { compareWithAdapters } from './compare'
import { printReport } from './report'
import { SqliteAdapter } from './adapters/sqlite'
import { PostgresAdapter } from './adapters/postgres'
import type { CompareConfig } from './types'

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

  let running = false
  let pending = false

  async function run() {
    if (running) {
      pending = true
      return
    }
    running = true

    const sqlite = new SqliteAdapter(sqlitePath)
    try {
      console.clear()
      const timestamp = new Date().toLocaleTimeString()
      console.log(`\x1b[2m[${timestamp}] Comparing...\x1b[0m\n`)

      const result = await compareWithAdapters(sqlite, pg, config.tables)
      await printReport(result, { verbose: options.verbose })

      console.log(
        `\x1b[2mWatching for changes... (interval: ${interval}ms)\x1b[0m`,
      )
    } catch (err) {
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

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}
