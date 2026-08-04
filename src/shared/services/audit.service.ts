import { db } from '../../lib/db.js';

interface AuditLogOptions {
  module: string;
  recordId: string;
  action: string;
  userId: string;
  branchId?: string | null;
  oldValue?: any;
  newValue?: any;
  ipAddress?: string | null;
  device?: string | null;
}

export async function logAudit(options: AuditLogOptions) {
  try {
    await db.auditLog.create({
      data: {
        module: options.module,
        recordId: options.recordId,
        action: options.action,
        userId: options.userId,
        branchId: options.branchId || null,
        oldValue: options.oldValue ? JSON.parse(JSON.stringify(options.oldValue)) : null,
        newValue: options.newValue ? JSON.parse(JSON.stringify(options.newValue)) : null,
        ipAddress: options.ipAddress || null,
        device: options.device || null,
      }
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}
