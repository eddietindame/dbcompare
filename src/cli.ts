import { Command } from 'commander'
import path from 'path'
import { compare } from './compare'
import { printReport } from './report'
import { watch } from './watch'
import type { CompareConfig } from './types'

const program = new Command()

program
  .name('dbcompare')
  .description('Compare data between SQLite and PostgreSQL databases')
  .option(
    '-c, --config <path>',
    'Path to config file (JS/TS module exporting CompareConfig)',
    'dbcompare.config.ts',
  )
  .option('-v, --verbose', 'Show all diffs (not just first 5 per table)')
  .option('--json', 'Output as JSON')
  .option('-w, --watch', 'Watch for changes and re-run comparison')
  .option('--interval <ms>', 'Polling interval for watch mode in ms', '3000')
  .option('--debug', 'Log normalizer details for mismatched values')
  .action(async opts => {
    const configPath = path.resolve(opts.config)

    let config: CompareConfig
    try {
      const mod = await import(configPath)
      config = mod.default ?? mod
    } catch (err) {
      console.error(`Failed to load config from ${configPath}:`)
      console.error(err)
      process.exit(1)
    }

    if (opts.debug) {
      process.env.DBCOMPARE_DEBUG = '1'
    }

    if (opts.watch) {
      await watch(config, {
        verbose: opts.verbose,
        interval: parseInt(opts.interval, 10),
      })
      return
    }

    try {
      const result = await compare(config)
      await printReport(result, {
        verbose: opts.verbose,
        json: opts.json,
      })
      process.exit(result.totalDiffs > 0 ? 1 : 0)
    } catch (err) {
      console.error('Comparison failed:', err)
      process.exit(2)
    }
  })

program.parse()
