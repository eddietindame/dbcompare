import 'dotenv/config'
import type { CompareConfig } from './src/types'
import { invoices, lineItems } from './tables/_example'

const config: CompareConfig = {
  sqlite: { path: process.env.SQLITE_PATH! },
  postgres: { connectionString: process.env.POSTGRES_URL! },
  tables: [invoices, lineItems],
}

export default config
