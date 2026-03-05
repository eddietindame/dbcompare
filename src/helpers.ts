import { numeric, timestamp } from './normalizers'

export const money = { normalize: numeric(6) }
export const ts = { normalize: timestamp }
