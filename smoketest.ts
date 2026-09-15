import { db } from './src/lib/db.js';
import { AuthService } from './src/modules/auth/auth.service.js';
import { generateUid } from './src/shared/utils/idGenerator.js';

async function runSmokeTests() {
  let hasError = false;
  try {
    console.log("Starting Smoke Tests...");

    // 1. Session & Auth Smoke Test
    console.log("\n[1] Testing Auth & Session...");
    const testEmployeeId = generateUid("EMP");
    const testUser = await db.employee.create({
      data: {
        id: testEmployeeId,
        username: 'smoketest_' + Date.now(),
        name: 'Smoke Test User',
        role: 'TECHNICIAN',
        status: 'Active',
        isDeleted: false,
      }
    });
    
    // Simulate Login (creates Session)
    const authService = new AuthService();
    const loginResult = await authService.issueSession(testUser, { ipAddress: '127.0.0.1', device: 'SmokeTest' });
    if (!loginResult.tokenPayload.jti || !loginResult.token) throw new Error("Failed to generate session/token");
    console.log("✓ Session created successfully");

    // Verify session in DB
    const sessionInDb = await db.session.findUnique({ where: { jti: loginResult.tokenPayload.jti } });
    if (!sessionInDb || sessionInDb.revokedAt) throw new Error("Session missing or unexpectedly revoked");
    console.log("✓ Session correctly stored in DB");

    // Simulate Logout (revokes Session)
    await authService.logout(sessionInDb.id);
    const revokedSession = await db.session.findUnique({ where: { id: sessionInDb.id } });
    if (!revokedSession?.revokedAt) throw new Error("Session not revoked after logout");
    console.log("✓ Session revoked successfully");

    // 2. RBAC / Permission Smoke Test
    console.log("\n[2] Testing RBAC Schema...");
    const perm = await db.userPermission.create({
      data: {
        employeeId: testEmployeeId,
        modules: ['inventory'],
        actions: ['inventory:read', 'inventory:write'],
        actionsOverride: true,
      }
    });
    if (!perm.actions.includes('inventory:write')) throw new Error("actions array not saved correctly");
    console.log("✓ UserPermission actions created successfully");

    // 3. Inventory Schema Smoke Test
    console.log("\n[3] Testing Inventory Schema...");
    const testFranchise = await db.franchise.create({
      data: {
        id: "TEST_FRANCHISE_" + Date.now(),
        name: "Smoke Test Franchise",
        city: "Test",
        owner: "Test Owner",
        phone: "1234567890",
        since: new Date(),
        revenue: 0,
        jobs: 0,
        royaltyPct: 0,
        status: "Active"
      }
    });

    const item = await db.inventory.create({
      data: {
        id: generateUid("ITM"),
        name: "Smoke Test Item " + Date.now(),
        category: "Test",
        unit: "PCS",
        stock: 10,
        cost: 100,
        supplier: 'Test Supplier',
        location: 'A1',
        reorder: 10,
        franchiseId: testFranchise.id
      }
    });

    const move = await db.inventoryMovement.create({
      data: {
        itemId: item.id,
        type: 'ADD',
        reference: 'SMOKE',
        quantity: 10,
        balance: 10,
        performedBy: 'system',
        franchiseId: testFranchise.id
      }
    });
    if (move.franchiseId !== testFranchise.id) throw new Error("InventoryMovement.franchiseId failed to persist");
    console.log("✓ InventoryMovement with franchiseId successful");

    const adj = await db.inventoryAdjustmentRequest.create({
      data: {
        itemId: item.id,
        requestedQty: 5,
        reason: 'Smoke Test',
        status: 'Pending',
        requestedById: testEmployeeId,
        requestedBy: testUser.name
      }
    });
    console.log("✓ InventoryAdjustmentRequest created successfully");

    // 4. Dashboard Schema Smoke Test
    console.log("\n[4] Testing Dashboard Schema...");
    const dash = await db.dashboardWidgetConfig.create({
      data: {
        dashboardType: 'HQ',
        widgetKey: 'TotalRevenue_' + Date.now(),
        visible: true,
        order: 1
      }
    });
    console.log("✓ DashboardWidgetConfig created successfully");

    console.log("\nAll smoke tests passed! Cleaning up...");
    
    // Cleanup
    await db.dashboardWidgetConfig.delete({ where: { id: dash.id } });
    await db.inventoryAdjustmentRequest.delete({ where: { id: adj.id } });
    await db.inventoryMovement.delete({ where: { id: move.id } });
    await db.inventory.delete({ where: { id: item.id } });
    await db.franchise.delete({ where: { id: testFranchise.id } });
    await db.session.deleteMany({ where: { employeeId: testEmployeeId } });
    await db.userPermission.delete({ where: { employeeId: testEmployeeId } });
    await db.employee.delete({ where: { id: testEmployeeId } });

  } catch (err) {
    console.error("\n❌ Smoke Test Failed:", err);
    hasError = true;
  } finally {
    await db.$disconnect();
    if (hasError) process.exit(1);
  }
}

runSmokeTests();
