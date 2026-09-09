import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { env } from "../config/env.js";
import { logAudit } from "../shared/services/audit.service.js";

export interface SystemRequest extends Request {
  systemCaller?: { type: "SYSTEM_SCHEDULER"; endpoint: string };
}

// Hash both sides to a fixed-length digest before comparing, so a length
// mismatch between the presented header and the configured secret can never
// take a different code path (crypto.timingSafeEqual throws on unequal
// buffer lengths otherwise) or leak length information.
function safeEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// D-20 — system-to-system authentication for cron/scheduler-triggered
// endpoints. Deliberately NOT part of the human auth stack
// (authenticate/requireRole/requireAction in auth.middleware.ts): there is
// no employee identity, no session, no RBAC action grant here — just a
// machine credential explicitly permitted for one named system endpoint.
//
// A human JWT satisfies none of this (this checks a distinct header, never
// Authorization/cookie), and this credential satisfies none of the
// human-facing routes (it is only ever attached to the specific endpoints
// that opt into it, never applied as router-level middleware). Fails closed:
// missing/unconfigured secret, missing header, or a mismatch all produce the
// same 401, never a fallthrough to "allow".
// `audit` is injectable (defaults to the real DB-backed logAudit) for the
// same reason requireAction()'s resolver is injectable: this branching logic
// — 401 on missing/unconfigured/mismatched credential, systemCaller attached
// and next() on success — is unit-testable with zero DB dependency.
export const requireSystemCredential = (
  endpointName: string,
  audit: typeof logAudit = logAudit
) => {
  return async (req: SystemRequest, res: Response, next: NextFunction) => {
    const configured = env.SCHEDULER_SECRET;
    const presented = req.headers["x-scheduler-secret"];

    if (!configured || typeof presented !== "string" || !presented || !safeEqual(presented, configured)) {
      res.status(401).json({ error: "Unauthorized: invalid or missing scheduler credential" });
      return;
    }

    req.systemCaller = { type: "SYSTEM_SCHEDULER", endpoint: endpointName };

    // D-20 — audit info identifies the system/scheduler caller, never a
    // fabricated human employee id.
    await audit({
      module: "System Scheduler",
      recordId: "NONE",
      action: endpointName,
      userId: "SYSTEM_SCHEDULER",
      ipAddress: req.ip || null,
      device: (req.headers["user-agent"] as string | undefined) || null,
    });

    next();
  };
};
