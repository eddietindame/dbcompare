import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteAdapter } from '../src/adapters/sqlite'
import initSqlJs from 'sql.js'
import fs from 'fs'
import os from 'os'
import path from 'path'

let tmpFile: string
let adapter: SqliteAdapter

async function createTestDb(): Promise<string> {
  const SQL = await initSqlJs()
  const db = new SQL.Database()

  db.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT,
      amount REAL,
      active INTEGER,
      created_at TEXT
    )
  `)

  db.run(`
    INSERT INTO users VALUES
      ('1', 'Alice', 'alice@test.com', 100.5, 1, '2026-01-01T00:00:00Z'),
      ('2', 'Bob', 'bob@test.com', 200.0, 0, '2026-01-02T00:00:00Z'),
      ('3', 'Charlie', NULL, 0, 1, '2026-01-03T00:00:00Z')
  `)

  const tmpDir = os.tmpdir()
  const filePath = path.join(tmpDir, `dbcompare-test-${Date.now()}.db`)
  const data = db.export()
  fs.writeFileSync(filePath, Buffer.from(data))
  db.close()

  return filePath
}

describe('SqliteAdapter', () => {
  beforeEach(async () => {
    tmpFile = await createTestDb()
    adapter = new SqliteAdapter(tmpFile)
  })

  afterEach(async () => {
    await adapter.close()
    fs.unlinkSync(tmpFile)
  })

  describe('getTableColumns', () => {
    it('returns all column names', async () => {
      const cols = await adapter.getTableColumns('users')
      expect(cols).toEqual([
        'id',
        'name',
        'email',
        'amount',
        'active',
        'created_at',
      ])
    })
  })

  describe('getRows', () => {
    it('returns all rows with specified columns', async () => {
      const rows = await adapter.getRows('users', ['id', 'name'], ['id'])

      expect(rows).toHaveLength(3)
      expect(rows[0]).toEqual({ id: '1', name: 'Alice' })
      expect(rows[1]).toEqual({ id: '2', name: 'Bob' })
      expect(rows[2]).toEqual({ id: '3', name: 'Charlie' })
    })

    it('returns rows sorted by order column', async () => {
      const rows = await adapter.getRows('users', ['id', 'name'], ['name'])

      expect(rows[0].name).toBe('Alice')
      expect(rows[1].name).toBe('Bob')
      expect(rows[2].name).toBe('Charlie')
    })

    it('preserves null values', async () => {
      const rows = await adapter.getRows('users', ['id', 'email'], ['id'])

      expect(rows[2].email).toBeNull()
    })

    it('preserves numeric types', async () => {
      const rows = await adapter.getRows(
        'users',
        ['id', 'amount', 'active'],
        ['id'],
      )

      expect(rows[0].amount).toBe(100.5)
      expect(rows[0].active).toBe(1)
    })
  })
})
