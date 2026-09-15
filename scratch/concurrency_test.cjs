const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');

function generateUid(prefix) {
  return prefix + crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function runTests() {
  try {
    console.log("Starting Concurrency Tests...");

    // 1. Inventory Concurrency Test
    console.log("\\n[1] Inventory Concurrency Test");
    const item = await prisma.inventory.create({
      data: {
        id: generateUid("ITM"),
        name: "Test Conc Item",
        category: "Test",
        unit: "PCS",
        stock: 10,
        cost: 100,
        supplier: 'Test',
        location: 'A1',
        reorder: 2,
        franchiseId: null
      }
    });

    const consumePromises = [
      prisma.$transaction(async (tx) => {
        const updatedCount = await tx.inventory.updateMany({
          where: { id: item.id, stock: { gte: 7 } },
          data: { stock: { decrement: 7 } }
        });
        if (updatedCount.count === 0) throw new Error("Insufficient stock");
      }),
      prisma.$transaction(async (tx) => {
        const updatedCount = await tx.inventory.updateMany({
          where: { id: item.id, stock: { gte: 7 } },
          data: { stock: { decrement: 7 } }
        });
        if (updatedCount.count === 0) throw new Error("Insufficient stock");
      })
    ];

    const results = await Promise.allSettled(consumePromises);
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failCount = results.filter(r => r.status === 'rejected').length;
    const finalItem = await prisma.inventory.findUnique({ where: { id: item.id } });
    
    console.log(\`Inventory Results: Success: \${successCount}, Failed: \${failCount}, Final Stock: \${finalItem.stock}\`);
    if (successCount !== 1 || failCount !== 1 || finalItem.stock !== 3) {
      throw new Error("Inventory concurrency test failed!");
    }
    console.log("✓ Inventory Concurrency Test Passed");

    // 2. License Concurrency Test
    console.log("\\n[2] License Concurrency Test");
    const franchise = await prisma.franchise.create({
      data: {
        id: generateUid("FRN"),
        name: "Test Franchise License",
        city: "Test",
        contactPerson: "Test",
        contactEmail: "test@test.com",
        contactPhone: "1234567890",
        address: "Test",
        status: "Active"
      }
    });

    await prisma.license.create({
      data: {
        licenseKey: generateUid("LIC"),
        organizationId: franchise.id,
        type: "Franchise",
        maxFranchiseUsers: 6,
        status: "Active"
      }
    });

    // Create 5 users first to reach 5/6
    for (let i = 0; i < 5; i++) {
      await prisma.employee.create({
        data: {
          id: generateUid("EMP"),
          name: "User " + i,
          role: "TECHNICIAN",
          status: "Active",
          franchiseId: franchise.id,
          username: \`user\${i}_\${franchise.id}\`,
          password: "hash"
        }
      });
    }

    const { EmployeeService } = await import('../src/modules/employee/service/employee.service.js');
    const empService = new EmployeeService();

    // 10 concurrent creations
    const empPromises = [];
    for (let i = 0; i < 10; i++) {
      empPromises.push(
        empService.createEmployee({
          name: "Conc User " + i,
          role: "TECHNICIAN",
          franchiseId: franchise.id,
          username: \`conc\${i}_\${franchise.id}\`,
          password: "test"
        }, "FRANCHISE_ADMIN", franchise.id, true)
      );
    }

    const empResults = await Promise.allSettled(empPromises);
    const empSuccess = empResults.filter(r => r.status === 'fulfilled').length;
    const empFail = empResults.filter(r => r.status === 'rejected').length;
    
    const finalCount = await prisma.employee.count({ where: { franchiseId: franchise.id } });
    console.log(`License Results: Success: ${empSuccess}, Failed: ${empFail}, Final Employee Count: ${finalCount}`);
    if (empSuccess !== 1 || empFail !== 9 || finalCount !== 6) {
      throw new Error("License concurrency test failed!");
    }
    console.log("✓ License Concurrency Test Passed");

    // 3. Payment Idempotency Test
    console.log("\\n[3] Payment Idempotency Test");
    const { PaymentsService } = await import('../src/modules/payments/service/payments.service.js');
    const payService = new PaymentsService();
    const idempotencyKey = generateUid("IDEM");
    
    const payPromises = [];
    for (let i = 0; i < 2; i++) {
      payPromises.push(
        payService.createPayment({
          amount: 500,
          client: "Idemp Test",
          mode: "Cash",
          type: "Full Payment",
          idempotencyKey: idempotencyKey
        }, { unrestricted: true })
      );
    }
    
    const payResults = await Promise.allSettled(payPromises);
    const paySuccess = payResults.filter(r => r.status === 'fulfilled').length;
    const payFail = payResults.filter(r => r.status === 'rejected').length;
    
    console.log(\`Payment Idempotency Results: Success: \${paySuccess}, Failed: \${payFail}\`);
    if (paySuccess !== 1 || payFail !== 1) {
      throw new Error("Payment Idempotency test failed!");
    }
    console.log("✓ Payment Idempotency Test Passed");

    console.log("\\nAll Concurrency Tests Passed!");
  } catch (err) {
    console.error("Test Failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
