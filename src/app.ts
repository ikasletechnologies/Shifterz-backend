import express from "express";
import cors from "cors";
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

// Middleware
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));

import { authRoutes } from "./modules/auth/auth.routes.js";
import { leadRouter } from "./modules/lead/routes/lead.routes.js";
import { customerRouter } from "./modules/customer/routes/customer.routes.js";
import { vehicleCheckinRouter } from "./modules/vehicle-checkin/routes/vehicle-checkin.routes.js";
import { jobCardRouter } from "./modules/job-card/routes/job-card.routes.js";
import { workshopRouter } from "./modules/workshop/routes/workshop.routes.js";
import { billingRouter } from "./modules/billing/routes/billing.routes.js";
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

import { exec } from "child_process";

// Start Server
app.listen(PORT, async () => {
  logger.info(`Shifterz backend running on port ${PORT}`);

  // Automigrate & regenerate Prisma client on startup
  logger.info("[Auto-Migration] Running npx prisma db push...");
  exec("npx prisma db push", (err, stdout, stderr) => {
    if (err) {
      logger.error(`[Auto-Migration] Failed to migrate database: ${err.message}`);
    } else {
      logger.info(`[Auto-Migration] Database migrated and generated successfully: ${stdout}`);
    }
  });
});

// Restart trigger
