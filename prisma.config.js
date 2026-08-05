import "dotenv/config";
import { defineConfig } from "prisma/config";
export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
        seed: "npx tsx prisma/seed.ts",
    },
    datasource: {
        url: process.env["DATABASE_URL"],
        shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"] || "postgresql://shifterz:shifterz@localhost:5432/shifterz_shadow?schema=public",
    },
});
//# sourceMappingURL=prisma.config.js.map