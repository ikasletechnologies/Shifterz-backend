import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations/CLI use the direct (unpooled) connection — Supabase's
    // transaction-mode pooler doesn't support the DDL prisma migrate needs.
    // The running app still connects via DATABASE_URL (pooled) in src/lib/db.ts.
    url: process.env["DIRECT_URL"],
  },
});
