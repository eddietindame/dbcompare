import "dotenv/config";
import type { CompareConfig } from "./src/types";
import { numeric, boolean, timestamp, json } from "./src/normalizers";

const config: CompareConfig = {
  sqlite: { path: process.env.SQLITE_PATH! },
  postgres: { connectionString: process.env.POSTGRES_URL! },
  tables: [
    {
      name: "invoices",
      primaryKey: "id",
      ignoreColumns: ["deleted_at", "synced_at"],
      columnMappings: {
        amount: { normalize: numeric(6) },
        is_paid: { normalize: boolean },
        created_at: { normalize: timestamp },
      },
    },
    {
      name: "line_items",
      primaryKey: ["invoice_id", "id"],
      ignoreColumns: ["deleted_at"],
      columnMappings: {
        unit_price: { normalize: numeric(6) },
        metadata: { normalize: json },
      },
    },
    {
      name: "users",
      primaryKey: "id",
      ignoreColumns: ["deleted_at", "password_hash"],
      columnMappings: {
        // Column named "active" in SQLite but "is_active" in Postgres
        active: { pgName: "is_active", normalize: boolean },
      },
    },
  ],
};

export default config;
