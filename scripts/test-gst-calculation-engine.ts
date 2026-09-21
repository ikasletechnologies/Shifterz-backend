// GST-02 — executable verification for GstCalculationService.calculate().
// Pure function, zero DB dependency, so this actually runs and proves
// something. Run with: npx tsx scripts/test-gst-calculation-engine.ts
//
// This specifically exercises the defect GST-02 was created to fix: the old
// report.service.ts logic (`cgst = gst/2; sgst = gst/2; igst = 0`) applied
// unconditionally, regardless of seller/buyer state. Every case below checks
// that CGST+SGST vs IGST is chosen correctly based on an actual state
// comparison, not assumed.
import { GstCalculationService } from '../src/modules/gst/service/gstCalculation.service.js';

const engine = new GstCalculationService();
let pass = 0;
let fail = 0;

function assertEqual(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    console.log(`FAIL: ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertThrows(name: string, fn: () => void) {
  try {
    fn();
    fail++;
    console.log(`FAIL: ${name} — expected an error, none was thrown`);
  } catch {
    pass++;
    console.log(`PASS: ${name}`);
  }
}

// Same-state B2B -> CGST + SGST, IGST must be 0
{
  const result = engine.calculate({
    sellerState: 'Karnataka',
    sellerGstin: '29ABCDE1234F1Z5',
    buyerState: 'Karnataka',
    buyerGstin: '29XYZAB5678G1Z2',
    lineItems: [{ unitPrice: 1000, gstRate: 18 }],
  });
  assertEqual('same-state B2B -> supplyType B2B', result.supplyType, 'B2B');
  assertEqual('same-state B2B -> isIntraState true', result.isIntraState, true);
  assertEqual('same-state B2B -> cgst=90, sgst=90, igst=0', { cgst: result.cgst, sgst: result.sgst, igst: result.igst }, { cgst: 90, sgst: 90, igst: 0 });
}

// Same-state B2C (no buyer GSTIN) -> CGST + SGST
{
  const result = engine.calculate({
    sellerState: 'Karnataka',
    buyerState: 'Karnataka',
    lineItems: [{ unitPrice: 1000, gstRate: 18 }],
  });
  assertEqual('same-state B2C -> supplyType B2C', result.supplyType, 'B2C');
  assertEqual('same-state B2C -> cgst=90, sgst=90, igst=0', { cgst: result.cgst, sgst: result.sgst, igst: result.igst }, { cgst: 90, sgst: 90, igst: 0 });
}

// Different-state B2B -> IGST only, this is the exact case the old logic got wrong (always produced igst=0)
{
  const result = engine.calculate({
    sellerState: 'Karnataka',
    buyerGstin: '27XYZAB5678G1Z2',
    buyerState: 'Maharashtra',
    lineItems: [{ unitPrice: 1000, gstRate: 18 }],
  });
  assertEqual('different-state B2B -> isIntraState false', result.isIntraState, false);
  assertEqual('different-state B2B -> cgst=0, sgst=0, igst=180', { cgst: result.cgst, sgst: result.sgst, igst: result.igst }, { cgst: 0, sgst: 0, igst: 180 });
}

// Different-state B2C -> IGST only
{
  const result = engine.calculate({
    sellerState: 'Karnataka',
    buyerState: 'Tamil Nadu',
    lineItems: [{ unitPrice: 500, gstRate: 12 }],
  });
  assertEqual('different-state B2C -> supplyType B2C', result.supplyType, 'B2C');
  assertEqual('different-state B2C -> igst=60', result.igst, 60);
}

// State comparison is case/whitespace insensitive
{
  const result = engine.calculate({
    sellerState: '  karnataka ',
    buyerState: 'KARNATAKA',
    lineItems: [{ unitPrice: 1000, gstRate: 18 }],
  });
  assertEqual('state comparison ignores case/whitespace -> intra-state', result.isIntraState, true);
}

// GST-exempt / zero-rated service -> zero tax, but still reports taxable value
{
  const result = engine.calculate({
    sellerState: 'Karnataka',
    buyerState: 'Karnataka',
    lineItems: [{ unitPrice: 1000, gstRate: 18, taxApplicable: false }],
  });
  assertEqual('exempt line -> zero tax', { cgst: result.cgst, sgst: result.sgst, igst: result.igst, cess: result.cess }, { cgst: 0, sgst: 0, igst: 0, cess: 0 });
  assertEqual('exempt line -> taxable value still reported', result.taxableAmount, 1000);
}

// Discount reduces taxable value, tax computed on the discounted amount
{
  const result = engine.calculate({
    sellerState: 'Karnataka',
    buyerState: 'Karnataka',
    lineItems: [{ unitPrice: 1000, gstRate: 18, discount: 100 }],
  });
  assertEqual('line discount -> taxable value net of discount', result.taxableAmount, 900);
  assertEqual('line discount -> tax computed on discounted amount', { cgst: result.cgst, sgst: result.sgst }, { cgst: 81, sgst: 81 });
}

// Overall (invoice-level) discount is distributed proportionally across multiple lines
{
  const result = engine.calculate({
    sellerState: 'Karnataka',
    buyerState: 'Karnataka',
    lineItems: [
      { unitPrice: 800, gstRate: 18 },
      { unitPrice: 200, gstRate: 18 },
    ],
    overallDiscount: 100,
  });
  assertEqual('multi-line + overall discount -> taxable value nets to 900', result.taxableAmount, 900);
  assertEqual('multi-line + overall discount -> line count preserved', result.lines.length, 2);
}

// Multiple GST rates on different lines -> correct rate-wise totals, not one blended rate
{
  const result = engine.calculate({
    sellerState: 'Karnataka',
    buyerState: 'Karnataka',
    lineItems: [
      { unitPrice: 1000, gstRate: 18 },
      { unitPrice: 1000, gstRate: 5 },
    ],
  });
  assertEqual('multiple rates -> line 1 taxed at 18%', { cgst: result.lines[0]!.cgst, sgst: result.lines[0]!.sgst }, { cgst: 90, sgst: 90 });
  assertEqual('multiple rates -> line 2 taxed at 5%', { cgst: result.lines[1]!.cgst, sgst: result.lines[1]!.sgst }, { cgst: 25, sgst: 25 });
  assertEqual('multiple rates -> aggregate cgst=115, sgst=115', { cgst: result.cgst, sgst: result.sgst }, { cgst: 115, sgst: 115 });
}

// Cess is included correctly, on top of GST
{
  const result = engine.calculate({
    sellerState: 'Karnataka',
    buyerState: 'Karnataka',
    lineItems: [{ unitPrice: 1000, gstRate: 18, cessRate: 1 }],
  });
  assertEqual('cess included -> cess=10', result.cess, 10);
  assertEqual('cess included -> totalTax = cgst+sgst+cess = 190', result.totalTax, 190);
}

// Grand total = taxable + total tax
{
  const result = engine.calculate({
    sellerState: 'Karnataka',
    buyerState: 'Maharashtra',
    lineItems: [{ unitPrice: 1000, gstRate: 18 }],
  });
  assertEqual('grandTotal = taxableAmount + totalTax', result.grandTotal, result.taxableAmount + result.totalTax);
}

// Fail closed: missing seller state
assertThrows('missing sellerState throws', () => {
  engine.calculate({ sellerState: '', buyerState: 'Karnataka', lineItems: [{ unitPrice: 100, gstRate: 18 }] } as any);
});

// Fail closed: no place of supply derivable at all (no buyerState, no explicit placeOfSupply)
assertThrows('missing place of supply throws (does not silently default to intra-state)', () => {
  engine.calculate({ sellerState: 'Karnataka', lineItems: [{ unitPrice: 100, gstRate: 18 }] });
});

// Fail closed: no line items
assertThrows('empty lineItems throws', () => {
  engine.calculate({ sellerState: 'Karnataka', buyerState: 'Karnataka', lineItems: [] });
});

// Fail closed: negative rate/price rejected
assertThrows('negative unitPrice throws', () => {
  engine.calculate({ sellerState: 'Karnataka', buyerState: 'Karnataka', lineItems: [{ unitPrice: -100, gstRate: 18 }] });
});
assertThrows('negative gstRate throws', () => {
  engine.calculate({ sellerState: 'Karnataka', buyerState: 'Karnataka', lineItems: [{ unitPrice: 100, gstRate: -18 }] });
});

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
