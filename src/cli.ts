import { Command } from 'commander'
import path from 'path'
import { compare } from './compare'
import { printReport } from './report'
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
  .action(async opts => {
    const configPath = path.resolve(opts.config)

    let config: CompareConfig
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(configPath)
      config = mod.default ?? mod
    } catch (err) {
      console.error(`Failed to load config from ${configPath}:`)
      console.error(err)
      process.exit(1)
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
