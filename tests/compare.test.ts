import { describe, it, expect } from 'bun:test'
import { compareTable, resolveTableConfigs } from '../src/compare'
import { MockAdapter } from './mock-adapter'
import { numeric, timestamp, boolean } from '../src/normalizers'

function makePair() {
  return { sqlite: new MockAdapter(), pg: new MockAdapter() }
}

describe('compareTable', () => {
  describe('identical data', () => {
    it('reports no diffs when rows match exactly', async () => {
      const { sqlite, pg } = makePair()
      const rows = [
        { id: '1', name: 'Alice', amount: 100 },
        { id: '2', name: 'Bob', amount: 200 },
      ]
      const cols = ['id', 'name', 'amount']

      sqlite.addTable('users', cols, rows)
      pg.addTable('users', cols, rows)

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
      })

      expect(result.diffs).toEqual([])
      expect(result.sqliteRowCount).toBe(2)
      expect(result.postgresRowCount).toBe(2)
      expect(result.missingInPostgres).toBe(0)
      expect(result.missingInSqlite).toBe(0)
      expect(result.valueMismatches).toBe(0)
    })

    it('reports no diffs for empty tables', async () => {
      const { sqlite, pg } = makePair()
      sqlite.addTable('users', ['id', 'name'], [])
      pg.addTable('users', ['id', 'name'], [])

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
      })

      expect(result.diffs).toEqual([])
      expect(result.sqliteRowCount).toBe(0)
      expect(result.postgresRowCount).toBe(0)
    })
  })

  describe('missing rows', () => {
    it('detects rows missing in postgres', async () => {
      const { sqlite, pg } = makePair()
      const cols = ['id', 'name']

      sqlite.addTable('users', cols, [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ])
      pg.addTable('users', cols, [{ id: '1', name: 'Alice' }])

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
      })

      expect(result.missingInPostgres).toBe(1)
      expect(result.diffs).toHaveLength(1)
      expect(result.diffs[0]).toMatchObject({
        type: 'missing_in_postgres',
        primaryKey: { id: '2' },
      })
    })

    it('detects rows missing in sqlite', async () => {
      const { sqlite, pg } = makePair()
      const cols = ['id', 'name']

      sqlite.addTable('users', cols, [{ id: '1', name: 'Alice' }])
      pg.addTable('users', cols, [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ])

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
      })

      expect(result.missingInSqlite).toBe(1)
      expect(result.diffs[0]).toMatchObject({
        type: 'missing_in_sqlite',
        primaryKey: { id: '2' },
      })
    })

    it('detects all rows missing when one side is empty', async () => {
      const { sqlite, pg } = makePair()
      const cols = ['id', 'name']

      sqlite.addTable('users', cols, [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ])
      pg.addTable('users', cols, [])

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
      })

      expect(result.missingInPostgres).toBe(2)
      expect(result.missingInSqlite).toBe(0)
    })

    it('handles interleaved missing rows from both sides', async () => {
      const { sqlite, pg } = makePair()
      const cols = ['id', 'name']

      sqlite.addTable('users', cols, [
        { id: '1', name: 'Alice' },
        { id: '3', name: 'Charlie' },
      ])
      pg.addTable('users', cols, [
        { id: '2', name: 'Bob' },
        { id: '3', name: 'Charlie' },
      ])

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
      })

      expect(result.missingInPostgres).toBe(1) // id=1
      expect(result.missingInSqlite).toBe(1) // id=2
      expect(result.valueMismatches).toBe(0)
    })
  })

  describe('value mismatches', () => {
    it('detects differing column values', async () => {
      const { sqlite, pg } = makePair()
      const cols = ['id', 'name', 'email']

      sqlite.addTable('users', cols, [
        { id: '1', name: 'Alice', email: 'alice@old.com' },
      ])
      pg.addTable('users', cols, [
        { id: '1', name: 'Alice', email: 'alice@new.com' },
      ])

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
      })

      expect(result.valueMismatches).toBe(1)
      expect(result.diffs[0]).toMatchObject({
        type: 'value_mismatch',
        primaryKey: { id: '1' },
        columns: [
          {
            column: 'email',
            sqliteValue: 'alice@old.com',
            postgresValue: 'alice@new.com',
          },
        ],
      })
    })

    it('reports multiple column diffs in one row', async () => {
      const { sqlite, pg } = makePair()
      const cols = ['id', 'name', 'email']

      sqlite.addTable('users', cols, [
        { id: '1', name: 'Alice', email: 'alice@a.com' },
      ])
      pg.addTable('users', cols, [{ id: '1', name: 'Bob', email: 'bob@b.com' }])

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
      })

      expect(result.diffs[0].columns).toHaveLength(2)
    })

    it('detects null vs value mismatch', async () => {
      const { sqlite, pg } = makePair()
      const cols = ['id', 'name']

      sqlite.addTable('users', cols, [{ id: '1', name: null }])
      pg.addTable('users', cols, [{ id: '1', name: 'Alice' }])

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
      })

      expect(result.valueMismatches).toBe(1)
    })

    it('treats both null as equal', async () => {
      const { sqlite, pg } = makePair()
      const cols = ['id', 'name']

      sqlite.addTable('users', cols, [{ id: '1', name: null }])
      pg.addTable('users', cols, [{ id: '1', name: null }])

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
      })

      expect(result.diffs).toEqual([])
    })

    it('treats null and undefined as equal', async () => {
      const { sqlite, pg } = makePair()
      const cols = ['id', 'name']

      sqlite.addTable('users', cols, [{ id: '1', name: null }])
      pg.addTable('users', cols, [{ id: '1', name: undefined }])

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
      })

      expect(result.diffs).toEqual([])
    })
  })

  describe('ignoreColumns', () => {
    it('ignores specified columns', async () => {
      const { sqlite, pg } = makePair()

      sqlite.addTable(
        'users',
        ['id', 'name', 'deleted_at'],
        [{ id: '1', name: 'Alice', deleted_at: null }],
      )
      pg.addTable(
        'users',
        ['id', 'name', 'deleted_at'],
        [{ id: '1', name: 'Alice', deleted_at: '2026-01-01' }],
      )

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
        ignoreColumns: ['deleted_at'],
      })

      expect(result.diffs).toEqual([])
    })

    it('is case-insensitive', async () => {
      const { sqlite, pg } = makePair()

      sqlite.addTable(
        'users',
        ['id', 'Deleted_At'],
        [{ id: '1', Deleted_At: null }],
      )
      pg.addTable(
        'users',
        ['id', 'Deleted_At'],
        [{ id: '1', Deleted_At: '2026-01-01' }],
      )

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
        ignoreColumns: ['deleted_at'],
      })

      expect(result.diffs).toEqual([])
    })
  })

  describe('extra columns', () => {
    it('handles postgres having extra columns', async () => {
      const { sqlite, pg } = makePair()

      sqlite.addTable('users', ['id', 'name'], [{ id: '1', name: 'Alice' }])
      pg.addTable(
        'users',
        ['id', 'name', 'deleted_at', 'synced_at'],
        [{ id: '1', name: 'Alice', deleted_at: null, synced_at: '2026-01-01' }],
      )

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
      })

      // Extra pg columns not in sqlite are simply not compared
      expect(result.diffs).toEqual([])
    })

    it('handles sqlite having extra columns', async () => {
      const { sqlite, pg } = makePair()

      sqlite.addTable(
        'users',
        ['id', 'name', 'local_only'],
        [{ id: '1', name: 'Alice', local_only: 'data' }],
      )
      pg.addTable('users', ['id', 'name'], [{ id: '1', name: 'Alice' }])

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
      })

      expect(result.diffs).toEqual([])
    })
  })

  describe('column renaming (pgName)', () => {
    it('maps sqlite column name to postgres column name', async () => {
      const { sqlite, pg } = makePair()

      sqlite.addTable('users', ['id', 'active'], [{ id: '1', active: 1 }])
      pg.addTable('users', ['id', 'is_active'], [{ id: '1', is_active: 1 }])

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
        columnMappings: {
          active: { pgName: 'is_active' },
        },
      })

      expect(result.diffs).toEqual([])
    })

    it('detects mismatch with renamed column', async () => {
      const { sqlite, pg } = makePair()

      sqlite.addTable('users', ['id', 'active'], [{ id: '1', active: 1 }])
      pg.addTable('users', ['id', 'is_active'], [{ id: '1', is_active: 0 }])

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
        columnMappings: {
          active: { pgName: 'is_active' },
        },
      })

      expect(result.valueMismatches).toBe(1)
      expect(result.diffs[0].columns![0]).toMatchObject({
        column: 'active',
        sqliteValue: 1,
        postgresValue: 0,
      })
    })
  })

  describe('normalizers', () => {
    it('applies numeric normalizer to make integer match decimal', async () => {
      const { sqlite, pg } = makePair()
      const cols = ['id', 'amount']

      sqlite.addTable('users', cols, [{ id: '1', amount: 15000 }])
      pg.addTable('users', cols, [{ id: '1', amount: '15000.000000' }])

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
        columnMappings: {
          amount: { normalize: numeric(6) },
        },
      })

      expect(result.diffs).toEqual([])
    })

    it('applies timestamp normalizer to match ISO and Date', async () => {
      const { sqlite, pg } = makePair()
      const cols = ['id', 'created_at']

      sqlite.addTable('users', cols, [
        { id: '1', created_at: '2026-02-15T00:00:00.000Z' },
      ])
      pg.addTable('users', cols, [
        { id: '1', created_at: new Date('2026-02-15T00:00:00.000Z') },
      ])

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
        columnMappings: {
          created_at: { normalize: timestamp },
        },
      })

      expect(result.diffs).toEqual([])
    })

    it('applies boolean normalizer to match 0/1 with boolean', async () => {
      const { sqlite, pg } = makePair()
      const cols = ['id', 'active']

      sqlite.addTable('users', cols, [{ id: '1', active: 1 }])
      pg.addTable('users', cols, [{ id: '1', active: true }])

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
        columnMappings: {
          active: { normalize: boolean },
        },
      })

      expect(result.diffs).toEqual([])
    })

    it('still detects mismatch after normalizer is applied', async () => {
      const { sqlite, pg } = makePair()
      const cols = ['id', 'amount']

      sqlite.addTable('users', cols, [{ id: '1', amount: 100 }])
      pg.addTable('users', cols, [{ id: '1', amount: '200.000000' }])

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
        columnMappings: {
          amount: { normalize: numeric(6) },
        },
      })

      expect(result.valueMismatches).toBe(1)
    })

    it('combines pgName with normalizer', async () => {
      const { sqlite, pg } = makePair()

      sqlite.addTable('users', ['id', 'active'], [{ id: '1', active: 1 }])
      pg.addTable('users', ['id', 'is_active'], [{ id: '1', is_active: true }])

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
        columnMappings: {
          active: { pgName: 'is_active', normalize: boolean },
        },
      })

      expect(result.diffs).toEqual([])
    })
  })

  describe('composite primary keys', () => {
    it('handles composite PKs', async () => {
      const { sqlite, pg } = makePair()
      const cols = ['invoice_id', 'line_id', 'amount']

      sqlite.addTable('line_items', cols, [
        { invoice_id: '1', line_id: 'a', amount: 100 },
        { invoice_id: '1', line_id: 'b', amount: 200 },
      ])
      pg.addTable('line_items', cols, [
        { invoice_id: '1', line_id: 'a', amount: 100 },
        { invoice_id: '1', line_id: 'b', amount: 200 },
      ])

      const result = await compareTable(sqlite, pg, {
        name: 'line_items',
        primaryKey: ['invoice_id', 'line_id'],
      })

      expect(result.diffs).toEqual([])
    })

    it('detects missing row with composite PK', async () => {
      const { sqlite, pg } = makePair()
      const cols = ['invoice_id', 'line_id', 'amount']

      sqlite.addTable('line_items', cols, [
        { invoice_id: '1', line_id: 'a', amount: 100 },
        { invoice_id: '1', line_id: 'b', amount: 200 },
      ])
      pg.addTable('line_items', cols, [
        { invoice_id: '1', line_id: 'a', amount: 100 },
      ])

      const result = await compareTable(sqlite, pg, {
        name: 'line_items',
        primaryKey: ['invoice_id', 'line_id'],
      })

      expect(result.missingInPostgres).toBe(1)
      expect(result.diffs[0].primaryKey).toEqual({
        invoice_id: '1',
        line_id: 'b',
      })
    })
  })

  describe('row counts', () => {
    it('reports correct row counts', async () => {
      const { sqlite, pg } = makePair()
      const cols = ['id', 'name']

      sqlite.addTable('users', cols, [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
        { id: '3', name: 'Charlie' },
      ])
      pg.addTable('users', cols, [
        { id: '1', name: 'Alice' },
        { id: '4', name: 'Dave' },
      ])

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
      })

      expect(result.sqliteRowCount).toBe(3)
      expect(result.postgresRowCount).toBe(2)
      expect(result.missingInPostgres).toBe(2) // id=2, id=3
      expect(result.missingInSqlite).toBe(1) // id=4
    })
  })

  describe('softDeleteColumn', () => {
    it('excludes soft-deleted rows from postgres', async () => {
      const { sqlite, pg } = makePair()

      sqlite.addTable(
        'users',
        ['id', 'name'],
        [
          { id: '1', name: 'Alice' },
          { id: '2', name: 'Bob' },
        ],
      )
      pg.addTable(
        'users',
        ['id', 'name', 'deleted_at'],
        [
          { id: '1', name: 'Alice', deleted_at: null },
          { id: '2', name: 'Bob', deleted_at: '2026-01-01' },
        ],
      )

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
        softDeleteColumn: 'deleted_at',
      })

      // id=2 is soft-deleted in pg, so it appears as missing_in_postgres
      expect(result.postgresRowCount).toBe(1)
      expect(result.missingInPostgres).toBe(1)
      expect(result.diffs[0]).toMatchObject({
        type: 'missing_in_postgres',
        primaryKey: { id: '2' },
      })
    })

    it('auto-ignores the soft delete column from value comparisons', async () => {
      const { sqlite, pg } = makePair()

      sqlite.addTable('users', ['id', 'name'], [{ id: '1', name: 'Alice' }])
      pg.addTable(
        'users',
        ['id', 'name', 'deleted_at'],
        [{ id: '1', name: 'Alice', deleted_at: null }],
      )

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
        softDeleteColumn: 'deleted_at',
      })

      expect(result.diffs).toEqual([])
    })

    it('skips filtering when the column does not exist on the table', async () => {
      const { sqlite, pg } = makePair()

      sqlite.addTable(
        'logs',
        ['id', 'message'],
        [{ id: '1', message: 'hello' }],
      )
      pg.addTable('logs', ['id', 'message'], [{ id: '1', message: 'hello' }])

      const result = await compareTable(sqlite, pg, {
        name: 'logs',
        primaryKey: 'id',
        softDeleteColumn: 'deleted_at',
      })

      expect(result.diffs).toEqual([])
      expect(result.postgresRowCount).toBe(1)
    })

    it('no diffs when all data matches and non-deleted', async () => {
      const { sqlite, pg } = makePair()

      sqlite.addTable(
        'users',
        ['id', 'name'],
        [
          { id: '1', name: 'Alice' },
          { id: '2', name: 'Bob' },
        ],
      )
      pg.addTable(
        'users',
        ['id', 'name', 'deleted_at'],
        [
          { id: '1', name: 'Alice', deleted_at: null },
          { id: '2', name: 'Bob', deleted_at: null },
        ],
      )

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
        softDeleteColumn: 'deleted_at',
      })

      expect(result.diffs).toEqual([])
    })
  })

  describe('resolveTableConfigs', () => {
    it('applies defaults.softDeleteColumn to all tables', () => {
      const resolved = resolveTableConfigs({
        sqlite: { path: '' },
        postgres: { connectionString: '' },
        defaults: { softDeleteColumn: 'deleted_at' },
        tables: [
          { name: 'users', primaryKey: 'id' },
          { name: 'orders', primaryKey: 'id' },
        ],
      })

      expect(resolved[0].softDeleteColumn).toBe('deleted_at')
      expect(resolved[1].softDeleteColumn).toBe('deleted_at')
    })

    it('allows per-table override of defaults', () => {
      const resolved = resolveTableConfigs({
        sqlite: { path: '' },
        postgres: { connectionString: '' },
        defaults: { softDeleteColumn: 'deleted_at' },
        tables: [
          { name: 'users', primaryKey: 'id' },
          { name: 'logs', primaryKey: 'id', softDeleteColumn: 'removed_at' },
        ],
      })

      expect(resolved[0].softDeleteColumn).toBe('deleted_at')
      expect(resolved[1].softDeleteColumn).toBe('removed_at')
    })

    it('returns tables unchanged when no defaults', () => {
      const tables = [{ name: 'users', primaryKey: 'id' as const }]
      const resolved = resolveTableConfigs({
        sqlite: { path: '' },
        postgres: { connectionString: '' },
        tables,
      })

      expect(resolved).toBe(tables)
    })
  })

  describe('mixed diffs', () => {
    it('handles missing rows and value mismatches together', async () => {
      const { sqlite, pg } = makePair()
      const cols = ['id', 'name']

      sqlite.addTable('users', cols, [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
        { id: '3', name: 'Charlie' },
      ])
      pg.addTable('users', cols, [
        { id: '1', name: 'ALICE' }, // mismatch
        { id: '3', name: 'Charlie' }, // match
        { id: '4', name: 'Dave' }, // missing in sqlite
      ])

      const result = await compareTable(sqlite, pg, {
        name: 'users',
        primaryKey: 'id',
      })

      expect(result.valueMismatches).toBe(1)
      expect(result.missingInPostgres).toBe(1) // id=2
      expect(result.missingInSqlite).toBe(1) // id=4
      expect(result.diffs).toHaveLength(3)
    })
  })
})
