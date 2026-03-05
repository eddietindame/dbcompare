# dbcompare

A TypeScript CLI tool for comparing data between a local SQLite database and a local/remote PostgreSQL database.

Built for offline-first apps that sync data to a backend. When your client writes to SQLite and syncs to Postgres (and other clients sync back down), you need a way to verify the data matches. Manually checking is repetitive and error-prone — this tool automates it.

It compares tables and rows with the same names and IDs across both databases, handling the common differences between SQLite and Postgres:

- **Extra columns** — the backend might have columns the client doesn't (e.g. `deleted_at`, `synced_at`). These can be ignored.
- **Type/format mismatches** — SQLite numbers vs Postgres `numeric(6)`, SQLite ISO strings vs Postgres `timestamptz`, SQLite `0`/`1` vs Postgres `boolean`, etc. These are resolved with configurable normalizers.
- **Column renaming** — when a column has a different name in each database.

Written in TypeScript to match the codebases I'm using this for at work.

## Setup

```bash
npm install
cp .env.example .env
cp dbcompare.config.example.ts dbcompare.config.ts
```

Edit `.env` with your database paths/URLs:

```
SQLITE_PATH=./local.db
POSTGRES_URL=postgres://user:pass@localhost:5432/myapp
```

## Defining tables

Table configs live in the `tables/` directory. See `tables/_example.ts` for the pattern:

```ts
import { money, ts } from '../src/helpers'
import type { TableConfig } from '../src/types'

export const invoices: TableConfig = {
  name: 'invoices',
  primaryKey: 'id',
  ignoreColumns: ['deleted_at', 'synced_at'],
  columnMappings: {
    amount: money,
    due_date: ts,
    created_at: ts,
    updated_at: ts,
  },
}
```

Export your tables from `tables/index.ts` and import them in `dbcompare.config.ts`:

```ts
import { invoices, lineItems } from './tables'

const config: CompareConfig = {
  sqlite: { path: process.env.SQLITE_PATH! },
  postgres: { connectionString: process.env.POSTGRES_URL! },
  tables: [invoices, lineItems],
}
```

## Usage

```bash
# Summary (first 5 diffs per table)
npm run compare -- -c dbcompare.config.ts

# All diffs
npm run compare -- -c dbcompare.config.ts -v

# JSON output
npm run compare -- -c dbcompare.config.ts --json
```

The process exits with code `1` if any diffs are found, `0` if all tables match.

## Normalizers

Built-in normalizers handle common type mismatches between SQLite and Postgres:

| Normalizer         | Use case                                                             |
| ------------------ | -------------------------------------------------------------------- |
| `numeric(dp)`      | SQLite integer/float vs Postgres `numeric` with fixed decimal places |
| `timestamp`        | SQLite ISO string vs Postgres `timestamptz` (compares as ms)         |
| `timestampSeconds` | Same as above but ignores sub-second precision                       |
| `boolean`          | SQLite `0`/`1` vs Postgres `boolean`                                 |
| `textBoolean`      | SQLite `"true"`/`"false"` vs Postgres `boolean`                      |
| `json`             | SQLite JSON text vs Postgres `jsonb`                                 |
| `caseInsensitive`  | Case-insensitive string comparison                                   |
| `nullish`          | Treats `null` and `undefined` as equivalent                          |
| `round(dp)`        | Rounds both sides to `dp` decimal places                             |

Convenience helpers are exported from `src/helpers.ts`:

```ts
import { money, ts } from '../src/helpers'

// money = { normalize: numeric(6) }
// ts    = { normalize: timestamp }
```

You can write custom normalizers — they're just functions:

```ts
const myNormalizer: Normalizer = (sqliteVal, pgVal) => {
  // Transform both values so they can be compared with ===
  return [transform(sqliteVal), transform(pgVal)]
}
```

## Column mapping options

```ts
columnMappings: {
  // Just normalize the value
  amount: { normalize: numeric(6) },

  // Column has a different name in Postgres
  active: { pgName: 'is_active', normalize: boolean },
}
```

## Programmatic usage

```ts
import { compare, printReport, normalizers } from './src'

const result = await compare(config)
await printReport(result, { verbose: true })

// Or inspect the result directly
for (const table of result.tables) {
  console.log(table.table, table.diffs.length)
}
```
