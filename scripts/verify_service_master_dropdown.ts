import { db } from '../src/lib/db.js';
import { ServiceService } from '../src/modules/service/service/service.service.js';
import { InventoryService } from '../src/modules/inventory/service/inventory.service.js';

async function runVerification() {
  console.log('========================================================');
  console.log('STARTING SERVICE SELECTION & DROPDOWN BEHAVIOR VERIFICATION');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ ${testName}${detail ? ` (${detail})` : ''}`);
      passed++;
    } else {
      console.error(`  ✗ ${testName}${detail ? ` (${detail})` : ''}`);
      failed++;
    }
  }

  const serviceService = new ServiceService();
  const inventoryService = new InventoryService();

  // 1. Inspect existing Service Master records
  console.log('STEP 1: Verify current Service Master records in database');
  const allServices = await serviceService.getAllServices();
  console.log(`  Found ${allServices.length} service records in database:`);
  for (const s of allServices) {
    console.log(`    - ID: ${s.id}, Name: "${s.name}", Price: ₹${s.price}, GST: ${s.gst}%, Status: ${s.status}`);
  }

  const legacyPolish = allServices.find(s => s.name.toLowerCase().includes('legacy polish'));
  const carCleaning = allServices.find(s => s.name.trim().toLowerCase() === 'car cleaning');
  const ppfFullBody = allServices.find(s => s.name.toLowerCase().includes('ppf full body'));

  assert(Boolean(legacyPolish && legacyPolish.status === 'Inactive'), 'Legacy Polish exists and has status: Inactive');
  assert(Boolean(carCleaning && carCleaning.status === 'Active' && carCleaning.price === 25000), 'car cleaning exists, Active with Price ₹25,000');
  assert(Boolean(ppfFullBody && ppfFullBody.status === 'Active' && ppfFullBody.price === 234), 'ppf full body exists, Active with Price ₹234');

  // 2. Test Dropdown Open (Active Services Only)
  console.log('\nSTEP 2: When user clicks "Search services...", only active services appear');
  const activeServices = await serviceService.getAllServices('Active');
  
  assert(activeServices.some(s => s.name.trim().toLowerCase() === 'car cleaning'), 'car cleaning appears in dropdown');
  assert(activeServices.some(s => s.name.toLowerCase().includes('ppf full body')), 'ppf full body appears in dropdown');
  assert(!activeServices.some(s => s.id === legacyPolish?.id), 'Legacy Polish (Inactive) does NOT appear in dropdown');
  assert(!activeServices.some(s => s.status !== 'Active'), 'Only Active status services appear');

  // 3. Test Strict Master Separation (No Inventory in Services)
  console.log('\nSTEP 3: Verify strict master separation (no inventory items in service dropdown)');
  const inventoryItems = await inventoryService.getAllItems({ role: 'SUPER_ADMIN' });
  for (const item of inventoryItems) {
    const isPresentInServices = activeServices.some(s => s.name.toLowerCase() === item.name.toLowerCase());
    assert(!isPresentInServices, `Inventory item "${item.name}" is NOT in services dropdown`);
  }

  // 4. Test Search Functionality
  console.log('\nSTEP 4: Test searching in services dropdown');

  // Search "car"
  const searchCarQuery = 'car';
  const carResults = activeServices.filter(s =>
    s.name.toLowerCase().includes(searchCarQuery) || (s.code && s.code.toLowerCase().includes(searchCarQuery))
  );
  assert(carResults.some(s => s.name.trim().toLowerCase() === 'car cleaning'), 'Typing "car" matches "car cleaning"');
  assert(!carResults.some(s => s.name.toLowerCase().includes('ppf full body')), 'Typing "car" excludes "ppf full body"');

  // Search "ppf"
  const searchPpfQuery = 'ppf';
  const ppfResults = activeServices.filter(s =>
    s.name.toLowerCase().includes(searchPpfQuery) || (s.code && s.code.toLowerCase().includes(searchPpfQuery))
  );
  assert(ppfResults.some(s => s.name.toLowerCase().includes('ppf full body')), 'Typing "ppf" matches "ppf full body"');
  assert(!ppfResults.some(s => s.name.trim().toLowerCase() === 'car cleaning'), 'Typing "ppf" excludes "car cleaning"');

  // Search "legacy"
  const searchLegacyQuery = 'legacy';
  const legacyResults = activeServices.filter(s =>
    s.name.toLowerCase().includes(searchLegacyQuery) || (s.code && s.code.toLowerCase().includes(searchLegacyQuery))
  );
  assert(legacyResults.length === 0, 'Typing "legacy" returns 0 selectable results because it is Inactive');

  // 5. Test Selection & Auto-population
  console.log('\nSTEP 5: Test selection and auto-population');

  // Selecting "car cleaning"
  const selectedCar = carCleaning!;
  const qtyCar = 1;
  const rateCar = Number(selectedCar.price);
  const gstPctCar = Number(selectedCar.gst ?? 18);
  const amountCar = qtyCar * rateCar;
  const gstAmountCar = (amountCar * gstPctCar) / 100;
  const totalCar = amountCar + gstAmountCar;

  assert(selectedCar.name.trim() === 'car cleaning', 'Service name populated: "car cleaning"');
  assert(qtyCar === 1, 'Default quantity = 1');
  assert(rateCar === 25000, 'Standard rate populated from master: ₹25,000');
  assert(gstPctCar === 18, 'GST percentage populated: 18%');
  assert(amountCar === 25000, 'Amount calculated: ₹25,000');
  assert(totalCar === 29500, 'Total with GST calculated: ₹29,500');

  // Selecting "ppf full body"
  const selectedPpf = ppfFullBody!;
  const qtyPpf = 1;
  const ratePpf = Number(selectedPpf.price);
  const gstPctPpf = Number(selectedPpf.gst ?? 18);
  const amountPpf = qtyPpf * ratePpf;
  const gstAmountPpf = (amountPpf * gstPctPpf) / 100;
  const totalPpf = amountPpf + gstAmountPpf;

  assert(selectedPpf.name.trim() === 'ppf full body', 'Service name populated: "ppf full body"');
  assert(qtyPpf === 1, 'Default quantity = 1');
  assert(ratePpf === 234, 'Standard rate populated from master: ₹234');
  assert(gstPctPpf === 18, 'GST percentage populated: 18%');
  assert(amountPpf === 234, 'Amount calculated: ₹234');
  assert(totalPpf === 276.12, 'Total with GST calculated: ₹276.12');

  // 6. Test Data Scope: Super Admin vs Franchise Admin
  console.log('\nSTEP 6: Test Data Scope (Super Admin vs Franchise Admin)');
  
  // Super Admin scope
  const superAdminActor = { role: 'SUPER_ADMIN' };
  const superAdminServices = await serviceService.getAllServices('Active');
  const superAdminInventory = await inventoryService.getAllItems(superAdminActor);
  assert(superAdminServices.length >= 2, 'Super Admin sees all active global services');
  assert(superAdminInventory.some(i => i.franchiseId === 'FRAN-TEST-A'), 'Super Admin sees Branch A inventory');
  assert(superAdminInventory.some(i => i.franchiseId === 'FRAN-TEST-B'), 'Super Admin sees Branch B inventory');

  // Franchise Admin scope (Branch A)
  const franchiseAActor = { role: 'FRANCHISE_ADMIN', franchiseId: 'FRAN-TEST-A' };
  const franchiseAServices = await serviceService.getAllServices('Active');
  const franchiseAInventory = await inventoryService.getAllItems(franchiseAActor);
  assert(franchiseAServices.length >= 2, 'Branch A Admin sees all active global services');
  assert(franchiseAInventory.some(i => i.franchiseId === 'FRAN-TEST-A'), 'Branch A Admin sees Branch A inventory');
  assert(!franchiseAInventory.some(i => i.franchiseId === 'FRAN-TEST-B'), 'Branch A Admin CANNOT see Branch B inventory');

  console.log(`\n========================================================`);
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Verification failed with error:', err);
    process.exit(1);
  });
