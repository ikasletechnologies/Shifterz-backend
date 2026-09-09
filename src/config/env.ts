import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("5000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().min(1, "DIRECT_URL is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  LOG_LEVEL: z.string().optional().default("info"),
  // D-20 — dedicated machine credential for cron/scheduler-triggered
  // endpoints, structurally separate from JWT_SECRET (human sessions).
  // Optional so existing deployments don't fail to start before it's
  // configured; requireSystemCredential() fails closed when it's unset,
  // never treats "not configured" as "no check needed".
  SCHEDULER_SECRET: z.string().optional(),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ Invalid environment variables:");
  console.error(_env.error.format());
  process.exit(1);
}

export const env = _env.data;
