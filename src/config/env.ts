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
  // Uploaded photos (vehicle/QC/job-card) are stored on disk outside the
  // repo/deployment bundle so they survive redeploys and never end up
  // tracked in git. Falls back to <cwd>/public/uploads when unset so local
  // setups without this configured still work.
  UPLOAD_DIR: z.string().optional(),
  // GSTIN verification lookup (setup wizard auto-fill) — optional so
  // deployments without it configured still start; GstinLookupService fails
  // closed with a clear error at call time when it's unset, same pattern as
  // SCHEDULER_SECRET above.
  GSTVERIFY_API_KEY: z.string().optional(),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ Invalid environment variables:");
  console.error(_env.error.format());
  process.exit(1);
}

export const env = _env.data;
