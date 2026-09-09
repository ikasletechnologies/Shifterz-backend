import { db } from '../../lib/db.js';
import type { Prisma } from '@prisma/client';

// EPB 2.13 — audit entries must never carry a secret/credential in
// plaintext (e.g. MemberTransferRequest.password, a raw new-member password
// captured before it's hashed). Applied to oldValue/newValue before they
// reach logAudit, not a change to logAudit itself.
const SENSITIVE_KEY_PATTERN = /password|secret|token|apikey|api_key|privatekey|private_key|credential/i;

export function redactSensitive<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => redactSensitive(v)) as unknown as T;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : redactSensitive(val);
    }
    return result as T;
  }
  return value;
}

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

// `tx` is optional so a caller can make the audit write part of the same
// transaction as the mutation it's recording (e.g. RBAC-02's grant
// management — "do not leave a successful mutation without its audit
// event"); every existing caller that doesn't pass one keeps using the
// plain client, unchanged.
export async function logAudit(options: AuditLogOptions, tx?: Prisma.TransactionClient) {
  const client = tx ?? db;
  const write = () => client.auditLog.create({
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

  // Standalone callers (no tx): audit failure must not block a business
  // operation that already succeeded, so it's logged and swallowed, same as
  // before this change. Callers inside a transaction want the opposite —
  // "do not leave a successful mutation without its audit event" means an
  // audit failure there must roll back the whole transaction, not be
  // silently absorbed, so the error propagates instead.
  if (tx) {
    await write();
    return;
  }
  try {
    await write();
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}
