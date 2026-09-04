import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { authRepository } from "./auth.repository.js";
import { resolveUserPermissions } from "../../lib/auth.js";
import { env } from "../../config/env.js";
import { db } from "../../lib/db.js";

const JWT_SECRET = env.JWT_SECRET;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 1 day — matches the JWT's expiresIn

export interface SessionMeta {
  ipAddress?: string | null;
  device?: string | null;
}

// Identifies the employee's reporting branch: their own Franchise, or Head
// Office when they have no franchise (either as an admin role or an
// explicitly HQ-controlled employee).
function resolveBranch(user: { franchiseId: string | null; franchise?: { id: string; name: string; city: string } | null }) {
  if (user.franchiseId && user.franchise) {
    return { id: user.franchise.id, type: "FRANCHISE" as const, name: user.franchise.name, city: user.franchise.city };
  }
  return { id: null, type: "HQ" as const, name: "Head Office", city: null };
}

export class AuthService {
  // Creates a server-side Session row and signs a JWT bound to it via `jti`.
  // Centralizing this lets both login() and the post-password-change reissue
  // in updateProfile() share the exact same, correct session-creation path.
  private async issueSession(user: { id: string; username: string | null; role: string; franchiseId: string | null; hqControlled: boolean }, meta: SessionMeta = {}) {
    const baseRole = user.role.split("|")[0];
    const resolvedPermissions = await resolveUserPermissions(user.id, user.role);
    const jti = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await db.session.create({
      data: {
        jti,
        employeeId: user.id,
        expiresAt,
        ipAddress: meta.ipAddress || null,
        device: meta.device || null,
      },
    });

    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: resolvedPermissions,
      franchiseId: user.franchiseId,
      hqControlled: user.hqControlled,
      jti,
      ...(baseRole === "TECHNICIAN" || baseRole === "QUALITY_INSPECTOR" ? { technicianId: user.id } : {})
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET as string, { expiresIn: "1d" });
    return { token, tokenPayload };
  }

  async login(username: string, password: string, meta: SessionMeta = {}) {
    const normalizedUsername = username.trim().toLowerCase();

    const user = await authRepository.findEmployeeByUsername(normalizedUsername);
    if (!user || !user.password) {
      throw new Error("Invalid username or password");
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new Error("Invalid username or password");
    }

    // Validate approval status and account status
    if (user.approvalStatus === "Pending") {
      throw new Error("Your account is pending Super Admin approval. Please contact administrator.");
    }

    if (user.approvalStatus === "Rejected") {
      throw new Error("Your account approval request has been rejected. Access denied.");
    }

    if (user.status === "Inactive") {
      throw new Error("Your account is inactive. Access denied.");
    }

    const { token, tokenPayload } = await this.issueSession(user, meta);

    return { token, user: { ...tokenPayload, branch: resolveBranch(user) } };
  }

  // Phase 0.5 — revokes exactly the session backing the current request so
  // the token can never be replayed again, even though it hasn't expired.
  async logout(sessionId: string) {
    await db.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date(), revokedReason: "LOGOUT" },
    });
  }

  async getMe(userId: string) {
    const user = await authRepository.findEmployeeById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const baseRole = user.role.split("|")[0];
    const resolvedPermissions = await resolveUserPermissions(user.id, user.role);

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: resolvedPermissions,
      franchiseId: user.franchiseId,
      hqControlled: user.hqControlled,
      branch: resolveBranch(user),
      ...(baseRole === "TECHNICIAN" || baseRole === "QUALITY_INSPECTOR" ? { technicianId: user.id } : {})
    };
  }

  async updateProfile(userId: string, data: any, meta: SessionMeta = {}) {
    const user = await authRepository.findEmployeeById(userId);
    if (!user) throw new Error("User not found");

    const updateData: any = {
      name: data.name,
      email: data.email,
      phone: data.phone
    };

    let passwordChanged = false;
    if (data.newPassword && data.currentPassword) {
      if (!user.password) throw new Error("User has no password set");
      const isValid = await bcrypt.compare(data.currentPassword, user.password);
      if (!isValid) {
        throw new Error("Current password incorrect");
      }
      updateData.password = await bcrypt.hash(data.newPassword, 10);
      passwordChanged = true;
    }

    const updated = await authRepository.updateEmployee(userId, updateData);

    if (!passwordChanged) {
      return { user: updated };
    }

    // Phase 0.7 — a password change must invalidate every previously issued
    // session (stolen/shared tokens included), on every device. The user who
    // just proved their new password gets a fresh session immediately so
    // they aren't logged out mid-action on the very request that changed it.
    await db.session.updateMany({
      where: { employeeId: userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "PASSWORD_CHANGE" },
    });

    const { token, tokenPayload } = await this.issueSession(updated as any, meta);
    return { user: updated, token, tokenPayload, sessionsInvalidated: true };
  }

  async getRolePermissions() {
    return authRepository.findAllRolePermissions();
  }

  async updateRolePermissions(role: string, permissions: string[]) {
    return authRepository.upsertRolePermission(role, permissions);
  }
}

export const authService = new AuthService();
