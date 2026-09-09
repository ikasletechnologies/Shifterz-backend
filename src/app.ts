import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import { hqRouter } from "./routes/hq.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { notificationsRouter } from "./routes/notifications.js";
import { logger } from "./shared/logger/logger.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { env } from "./config/env.js";

const app = express();
const PORT = env.PORT || 5000;
const isProd = process.env.NODE_ENV === "production";

// Deployed behind a reverse proxy (Vercel) in production — without this,
// Express sees the proxy's IP on every request, which breaks per-client
// rate limiting (Phase 0.8) and `req.ip` used throughout audit logging.
if (isProd) app.set("trust proxy", 1);

// Phase 0.11 — CORS is no longer wide open. ALLOWED_ORIGINS is a
// comma-separated allowlist (set via env, e.g. "https://app.shifterz.com");
// local dev falls back to the common Next.js dev ports. `credentials: true`
// is required for the httpOnly auth cookie (Phase 0.10) to be sent
// cross-origin at all.
const defaultDevOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const originAllowlist = allowedOrigins.length > 0 ? allowedOrigins : defaultDevOrigins;

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin/non-browser requests (curl, server-to-server, health
      // checks) send no Origin header at all — allow those through; the
      // browser is what enforces CORS for actual cross-origin JS callers.
      if (!origin || originAllowlist.includes(origin)) {
        return callback(null, true);
      }
      const err: any = new Error("Not allowed by CORS");
      err.statusCode = 403;
      return callback(err);
    },
    credentials: true,
  })
);

// Phase 0.12 — helmet was an installed-but-unused dependency. contentSecurityPolicy
// and HSTS are handled explicitly below rather than left on their aggressive
// defaults: this is a JSON API (not an HTML-rendering app) that also serves
// uploaded images to a different origin, and HSTS should not be forced on
// until the deployment is confirmed HTTPS-only.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: isProd,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));

import { authRoutes } from "./modules/auth/auth.routes.js";
import { leadRouter } from "./modules/lead/routes/lead.routes.js";
import { customerRouter } from "./modules/customer/routes/customer.routes.js";
import { vehicleCheckinRouter } from "./modules/vehicle-checkin/routes/vehicle-checkin.routes.js";
import { jobCardRouter } from "./modules/job-card/routes/job-card.routes.js";
import { workshopRouter } from "./modules/workshop/routes/workshop.routes.js";
import { billingRouter } from "./modules/billing/routes/billing.routes.js";
import { creditNoteRouter } from "./modules/gst/routes/creditNote.routes.js";
import { debitNoteRouter } from "./modules/gst/routes/debitNote.routes.js";
import { paymentsRouter } from "./modules/payments/routes/payments.routes.js";
import { outpassRouter } from "./modules/outpass/routes/outpass.routes.js";
import { inventoryRouter } from "./modules/inventory/routes/inventory.routes.js";
import { employeeRouter, hqEmployeeRouter, technicianRouter } from "./modules/employee/routes/employee.routes.js";
import { attendanceRouter } from "./modules/employee/routes/attendance.routes.js";
import { transferRouter } from "./modules/employee/routes/transfer.routes.js";
import { leaveRouter } from "./modules/employee/routes/leave.routes.js";
import { serviceRouter } from "./modules/service/routes/service.routes.js";
import { franchiseRouter } from "./modules/franchise/routes/franchise.routes.js";
import { settingsRouter } from "./modules/settings/routes/settings.routes.js";
import { reportRouter } from "./modules/report/routes/report.routes.js";
import { uploadRouter } from "./modules/upload/routes/upload.routes.js";
import { vehicleRouter } from "./modules/vehicle/routes/vehicle.routes.js";
import { serviceAdvisorRouter } from "./modules/service-advisor/service-advisor.routes.js";
import { billingExecutiveRouter } from "./modules/billing-executive/billing-executive.routes.js";
import { receptionRouter } from "./modules/reception/reception.routes.js";
import { inventoryExecutiveRouter } from "./modules/inventory-executive/inventory-executive.routes.js";
import { callbackRouter } from "./modules/lead/routes/callback.routes.js";
import { referralRouter } from "./modules/lead/routes/referral.routes.js";
import { appointmentRouter } from "./modules/appointments/appointments.routes.js";
import { workflowStageRouter } from "./modules/workflow-stage/routes/workflow-stage.routes.js";
import { qcRouter } from "./modules/qc/qc.routes.js";
import { warrantyRouter } from "./modules/warranty/routes/warranty.routes.js";
import { errorMiddleware } from "./middleware/error.middleware.js";

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/leads", leadRouter);
app.use("/api/callbacks", callbackRouter);
app.use("/api/referrals", referralRouter);
app.use("/api/customers", customerRouter);
app.use("/api/carin", vehicleCheckinRouter);
app.use("/api/jobs", jobCardRouter);
app.use("/api/technician", workshopRouter);
app.use("/api/invoices", billingRouter);
app.use("/api/gst/credit-notes", creditNoteRouter);
app.use("/api/gst/debit-notes", debitNoteRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/outpass", outpassRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/employees", employeeRouter);
app.use("/api/hq-employees", hqEmployeeRouter);
app.use("/api/technicians", technicianRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/member-transfers", transferRouter);
app.use("/api/leaves", leaveRouter);
app.use("/api/services", serviceRouter);
app.use("/api/franchise", franchiseRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/reports", reportRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/vehicle", vehicleRouter);
app.use("/api/service-advisors", serviceAdvisorRouter);
app.use("/api/billing-executives", billingExecutiveRouter);
app.use("/api/receptionists", receptionRouter);
app.use("/api/inventory-executives", inventoryExecutiveRouter);
app.use("/api/appointments", appointmentRouter);
app.use("/api/hq/notifications", notificationsRouter);
app.use("/api/hq", hqRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/workflow-stages", workflowStageRouter);
app.use("/api/qc", qcRouter);
app.use("/api/warranties", warrantyRouter);

app.use(errorMiddleware);

// Basic health check
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date() });
});



// Start Server
app.listen(PORT, () => {
  logger.info(`Shifterz backend running on port ${PORT}`);
});

// Restart trigger
