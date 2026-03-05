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

export const lineItems: TableConfig = {
  name: 'line_items',
  primaryKey: ['invoice_id', 'id'],
  ignoreColumns: ['deleted_at'],
  columnMappings: {
    unit_price: money,
    created_at: ts,
    updated_at: ts,
  },
}
