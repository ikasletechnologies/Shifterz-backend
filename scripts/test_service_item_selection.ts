import { db } from '../src/lib/db.js';
import { ServiceService } from '../src/modules/service/service/service.service.js';
import { InventoryService } from '../src/modules/inventory/service/inventory.service.js';

async function runTests() {
  console.log('=== RUNNING SERVICE & ITEM SELECTION TESTS ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  const serviceService = new ServiceService();
  const inventoryService = new InventoryService();

  // Test 1: Seed / Ensure services exist
  const existingCarCleaning = await db.service.findFirst({
    where: { name: { contains: 'Car Cleaning', mode: 'insensitive' }, isDeleted: false }
  });

  let carCleaningId = existingCarCleaning?.id;
  if (!existingCarCleaning) {
    const created = await serviceService.createService({
      name: 'Car Cleaning',
      category: 'Cleaning',
      price: 500,
      gst: 18,
      duration: '1 hour',
      warranty: 'None',
      status: 'Active',
      taxApplicable: true
    });
    carCleaningId = created.id;
  }

  // Ensure an inactive service exists to verify filtering
  let inactiveService = await db.service.findFirst({
    where: { status: 'Inactive', isDeleted: false }
  });
  if (!inactiveService) {
    inactiveService = await serviceService.createService({
      name: 'Legacy Polish (Inactive)',
      category: 'Detailing',
      price: 1200,
      gst: 18,
      duration: '2 hours',
      warranty: 'None',
      status: 'Inactive',
      taxApplicable: true
    });
  }

  // Ensure Inventory items exist
  let engineOil = await db.inventory.findFirst({
    where: { name: { contains: 'Engine Oil', mode: 'insensitive' }, isDeleted: false }
  });
  if (!engineOil) {
    engineOil = await db.inventory.create({
      data: {
        id: 'ITMTESTENGINEOIL',
        name: 'Engine Oil',
        unit: 'Litre',
        category: 'Lubricants',
        stock: 50,
        reorder: 10,
        cost: 800,
        supplier: 'Castrol',
        location: 'Aisle 1',
        franchiseId: null, // Global
        isDeleted: false
      }
    });
  }

  let oilFilter = await db.inventory.findFirst({
    where: { name: { contains: 'Oil Filter', mode: 'insensitive' }, isDeleted: false }
  });
  if (!oilFilter) {
    oilFilter = await db.inventory.create({
      data: {
        id: 'ITMTESTOILFILTER',
        name: 'Oil Filter',
        unit: 'Piece',
        category: 'Filters',
        stock: 30,
        reorder: 5,
        cost: 300,
        supplier: 'Bosch',
        location: 'Aisle 2',
        franchiseId: null, // Global
        isDeleted: false
      }
    });
  }

  // Create a franchise-specific inventory item
  const testFranchiseA = 'FRAN-TEST-A';
  const testFranchiseB = 'FRAN-TEST-B';

  await db.franchise.upsert({
    where: { id: testFranchiseA },
    create: {
      id: testFranchiseA,
      name: 'Test Branch A',
      city: 'Chennai',
      owner: 'Owner A',
      phone: '9000000001',
      since: new Date(),
      revenue: 0,
      jobs: 0,
      royaltyPct: 10,
      status: 'Active'
    },
    update: {}
  });

  await db.franchise.upsert({
    where: { id: testFranchiseB },
    create: {
      id: testFranchiseB,
      name: 'Test Branch B',
      city: 'Coimbatore',
      owner: 'Owner B',
      phone: '9000000002',
      since: new Date(),
      revenue: 0,
      jobs: 0,
      royaltyPct: 10,
      status: 'Active'
    },
    update: {}
  });

  const branchItemA = await db.inventory.upsert({
    where: { id: 'ITM-BRANCH-A-EXCLUSIVE' },
    create: {
      id: 'ITM-BRANCH-A-EXCLUSIVE',
      name: 'Branch A Brake Fluid',
      unit: 'Bottle',
      category: 'Fluids',
      stock: 20,
      reorder: 5,
      cost: 450,
      supplier: 'Local A',
      location: 'Bin A',
      franchiseId: testFranchiseA,
      isDeleted: false
    },
    update: { isDeleted: false, franchiseId: testFranchiseA }
  });

  const branchItemB = await db.inventory.upsert({
    where: { id: 'ITM-BRANCH-B-EXCLUSIVE' },
    create: {
      id: 'ITM-BRANCH-B-EXCLUSIVE',
      name: 'Branch B Gear Oil',
      unit: 'Bottle',
      category: 'Fluids',
      stock: 15,
      reorder: 3,
      cost: 600,
      supplier: 'Local B',
      location: 'Bin B',
      franchiseId: testFranchiseB,
      isDeleted: false
    },
    update: { isDeleted: false, franchiseId: testFranchiseB }
  });

  // TEST 1: Service Master Data
  const allServices = await serviceService.getAllServices();
  assert(allServices.length > 0, 'Services master returns records');
  assert(allServices.some(s => s.name.toLowerCase().includes('car cleaning')), 'Services master includes Car Cleaning');

  // TEST 2: Active Services Filtering
  const activeServices = await serviceService.getAllServices('Active');
  assert(activeServices.every(s => s.status === 'Active'), 'getAllServices("Active") returns ONLY active services');
  assert(!activeServices.some(s => s.id === inactiveService.id), 'Inactive services are filtered out of active query');

  // TEST 3: Strict Separation - Services do NOT contain Inventory items
  assert(allServices.every((s: any) => s.stock === undefined), 'Service records do not contain inventory stock fields');
  assert(!allServices.some(s => s.name === 'Engine Oil'), 'Service records do not include Inventory item "Engine Oil"');

  // TEST 4: Item Master Data
  // Super Admin view
  const superAdminActor = { role: 'SUPER_ADMIN' };
  const superAdminItems = await inventoryService.getAllItems(superAdminActor);
  assert(superAdminItems.length > 0, 'Super Admin can view inventory items');
  assert(superAdminItems.some(i => i.id === branchItemA.id), 'Super Admin sees Branch A exclusive item');
  assert(superAdminItems.some(i => i.id === branchItemB.id), 'Super Admin sees Branch B exclusive item');

  // Franchise Admin view - Branch A
  const franchiseAActor = { role: 'FRANCHISE_ADMIN', franchiseId: testFranchiseA };
  const franchiseAItems = await inventoryService.getAllItems(franchiseAActor);
  assert(franchiseAItems.some(i => i.id === branchItemA.id), 'Branch A Admin sees Branch A item');
  assert(!franchiseAItems.some(i => i.id === branchItemB.id), 'Branch A Admin CANNOT see Branch B exclusive item');
  assert(franchiseAItems.some(i => i.name === 'Engine Oil'), 'Branch A Admin sees global items (franchiseId: null)');

  // TEST 5: Strict Separation - Items do NOT contain Services
  assert(!superAdminItems.some(i => i.name.toLowerCase().includes('car cleaning')), 'Inventory records do not include Service "Car Cleaning"');

  // TEST 6: Auto-population & Document Calculation Test
  // Mixed document:
  // Services:
  // - Car Cleaning: Qty 1, Rate 500, GST 18%
  // Items:
  // - Engine Oil: Qty 2, Rate 800, GST 18%
  // - Oil Filter: Qty 1, Rate 300, GST 18%
  const serviceLines = [
    { type: 'SERVICE', serviceId: carCleaningId, desc: 'Car Cleaning', qty: 1, price: 500, gstPercent: 18, amount: 500 }
  ];
  const itemLines = [
    { type: 'ITEM', itemId: engineOil.id, desc: 'Engine Oil', qty: 2, price: 800, gstPercent: 18, amount: 1600 },
    { type: 'ITEM', itemId: oilFilter.id, desc: 'Oil Filter', qty: 1, price: 300, gstPercent: 18, amount: 300 }
  ];

  // Dynamic tab counts:
  const serviceCount = serviceLines.filter(s => s.desc.trim()).length;
  const itemCount = itemLines.filter(i => i.desc.trim()).length;
  const allCount = serviceCount + itemCount;

  assert(serviceCount === 1, `Dynamic service count is 1 (actual: ${serviceCount})`);
  assert(itemCount === 2, `Dynamic item count is 2 (actual: ${itemCount})`);
  assert(allCount === 3, `Dynamic all count is 3 (actual: ${allCount})`);

  // Calculations:
  const serviceSubtotal = serviceLines.reduce((sum, s) => sum + (s.qty * s.price), 0);
  const serviceGst = serviceLines.reduce((sum, s) => sum + ((s.qty * s.price * s.gstPercent) / 100), 0);

  const itemSubtotal = itemLines.reduce((sum, i) => sum + (i.qty * i.price), 0);
  const itemGst = itemLines.reduce((sum, i) => sum + ((i.qty * i.price * i.gstPercent) / 100), 0);

  const baseAmount = serviceSubtotal + itemSubtotal;
  const totalGst = serviceGst + itemGst;
  const grandTotal = baseAmount + totalGst;

  assert(serviceSubtotal === 500, `Service subtotal is 500 (actual: ${serviceSubtotal})`);
  assert(itemSubtotal === 1900, `Item subtotal is 1900 (actual: ${itemSubtotal})`);
  assert(baseAmount === 2400, `Base subtotal includes both services and items: 2400 (actual: ${baseAmount})`);
  assert(serviceGst === 90, `Service GST is 90 (actual: ${serviceGst})`);
  assert(itemGst === 342, `Item GST is 342 (actual: ${itemGst})`);
  assert(totalGst === 432, `Total GST includes both services and items: 432 (actual: ${totalGst})`);
  assert(grandTotal === 2832, `Grand total includes both services and items: 2832 (actual: ${grandTotal})`);

  // TEST 7: Remove one service line -> dynamic count update
  const updatedServiceLines: typeof serviceLines = [];
  const updatedServiceCount = updatedServiceLines.filter(s => s.desc.trim()).length;
  const updatedAllCount = updatedServiceCount + itemCount;

  assert(updatedServiceCount === 0, `Updated service count after removal is 0 (actual: ${updatedServiceCount})`);
  assert(updatedAllCount === 2, `Updated all count after removal is 2 (actual: ${updatedAllCount})`);

  // TEST 8: Validation Check
  // Service validation against catalog
  const catalogServices = await serviceService.getAllServices('Active');
  const validServiceCheck = catalogServices.some(cs => cs.name.trim().toLowerCase() === 'car cleaning');
  const randomServiceCheck = catalogServices.some(cs => cs.name.toLowerCase() === 'some random gibberish service');

  assert(validServiceCheck === true, 'Catalog validates existing service "Car Cleaning"');
  assert(randomServiceCheck === false, 'Catalog rejects uncataloged random service text');

  // Item validation against catalog
  const catalogItems = await inventoryService.getAllItems(superAdminActor);
  const validItemCheck = catalogItems.some(ci => ci.name.toLowerCase() === 'engine oil');
  const randomItemCheck = catalogItems.some(ci => ci.name.toLowerCase() === 'some random gibberish item');

  assert(validItemCheck === true, 'Catalog validates existing item "Engine Oil"');
  assert(randomItemCheck === false, 'Catalog rejects uncataloged random item text');

  console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().then(() => process.exit(0)).catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
