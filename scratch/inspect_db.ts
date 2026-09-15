import { db } from '../src/lib/db.js';

async function inspect() {
  const custs = await db.customer.findMany({ select: { id: true, name: true, phone: true } });
  const vehicles = await db.customerVehicle.findMany({ select: { id: true, vehicleNo: true, customerId: true } });
  const leads = await db.lead.findMany({ select: { id: true, customerId: true } });
  
  console.log('--- CUSTOMERS ---');
  console.log('Count:', custs.length);
  console.log('Sample customer IDs:', custs.slice(0, 10).map(c => c.id));
  
  console.log('\n--- VEHICLES ---');
  console.log('Count:', vehicles.length);
  console.log('Sample vehicles:', vehicles.slice(0, 5));

  console.log('\n--- LEADS ---');
  console.log('Count:', leads.length);
  console.log('Converted leads count:', leads.filter(l => l.customerId).length);
  
  await db.$disconnect();
}

inspect().catch(console.error);
