export { compare, compareWithAdapters } from './compare'
export { watch } from './watch'
export { printReport, renderReport } from './report'
export * as normalizers from './normalizers'
export type {
  CompareConfig,
  TableConfig,
  ColumnMapping,
  Normalizer,
  CompareResult,
  TableSummary,
  RowDiff,
  ColumnDiff,
  DbAdapter,
} from './types'
