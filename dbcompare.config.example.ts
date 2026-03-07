import 'dotenv/config'
import type { CompareConfig } from './src/types'
// In your actual config, import from './tables' (your barrel file)
// This example imports directly from the example file
import { invoices, lineItems } from './tables/_example'

const config: CompareConfig = {
  sqlite: { path: process.env.SQLITE_PATH! },
  postgres: { connectionString: process.env.POSTGRES_URL! },
  defaults: {
    softDeleteColumn: 'deleted_at',
  },
  tables: [invoices, lineItems],
}

export default config
