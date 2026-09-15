const fs = require('fs');
const path = require('path');

const empFilePath = path.join(__dirname, '../src/modules/employee/service/employee.service.ts');
let empCode = fs.readFileSync(empFilePath, 'utf-8');

const startIndex = empCode.indexOf('await this.assertLicenseCapacity(roleToCheck, franchiseId);');
const updateMethodIndex = empCode.indexOf('async updateEmployee');
const endIndex = empCode.lastIndexOf('  }', updateMethodIndex);

if (startIndex !== -1 && endIndex !== -1) {
  const replacement = `return db.$transaction(async (tx) => {
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

      if (data.phone) {
        const trimmedPhone = String(data.phone).trim();
        if (trimmedPhone) {
          const existingPhone = await tx.employee.findFirst({
            where: { phone: trimmedPhone, isDeleted: false }
          });
          if (existingPhone) {
            throw new ApiError(400, "An employee with this mobile number already exists.");
          }
        }
      }

      const empId = data.role === "SERVICE_ADVISOR"
        ? generateUid("SA-")
        : isTechnicianRoute
          ? generateUid("TECH")
          : \`EMP\${Date.now().toString().slice(-6)}\`;

      const targetFranchiseId = (franchiseId && franchiseId !== "HQ") ? franchiseId : null;
      const newEmployee = await this.repository.create(empId, { ...data, franchiseId: targetFranchiseId }, hashedPassword, normalizedUsername, tx);
      const { password, ...rest } = newEmployee;

      return {
        ...rest,
        permissions: newEmployee.permission?.modules || []
      };
    });`;
    
  empCode = empCode.substring(0, startIndex) + replacement + empCode.substring(endIndex);
  fs.writeFileSync(empFilePath, empCode);
  console.log("Successfully updated employee.service.ts");
} else {
  console.log("Could not find bounds", startIndex, endIndex);
}
