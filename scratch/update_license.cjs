const fs = require('fs');
const path = require('path');

// 1. Rewrite employee.service.ts
const empFilePath = path.join(__dirname, '../src/modules/employee/service/employee.service.ts');
let empCode = fs.readFileSync(empFilePath, 'utf-8');

empCode = empCode.replace(
  /async assertLicenseCapacity\(role: string, franchiseId: string \| null\): Promise<void> \{([\s\S]*?)\n  \}/,
  `async assertLicenseCapacity(role: string, franchiseId: string | null, tx?: import('@prisma/client').Prisma.TransactionClient): Promise<void> {
    const client = tx || db;
    let license = null;
    if (franchiseId) {
      license = await client.license.findFirst({
        where: { organizationId: franchiseId, status: "Active" }
      });
    }

    const limitFranchiseUsers = license ? license.maxFranchiseUsers : 6;
    const limitFranchiseAdmins = license ? license.maxFranchiseAdmins : 1;
    const limitHQUsers = license ? license.maxHQUsers : 6;
    const limitSuperAdmins = license ? license.maxSuperAdmins : 1;

    const roleToCheck = role || "EMPLOYEE";

    if (roleToCheck === "SUPER_ADMIN") {
      const count = await client.employee.count({ where: { role: "SUPER_ADMIN", isDeleted: false } });
      if (count >= limitSuperAdmins) {
        throw new ApiError(403, \`License limit reached. Maximum \${limitSuperAdmins} Super Administrator allowed.\`);
      }
    } else if (roleToCheck === "HQ_USER") {
      const count = await client.employee.count({ where: { role: "HQ_USER", isDeleted: false } });
      if (count >= limitHQUsers) {
        throw new ApiError(403, \`License limit reached. Maximum \${limitHQUsers} HQ Users allowed.\`);
      }
    } else if (franchiseId) {
      if (roleToCheck === "FRANCHISE_ADMIN") {
        const count = await client.employee.count({ where: { franchiseId, role: "FRANCHISE_ADMIN", isDeleted: false } });
        if (count >= limitFranchiseAdmins) {
          throw new ApiError(403, \`License limit reached. Maximum \${limitFranchiseAdmins} Franchise Administrator allowed.\`);
        }
      } else {
        const count = await client.employee.count({ where: { franchiseId, isDeleted: false } });
        if (count >= limitFranchiseUsers) {
          throw new ApiError(403, \`License limit reached. Maximum \${limitFranchiseUsers} users allowed per franchise.\`);
        }
      }
    }
  }`
);

// Rewrite createEmployee
empCode = empCode.replace(
  /async createEmployee\(data: CreateEmployeeDTO, userRole: string, userFranchiseId\?: string, isTechnicianRoute = false\) \{([\s\S]*?)\n    return \{ success: true, message: "User successfully registered.", employee: createdEmployee \};\n  \}/,
  `async createEmployee(data: CreateEmployeeDTO, userRole: string, userFranchiseId?: string, isTechnicianRoute = false) {
    let franchiseId: string | null = data.franchiseId || null;

    if (!isTechnicianRoute) {
      const isHq = userRole === "SUPER_ADMIN" || userRole === "HQ_USER";
      const isFranchiseAdmin = userRole === "FRANCHISE_ADMIN";

      if (!isHq && !isFranchiseAdmin) {
        throw new UnauthorizedError("Only HQ or a Franchise Admin can create employees");
      }

      if (isFranchiseAdmin) {
        if (!userFranchiseId) {
          throw new UnauthorizedError("Franchise admin account is not linked to a franchise");
        }
        franchiseId = userFranchiseId;
        const requestedRole = data.role || "TECHNICIAN";
        if (!FRANCHISE_ASSIGNABLE_ROLES.includes(requestedRole)) {
          throw new ApiError(403, "Franchise admins can only create Technician, Service Advisor, Reception, QC, Billing, or Inventory accounts.");
        }
      }
    } else {
      franchiseId = userFranchiseId || null;
      if (userRole === "SUPER_ADMIN" || userRole === "HQ_USER") {
        franchiseId = data.franchiseId || null;
      }
    }

    const roleToCheck = data.role || (isTechnicianRoute ? "TECHNICIAN" : "EMPLOYEE");

    if (roleToCheck === "SUPER_ADMIN" && userRole !== "SUPER_ADMIN") {
      throw new ApiError(403, "Only a Super Administrator can create a Super Administrator account.");
    }

    return db.$transaction(async (tx) => {
      const lockKey = franchiseId ? franchiseId : 'HQ';
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", 'LICENSE_' + lockKey);

      await this.assertLicenseCapacity(roleToCheck, franchiseId, tx);

      const rawPassword = data.password || (isTechnicianRoute ? "tech123" : null);
      const hashedPassword = rawPassword ? await bcrypt.hash(rawPassword, 10) : null;

      let normalizedUsername = null;
      if (data.username) {
        normalizedUsername = String(data.username).trim().toLowerCase();
        if (normalizedUsername) {
          const existingUsername = await tx.employee.findFirst({
            where: { username: normalizedUsername, isDeleted: false }
          });
          if (existingUsername) {
            throw new ApiError(400, \`Username '\${normalizedUsername}' is already taken by another account.\`);
          }
        }
      } else if (isTechnicianRoute && data.name) {
        normalizedUsername = data.name.replace(/\\s+/g, "").toLowerCase();
      }

      if (data.email) {
        const trimmedEmail = String(data.email).trim().toLowerCase();
        if (trimmedEmail) {
          const existingEmail = await tx.employee.findFirst({
            where: { email: { equals: trimmedEmail, mode: "insensitive" }, isDeleted: false }
          });
          if (existingEmail) {
            throw new ApiError(400, "An employee with this email address already exists.");
          }
        }
      }

      const empId = \`EMP\${Date.now().toString().slice(-6)}\`;

      const newEmployee = await this.repository.create(empId, { ...data, franchiseId }, hashedPassword, normalizedUsername, tx);

      const { password, ...createdEmployee } = newEmployee as any;

      return { success: true, message: "User successfully registered.", employee: createdEmployee };
    });
  }`
);

fs.writeFileSync(empFilePath, empCode);

// 2. Rewrite transfer.service.ts
const transFilePath = path.join(__dirname, '../src/modules/employee/service/transfer.service.ts');
let transCode = fs.readFileSync(transFilePath, 'utf-8');

transCode = transCode.replace(
  /async approveTransfer\(id: string, userRole: string\) \{([\s\S]*?)\n    return \{ success: true, message: "Request approved and user provisioned.", employee: createdEmployee \};\n  \}/,
  `async approveTransfer(id: string, userRole: string) {
    const request = await this.repository.findRequestById(id);
    if (!request) throw new NotFoundError("Transfer request not found");
    if (request.status !== "Pending") throw new ApiError(400, \`Request already \${request.status.toLowerCase()}\`);
    if (userRole !== "SUPER_ADMIN" && userRole !== "HQ_USER") throw new ApiError(403, "Only HQ can approve member transfers");

    return db.$transaction(async (tx) => {
      let createdEmployee: any = null;
      if (request.employeeId) {
        await this.repository.updateEmployeeFranchise(request.employeeId, request.toFranchiseId, tx);
      } else {
        const role = request.role || "TECHNICIAN";
        const franchiseId = request.toFranchiseId || null;
        
        const lockKey = franchiseId ? franchiseId : 'HQ';
        await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", 'LICENSE_' + lockKey);
        
        await this.employeeService.assertLicenseCapacity(role, franchiseId, tx);

        const empId = \`EMP\${Date.now().toString().slice(-6)}\`;
        const rawPassword = request.password || "pass123";
        const hashedPassword = await bcrypt.hash(rawPassword, 10);
        const normalizedUsername = request.username ? String(request.username).trim().toLowerCase() : null;

        const newEmployee = await this.repository.createEmployeeFromTransfer({
          empId,
          name: request.newMemberName || "New Member",
          phone: request.newMemberPhone || null,
          email: request.newMemberEmail || null,
          username: normalizedUsername,
          password: hashedPassword,
          role,
          franchiseId
        }, tx);
        const { password, ...rest } = newEmployee as any;
        createdEmployee = rest;
      }

      await this.repository.updateRequestStatus(id, "Approved", tx);

      return { success: true, message: "Request approved and user provisioned.", employee: createdEmployee };
    });
  }`
);

if (!transCode.includes('import { db } from')) {
    transCode = "import { db } from '../../../lib/db.js';\n" + transCode;
}

fs.writeFileSync(transFilePath, transCode);
console.log("Updated employee and transfer services");
