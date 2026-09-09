import { ReportRepository } from '../repository/report.repository.js';
import { COMPLETED_JOB_STATUSES } from '../../../shared/constants/jobStatus.constants.js';
import { buildGstr2bReport, excludeRowsForDeletedPurchaseOrders } from './gstr2bAggregation.helper.js';

// ─── CSV Helpers ──────────────────────────────────────────────────────────────

function toCsv(rows: any[], columns: { key: string; label: string }[]): string {
  const header = columns.map(c => `"${c.label}"`).join(',');
  const lines = rows.map(row =>
    columns.map(c => {
      const val = row[c.key] ?? '';
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(',')
  );
  return [header, ...lines].join('\n');
}

function parseDate(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ReportService {
  constructor(private readonly repository: ReportRepository = new ReportRepository()) {}

  // ─── Existing ERP Summary ─────────────────────────────────────────────────

  async getReports(franchiseId?: string) {
    const [invoices, payments, leads, jobs, inventory, franchises] = await Promise.all([
      this.repository.getInvoices(franchiseId),
      this.repository.getPayments(franchiseId),
      this.repository.getLeads(franchiseId),
      this.repository.getJobs(franchiseId),
      this.repository.getInventory(franchiseId),
      this.repository.getFranchises(franchiseId),
    ]);

    const totalInvoiced = invoices.reduce((sum, i) => sum + (i.amount + i.gst - i.discount), 0);
    const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);

    const statusMap: Record<string, { amount: number; count: number }> = {};
    invoices.forEach(i => {
      const entry = statusMap[i.status] || { amount: 0, count: 0 };
      entry.amount += i.amount + i.gst - i.discount;
      entry.count += 1;
      statusMap[i.status] = entry;
    });
    const billingData = Object.entries(statusMap).map(([status, data]) => ({ status, ...data }));

    const serviceMap: Record<string, number> = {};
    let totalServiceRevenue = 0;
    invoices.forEach(i => {
      const s = i.service || 'General';
      if (!serviceMap[s]) serviceMap[s] = 0;
      const val = i.amount + i.gst - i.discount;
      serviceMap[s] += val;
      totalServiceRevenue += val;
    });
    const serviceRevenue = Object.entries(serviceMap)
      .map(([service, amount]) => ({
        service,
        amount,
        percentage: totalServiceRevenue > 0 ? Math.round((amount / totalServiceRevenue) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const sourceMap: Record<string, number> = {};
    leads.forEach(l => { sourceMap[l.source || 'Other'] = (sourceMap[l.source || 'Other'] || 0) + 1; });
    const totalLeads = leads.length;
    const leadSources = Object.entries(sourceMap)
      .map(([source, count]) => ({
        source,
        count,
        percentage: totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
    const convertedLeads = leads.filter(l => ['Converted', 'Won', 'Closed'].includes(l.status)).length;
    const leadConversion = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

    const jobStatusMap: Record<string, number> = {};
    jobs.forEach(j => { jobStatusMap[j.status] = (jobStatusMap[j.status] || 0) + 1; });
    const jobSummary = Object.entries(jobStatusMap).map(([status, count]) => {
      let color = 'bg-gray-100 text-gray-700';
      if (status === 'Completed') color = 'bg-green-100 text-green-700';
      if (status === 'Pending') color = 'bg-yellow-100 text-yellow-700';
      if (status === 'In Progress') color = 'bg-blue-100 text-blue-700';
      if (status === 'Cancelled') color = 'bg-red-100 text-red-700';
      return { status, count, color };
    });

    const inventoryMap: Record<string, { value: number; items: number }> = {};
    inventory.forEach(i => {
      const c = i.category || 'General';
      if (!inventoryMap[c]) inventoryMap[c] = { value: 0, items: 0 };
      inventoryMap[c].value += i.stock * i.cost;
      inventoryMap[c].items += i.stock;
    });
    const inventoryValue = Object.entries(inventoryMap).map(([category, data]) => ({ category, ...data }));

    const franchiseRevenue = franchises.reduce((sum, f) => sum + f.revenue, 0);

    return { billingData, serviceRevenue, leadSources, jobSummary, inventoryValue, totalInvoiced, totalCollected, leadConversion, franchiseRevenue };
  }

  // ─── Billing Reports (§13.13) ───────────────────────────────────────────────

  private invoiceNet(i: { amount: number; gst: number; discount: number }): number {
    return i.amount + i.gst - i.discount;
  }

  async getInvoiceRegisterReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getInvoicesInRange(franchiseId, parseDate(from), parseDate(to));
    return rows.map(i => ({
      invoiceNo: i.id,
      type: i.type,
      date: i.date?.toISOString().split('T')[0] ?? '',
      customer: i.client,
      phone: i.phone,
      vehicle: i.vehicle,
      service: i.service,
      amount: i.amount,
      gst: i.gst,
      discount: i.discount,
      total: this.invoiceNet(i),
      status: i.status,
      jobCardNo: i.jobId ?? '',
    }));
  }

  async getDailySalesReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getInvoicesInRange(franchiseId, parseDate(from), parseDate(to));
    const byDay = new Map<string, { count: number; total: number }>();
    rows.filter(i => i.status !== 'Cancelled').forEach(i => {
      const day = i.date?.toISOString().split('T')[0] ?? 'Unknown';
      const entry = byDay.get(day) || { count: 0, total: 0 };
      entry.count += 1;
      entry.total += this.invoiceNet(i);
      byDay.set(day, entry);
    });
    return Array.from(byDay.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getMonthlySalesReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getInvoicesInRange(franchiseId, parseDate(from), parseDate(to));
    const byMonth = new Map<string, { count: number; total: number }>();
    rows.filter(i => i.status !== 'Cancelled').forEach(i => {
      const month = i.date?.toISOString().slice(0, 7) ?? 'Unknown';
      const entry = byMonth.get(month) || { count: 0, total: 0 };
      entry.count += 1;
      entry.total += this.invoiceNet(i);
      byMonth.set(month, entry);
    });
    return Array.from(byMonth.entries())
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  async getCustomerWiseRevenueReport(franchiseId?: string, from?: string, to?: string) {
    // No customerId FK on Invoice — grouped by client name, case-insensitive (same
    // limitation the frontend already has joining jobs/invoices by vehicle string).
    const rows = await this.repository.getInvoicesInRange(franchiseId, parseDate(from), parseDate(to));
    const byCustomer = new Map<string, { customer: string; invoiceCount: number; total: number }>();
    rows.filter(i => i.status !== 'Cancelled').forEach(i => {
      const key = (i.client || 'Unknown').trim().toLowerCase();
      const entry = byCustomer.get(key) || { customer: i.client || 'Unknown', invoiceCount: 0, total: 0 };
      entry.invoiceCount += 1;
      entry.total += this.invoiceNet(i);
      byCustomer.set(key, entry);
    });
    return Array.from(byCustomer.values()).sort((a, b) => b.total - a.total);
  }

  async getFranchiseWiseRevenueReport(franchiseId?: string, from?: string, to?: string) {
    const [rows, franchises] = await Promise.all([
      this.repository.getInvoicesInRange(franchiseId, parseDate(from), parseDate(to)),
      this.repository.getFranchises(franchiseId),
    ]);
    const franchiseNames = new Map(franchises.map(f => [f.id, f.name]));
    const byFranchise = new Map<string, { invoiceCount: number; total: number }>();
    rows.filter(i => i.status !== 'Cancelled').forEach(i => {
      const key = i.franchiseId || 'Unassigned';
      const entry = byFranchise.get(key) || { invoiceCount: 0, total: 0 };
      entry.invoiceCount += 1;
      entry.total += this.invoiceNet(i);
      byFranchise.set(key, entry);
    });
    return Array.from(byFranchise.entries())
      .map(([id, data]) => ({ franchiseId: id, franchiseName: franchiseNames.get(id) ?? id, ...data }))
      .sort((a, b) => b.total - a.total);
  }

  // GST-06 — this must consume GstTransaction (the ledger GST-05 built),
  // not independently walk Invoice and recompute GST logic a second time.
  // Two sources are merged, never double-counted:
  //   1. The ledger (documentType='INVOICE') — the primary source, for every
  //      invoice created/converted after GST-05 was wired.
  //   2. Invoices with NO matching ledger row at all — compatibility only,
  //      for invoices that predate GST-05, using GST-03's old
  //      snapshot-or-flat-half-fallback logic. Excluded by id from the
  //      ledger query's result set, so nothing appears twice.
  // The ledger has no cancellation-sync mechanism yet (tracked as a follow-up
  // alongside GST-05A) — a ledger row's `status` field is always 'Active'
  // today even if the underlying invoice was cancelled afterward. Rather than
  // silently over-counting, this does one lightweight status lookup to
  // exclude those — a status check, not a recomputation of any GST figure,
  // so it doesn't reintroduce "walking invoices to redo GST math."
  async getGstSummaryReport(franchiseId?: string, from?: string, to?: string) {
    const fromDate = parseDate(from);
    const toDate = parseDate(to);

    const ledgerRows = await this.repository.getGstLedgerTransactionsInRange(franchiseId, fromDate, toDate);
    const cancelledIds = await this.repository.getCancelledInvoiceIds(ledgerRows.map((r) => r.documentId));
    const activeLedgerRows = ledgerRows.filter((r) => !cancelledIds.has(r.documentId));

    const legacyInvoices = await this.repository.getInvoicesWithoutLedgerEntryInRange(
      ledgerRows.map((r) => r.documentId),
      franchiseId,
      fromDate,
      toDate
    );

    const byMonth = new Map<string, { taxableAmount: number; gst: number; cgst: number; sgst: number; igst: number; invoiceIds: Set<string> }>();

    // GST-07 — a ledger row is now one (rate, HSN) group, not one aggregate
    // per invoice, so invoice counts must track distinct documentIds, not
    // raw row counts (an invoice with 2 rate groups is still 1 invoice).
    activeLedgerRows.forEach((r) => {
      const entry = byMonth.get(r.returnPeriod) || { taxableAmount: 0, gst: 0, cgst: 0, sgst: 0, igst: 0, invoiceIds: new Set<string>() };
      entry.taxableAmount += r.taxableValue;
      entry.cgst += r.cgst;
      entry.sgst += r.sgst;
      entry.igst += r.igst;
      entry.gst += r.cgst + r.sgst + r.igst + r.cess;
      entry.invoiceIds.add(r.documentId);
      byMonth.set(r.returnPeriod, entry);
    });

    legacyInvoices.forEach((i) => {
      const month = i.date?.toISOString().slice(0, 7) ?? 'Unknown';
      const entry = byMonth.get(month) || { taxableAmount: 0, gst: 0, cgst: 0, sgst: 0, igst: 0, invoiceIds: new Set<string>() };
      entry.taxableAmount += i.amount - i.discount;
      entry.gst += i.gst;
      if (i.cgst !== null && i.sgst !== null) {
        entry.cgst += i.cgst;
        entry.sgst += i.sgst;
        entry.igst += i.igst ?? 0;
      } else {
        entry.cgst += i.gst / 2;
        entry.sgst += i.gst / 2;
      }
      entry.invoiceIds.add(i.id);
      byMonth.set(month, entry);
    });

    return Array.from(byMonth.entries())
      .map(([month, { invoiceIds, ...data }]) => ({
        ...data,
        invoiceCount: invoiceIds.size,
        month,
        cgst: Math.round(data.cgst * 100) / 100,
        sgst: Math.round(data.sgst * 100) / 100,
        igst: Math.round(data.igst * 100) / 100,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  // GST-07 — GSTR-1: same architecture as GST-06, consumes GstTransaction
  // exclusively, never re-walks Invoice. B2B/B2C rows are per (invoice, rate
  // group) — one row per ledger entry — with each row also carrying the
  // invoice-level total (`invoiceValue`, summed across that invoice's own
  // ledger rows only, from the ledger itself, not by re-fetching Invoice).
  // Credit/Debit Note sections query documentType IN ('CREDIT_NOTE',
  // 'DEBIT_NOTE') — that query already works today; it returns nothing until
  // CN/DN issuance (deliberately deferred, per GST-04) starts writing rows,
  // at which point this report picks them up with no further change needed.
  async getGstr1Report(franchiseId?: string, from?: string, to?: string) {
    const fromDate = parseDate(from);
    const toDate = parseDate(to);

    const ledgerRows = await this.repository.getGstLedgerTransactionsInRange(franchiseId, fromDate, toDate, ['INVOICE']);
    const cancelledIds = await this.repository.getCancelledInvoiceIds(ledgerRows.map((r) => r.documentId));
    const activeRows = ledgerRows.filter((r) => !cancelledIds.has(r.documentId));

    const invoiceValueTotals = new Map<string, number>();
    activeRows.forEach((r) => {
      const lineTotal = r.taxableValue + r.cgst + r.sgst + r.igst + r.cess;
      invoiceValueTotals.set(r.documentId, (invoiceValueTotals.get(r.documentId) ?? 0) + lineTotal);
    });

    const toB2BLine = (r: (typeof activeRows)[number]) => ({
      invoiceNo: r.documentNumber,
      invoiceDate: r.documentDate,
      customerGstin: r.buyerGstin,
      customerName: r.buyerName,
      placeOfSupply: r.placeOfSupply,
      hsnSac: r.hsnSac,
      taxableValue: r.taxableValue,
      gstRate: r.gstRate,
      cgst: r.cgst,
      sgst: r.sgst,
      igst: r.igst,
      cess: r.cess,
      invoiceValue: Math.round((invoiceValueTotals.get(r.documentId) ?? 0) * 100) / 100,
    });

    const b2b = activeRows.filter((r) => r.supplyType === 'B2B').map(toB2BLine);
    // B2C: same structure, without the customer GSTIN column.
    const b2c = activeRows
      .filter((r) => r.supplyType === 'B2C')
      .map((r) => {
        const { customerGstin, ...rest } = toB2BLine(r);
        return rest;
      });

    const hsnSummaryMap = new Map<string, { hsnSac: string | null; gstRate: number | null; taxableValue: number; cgst: number; sgst: number; igst: number; cess: number }>();
    activeRows.forEach((r) => {
      const key = `${r.hsnSac ?? ''}|${r.gstRate ?? ''}`;
      const entry = hsnSummaryMap.get(key) || { hsnSac: r.hsnSac, gstRate: r.gstRate, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
      entry.taxableValue += r.taxableValue;
      entry.cgst += r.cgst;
      entry.sgst += r.sgst;
      entry.igst += r.igst;
      entry.cess += r.cess;
      hsnSummaryMap.set(key, entry);
    });
    const hsnSummary = Array.from(hsnSummaryMap.values()).map((e) => ({
      ...e,
      taxableValue: Math.round(e.taxableValue * 100) / 100,
      cgst: Math.round(e.cgst * 100) / 100,
      sgst: Math.round(e.sgst * 100) / 100,
      igst: Math.round(e.igst * 100) / 100,
      cess: Math.round(e.cess * 100) / 100,
    }));

    const cnDnRows = await this.repository.getGstLedgerTransactionsInRange(franchiseId, fromDate, toDate, ['CREDIT_NOTE', 'DEBIT_NOTE']);
    const creditNoteIds = cnDnRows.filter((r) => r.documentType === 'CREDIT_NOTE').map((r) => r.documentId);
    const debitNoteIds = cnDnRows.filter((r) => r.documentType === 'DEBIT_NOTE').map((r) => r.documentId);
    const [creditNoteMeta, debitNoteMeta] = await Promise.all([
      this.repository.getCreditNoteMetadata(creditNoteIds),
      this.repository.getDebitNoteMetadata(debitNoteIds),
    ]);

    const toCnDnLine = (r: (typeof cnDnRows)[number], meta: Map<string, { status: string; originalInvoiceId: string }>) => ({
      noteNumber: r.documentNumber,
      date: r.documentDate,
      originalInvoiceId: meta.get(r.documentId)?.originalInvoiceId ?? null,
      customerGstin: r.buyerGstin,
      hsnSac: r.hsnSac,
      taxableValue: r.taxableValue,
      cgst: r.cgst,
      sgst: r.sgst,
      igst: r.igst,
      cess: r.cess,
    });
    // Cancelled notes are excluded here — same live-status cross-check
    // pattern as cancelled invoices above, not a ledger resync.
    const creditNotes = cnDnRows
      .filter((r) => r.documentType === 'CREDIT_NOTE' && creditNoteMeta.get(r.documentId)?.status !== 'Cancelled')
      .map((r) => toCnDnLine(r, creditNoteMeta));
    const debitNotes = cnDnRows
      .filter((r) => r.documentType === 'DEBIT_NOTE' && debitNoteMeta.get(r.documentId)?.status !== 'Cancelled')
      .map((r) => toCnDnLine(r, debitNoteMeta));

    return { b2b, b2c, creditNotes, debitNotes, hsnSummary };
  }

  // GST-08 — GSTR-3B: an aggregate built entirely from GstTransaction, both
  // the outward (INVOICE/CREDIT_NOTE/DEBIT_NOTE) and input (PURCHASE) sides.
  // Per your instruction, this must never independently recalculate GST —
  // it only sums what the ledger already holds. Input tax credit will
  // legitimately read as zero until the purchase-invoice issuance workflow
  // (deliberately deferred, same as CN/DN in GST-04) starts writing
  // documentType='PURCHASE' rows — that's not a bug in this method, it's the
  // same "empty until the workflow exists" pattern already established for
  // GSTR-1's credit/debit note section.
  async getGstr3bReport(franchiseId?: string, from?: string, to?: string) {
    const fromDate = parseDate(from);
    const toDate = parseDate(to);

    const outwardRows = await this.repository.getGstLedgerTransactionsInRange(franchiseId, fromDate, toDate, ['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE']);
    const invoiceRows = outwardRows.filter((r) => r.documentType === 'INVOICE');
    const cancelledIds = await this.repository.getCancelledInvoiceIds(invoiceRows.map((r) => r.documentId));
    const activeInvoiceRows = invoiceRows.filter((r) => !cancelledIds.has(r.documentId));
    // Credit notes reduce, debit notes increase, output liability — signed
    // the same way real GSTR-3B treats them. Cancelled notes are excluded via
    // the same live-status cross-check used for GSTR-1's CN/DN section and
    // for cancelled invoices above — not a ledger resync.
    const [creditNoteMeta, debitNoteMeta] = await Promise.all([
      this.repository.getCreditNoteMetadata(outwardRows.filter((r) => r.documentType === 'CREDIT_NOTE').map((r) => r.documentId)),
      this.repository.getDebitNoteMetadata(outwardRows.filter((r) => r.documentType === 'DEBIT_NOTE').map((r) => r.documentId)),
    ]);
    const creditNoteRows = outwardRows.filter((r) => r.documentType === 'CREDIT_NOTE' && creditNoteMeta.get(r.documentId)?.status !== 'Cancelled');
    const debitNoteRows = outwardRows.filter((r) => r.documentType === 'DEBIT_NOTE' && debitNoteMeta.get(r.documentId)?.status !== 'Cancelled');

    let taxableOutwardSupplies = 0;
    let otherOutwardSupplies = 0; // nil-rated/exempt: taxable value with zero tax
    let interstateSupplies = 0;
    let cgstLiability = 0;
    let sgstLiability = 0;
    let igstLiability = 0;
    let cessLiability = 0;

    const applyOutward = (r: (typeof activeInvoiceRows)[number], sign: 1 | -1) => {
      const rowTax = r.cgst + r.sgst + r.igst;
      if (rowTax > 0) taxableOutwardSupplies += sign * r.taxableValue;
      else otherOutwardSupplies += sign * r.taxableValue;
      if (r.igst > 0) interstateSupplies += sign * r.taxableValue;
      cgstLiability += sign * r.cgst;
      sgstLiability += sign * r.sgst;
      igstLiability += sign * r.igst;
      cessLiability += sign * r.cess;
    };

    activeInvoiceRows.forEach((r) => applyOutward(r, 1));
    creditNoteRows.forEach((r) => applyOutward(r, -1));
    debitNoteRows.forEach((r) => applyOutward(r, 1));

    // Consistency fix — this previously filtered only by itcEligible, with no
    // cross-check against the owning PurchaseOrder's status, unlike the
    // outward/invoice side above (activeInvoiceRows). A cancelled purchase
    // order's eligible ledger rows would still count toward ITC here even
    // though GSTR-2B (which does apply this check) correctly excludes them.
    // Same "live status cross-check, not a ledger resync" pattern already
    // used everywhere else in this file, reusing GSTR-2B's own bulk lookup
    // rather than a second query mechanism.
    const purchaseRows = await this.repository.getGstLedgerTransactionsInRange(franchiseId, fromDate, toDate, ['PURCHASE']);
    const purchaseOrderIds = Array.from(new Set(purchaseRows.map((r) => r.documentId)));
    const purchaseOrderMeta = await this.repository.getPurchaseOrderMetadata(purchaseOrderIds);
    const activePurchaseRows = excludeRowsForDeletedPurchaseOrders(purchaseRows, purchaseOrderMeta);
    const eligiblePurchaseRows = activePurchaseRows.filter((r) => r.itcEligible === true);
    const inputTaxCredit = {
      cgst: eligiblePurchaseRows.reduce((sum, r) => sum + r.cgst, 0),
      sgst: eligiblePurchaseRows.reduce((sum, r) => sum + r.sgst, 0),
      igst: eligiblePurchaseRows.reduce((sum, r) => sum + r.igst, 0),
      cess: eligiblePurchaseRows.reduce((sum, r) => sum + r.cess, 0),
    };

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const outputTax = {
      cgst: round2(cgstLiability),
      sgst: round2(sgstLiability),
      igst: round2(igstLiability),
      cess: round2(cessLiability),
    };
    const itc = {
      cgst: round2(inputTaxCredit.cgst),
      sgst: round2(inputTaxCredit.sgst),
      igst: round2(inputTaxCredit.igst),
      cess: round2(inputTaxCredit.cess),
    };
    const netTaxLiability = {
      cgst: round2(outputTax.cgst - itc.cgst),
      sgst: round2(outputTax.sgst - itc.sgst),
      igst: round2(outputTax.igst - itc.igst),
      cess: round2(outputTax.cess - itc.cess),
    };

    return {
      outwardTaxableSupplies: round2(taxableOutwardSupplies),
      otherOutwardSupplies: round2(otherOutwardSupplies),
      interstateSupplies: round2(interstateSupplies),
      outputTax,
      inputTaxCredit: itc,
      netTaxLiability,
    };
  }

  // GSTR-2B — report over the existing GstTransaction(documentType='PURCHASE')
  // ledger, not a second GST-calculation system: every figure below is read
  // directly from already-persisted ledger fields, computed once at
  // purchase-invoice-attachment time by GstCalculationService. Franchise
  // scope: PURCHASE rows always carry franchiseId=null (purchases are
  // HQ-global throughout this codebase — confirmed in the GSTR-2B
  // investigation), so passing a franchise-scoped actor's own franchiseId
  // through the existing getGstLedgerTransactionsInRange() filter naturally
  // returns zero rows for that actor — no separate franchise-scope carve-out
  // needed, the existing mechanism already produces the correct "HQ-global,
  // never fabricated for a franchise" behavior by construction.
  async getGstr2bReport(franchiseId?: string, from?: string, to?: string) {
    const fromDate = parseDate(from);
    const toDate = parseDate(to);

    const rows = await this.repository.getGstLedgerTransactionsInRange(franchiseId, fromDate, toDate, ['PURCHASE']);
    const purchaseOrderIds = Array.from(new Set(rows.map((r) => r.documentId)));
    const purchaseOrderMeta = await this.repository.getPurchaseOrderMetadata(purchaseOrderIds);

    return buildGstr2bReport(rows, purchaseOrderMeta);
  }

  async exportBillingCsv(type: string, franchiseId?: string, from?: string, to?: string): Promise<{ csv: string; filename: string }> {
    const today = new Date().toISOString().split('T')[0];

    // GSTR-1/GSTR-3B don't fit the flat rows-of-one-shape model the rest of
    // this method uses (GSTR-1 is five sections, GSTR-3B is a single
    // aggregate object) — handled here, still sourced only from
    // getGstr1Report/getGstr3bReport, which read GstTransaction exclusively.
    if (type === 'gstr1') {
      const report = await this.getGstr1Report(franchiseId, from, to);
      const b2bCols = [
        { key: 'invoiceNo', label: 'Invoice No' },
        { key: 'invoiceDate', label: 'Invoice Date' },
        { key: 'customerGstin', label: 'Customer GSTIN' },
        { key: 'customerName', label: 'Customer Name' },
        { key: 'placeOfSupply', label: 'Place Of Supply' },
        { key: 'hsnSac', label: 'HSN/SAC' },
        { key: 'taxableValue', label: 'Taxable Value' },
        { key: 'gstRate', label: 'GST Rate' },
        { key: 'cgst', label: 'CGST' },
        { key: 'sgst', label: 'SGST' },
        { key: 'igst', label: 'IGST' },
        { key: 'cess', label: 'Cess' },
        { key: 'invoiceValue', label: 'Invoice Value' },
      ];
      const b2cCols = b2bCols.filter(c => c.key !== 'customerGstin');
      const hsnCols = [
        { key: 'hsnSac', label: 'HSN/SAC' },
        { key: 'gstRate', label: 'GST Rate' },
        { key: 'taxableValue', label: 'Taxable Value' },
        { key: 'cgst', label: 'CGST' },
        { key: 'sgst', label: 'SGST' },
        { key: 'igst', label: 'IGST' },
        { key: 'cess', label: 'Cess' },
      ];
      const cnDnCols = [
        { key: 'noteNumber', label: 'Note Number' },
        { key: 'date', label: 'Date' },
        { key: 'customerGstin', label: 'Customer GSTIN' },
        { key: 'hsnSac', label: 'HSN/SAC' },
        { key: 'taxableValue', label: 'Taxable Value' },
        { key: 'cgst', label: 'CGST' },
        { key: 'sgst', label: 'SGST' },
        { key: 'igst', label: 'IGST' },
        { key: 'cess', label: 'Cess' },
      ];
      const csv = [
        '"B2B Invoices"', toCsv(report.b2b, b2bCols),
        '', '"B2C Invoices"', toCsv(report.b2c, b2cCols),
        '', '"HSN/SAC Summary"', toCsv(report.hsnSummary, hsnCols),
        '', '"Credit Notes"', toCsv(report.creditNotes, cnDnCols),
        '', '"Debit Notes"', toCsv(report.debitNotes, cnDnCols),
      ].join('\n');
      return { csv, filename: `gstr1_${today}.csv` };
    }

    if (type === 'gstr3b') {
      const r = await this.getGstr3bReport(franchiseId, from, to);
      const rows = [
        { field: 'Outward Taxable Supplies', value: r.outwardTaxableSupplies },
        { field: 'Other Outward Supplies (Nil/Exempt)', value: r.otherOutwardSupplies },
        { field: 'Interstate Supplies', value: r.interstateSupplies },
        { field: 'Output CGST', value: r.outputTax.cgst },
        { field: 'Output SGST', value: r.outputTax.sgst },
        { field: 'Output IGST', value: r.outputTax.igst },
        { field: 'Output Cess', value: r.outputTax.cess },
        { field: 'Input Tax Credit CGST', value: r.inputTaxCredit.cgst },
        { field: 'Input Tax Credit SGST', value: r.inputTaxCredit.sgst },
        { field: 'Input Tax Credit IGST', value: r.inputTaxCredit.igst },
        { field: 'Input Tax Credit Cess', value: r.inputTaxCredit.cess },
        { field: 'Net Tax Liability CGST', value: r.netTaxLiability.cgst },
        { field: 'Net Tax Liability SGST', value: r.netTaxLiability.sgst },
        { field: 'Net Tax Liability IGST', value: r.netTaxLiability.igst },
        { field: 'Net Tax Liability Cess', value: r.netTaxLiability.cess },
      ];
      const csv = toCsv(rows, [{ key: 'field', label: 'Field' }, { key: 'value', label: 'Value' }]);
      return { csv, filename: `gstr3b_${today}.csv` };
    }

    if (type === 'gstr2b') {
      const report = await this.getGstr2bReport(franchiseId, from, to);
      const summaryRows = [
        { field: 'Total Purchase Documents', value: report.summary.totalDocuments },
        { field: 'Total Taxable Value', value: report.summary.totalTaxableValue },
        { field: 'Total CGST', value: report.summary.totalCgst },
        { field: 'Total SGST', value: report.summary.totalSgst },
        { field: 'Total IGST', value: report.summary.totalIgst },
        { field: 'Total CESS', value: report.summary.totalCess },
        { field: 'Total Eligible ITC', value: report.summary.totalEligibleItc },
        { field: 'Total Ineligible ITC', value: report.summary.totalIneligibleItc },
      ];
      const docCols = [
        { key: 'vendorName', label: 'Vendor Name' },
        { key: 'supplierGstin', label: 'Supplier GSTIN' },
        { key: 'invoiceNumber', label: 'Invoice Number' },
        { key: 'invoiceDate', label: 'Invoice Date' },
        { key: 'purchaseOrderId', label: 'Purchase Order ID' },
        { key: 'returnPeriod', label: 'Return Period' },
        { key: 'hsnSac', label: 'HSN/SAC' },
        { key: 'gstRate', label: 'GST Rate' },
        { key: 'taxableValue', label: 'Taxable Value' },
        { key: 'cgst', label: 'CGST' },
        { key: 'sgst', label: 'SGST' },
        { key: 'igst', label: 'IGST' },
        { key: 'cess', label: 'Cess' },
        { key: 'itcEligible', label: 'ITC Eligible' },
        { key: 'itcAmount', label: 'ITC Amount' },
        { key: 'status', label: 'Status' },
      ];
      const csv = [
        '"Summary"', toCsv(summaryRows, [{ key: 'field', label: 'Field' }, { key: 'value', label: 'Value' }]),
        '', '"Purchase Documents"', toCsv(report.documents, docCols),
      ].join('\n');
      return { csv, filename: `gstr2b_${today}.csv` };
    }

    const columnSets: Record<string, { key: string; label: string }[]> = {
      register: [
        { key: 'invoiceNo', label: 'Invoice No' },
        { key: 'type', label: 'Type' },
        { key: 'date', label: 'Date' },
        { key: 'customer', label: 'Customer' },
        { key: 'phone', label: 'Phone' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'amount', label: 'Amount' },
        { key: 'gst', label: 'GST' },
        { key: 'discount', label: 'Discount' },
        { key: 'total', label: 'Total' },
        { key: 'status', label: 'Status' },
        { key: 'jobCardNo', label: 'Job Card No' },
      ],
      'daily-sales': [
        { key: 'date', label: 'Date' },
        { key: 'count', label: 'Invoice Count' },
        { key: 'total', label: 'Total Revenue' },
      ],
      'monthly-sales': [
        { key: 'month', label: 'Month' },
        { key: 'count', label: 'Invoice Count' },
        { key: 'total', label: 'Total Revenue' },
      ],
      'customer-wise': [
        { key: 'customer', label: 'Customer' },
        { key: 'invoiceCount', label: 'Invoice Count' },
        { key: 'total', label: 'Total Revenue' },
      ],
      'franchise-wise': [
        { key: 'franchiseId', label: 'Franchise ID' },
        { key: 'franchiseName', label: 'Franchise' },
        { key: 'invoiceCount', label: 'Invoice Count' },
        { key: 'total', label: 'Total Revenue' },
      ],
      'gst-summary': [
        { key: 'month', label: 'Month' },
        { key: 'invoiceCount', label: 'Invoice Count' },
        { key: 'taxableAmount', label: 'Taxable Amount' },
        { key: 'gst', label: 'Total GST' },
        { key: 'cgst', label: 'CGST' },
        { key: 'sgst', label: 'SGST' },
      ],
    };

    let rows: any[] = [];

    switch (type) {
      case 'register':        rows = await this.getInvoiceRegisterReport(franchiseId, from, to); break;
      case 'daily-sales':     rows = await this.getDailySalesReport(franchiseId, from, to); break;
      case 'monthly-sales':   rows = await this.getMonthlySalesReport(franchiseId, from, to); break;
      case 'customer-wise':   rows = await this.getCustomerWiseRevenueReport(franchiseId, from, to); break;
      case 'franchise-wise':  rows = await this.getFranchiseWiseRevenueReport(franchiseId, from, to); break;
      case 'gst-summary':     rows = await this.getGstSummaryReport(franchiseId, from, to); break;
      default: throw new Error(`Unknown report type: ${type}`);
    }

    const columns = columnSets[type]!;
    const csv = toCsv(rows, columns);
    const filename = `billing_${type}_${today}.csv`;

    return { csv, filename };
  }

  // ─── Reception Reports ────────────────────────────────────────────────────

  async getAppointmentReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getAppointments(franchiseId, parseDate(from), parseDate(to));
    return rows.map(r => ({
      appointmentNo: r.id,
      date: r.scheduledDate?.toISOString().split('T')[0] ?? '',
      time: r.scheduledDate?.toISOString().split('T')[1]?.slice(0, 5) ?? '',
      customer: r.customerName,
      vehicle: r.vehicle,
      service: r.service,
      assignedStaff: r.assignedStaff ?? '',
      status: r.status,
      branch: r.franchiseId ?? '',
    }));
  }

  async getWalkInReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getWalkIns(franchiseId, parseDate(from), parseDate(to));
    return rows.map(r => ({
      checkInNo: r.id,
      date: r.inTime?.toISOString().split('T')[0] ?? '',
      time: r.inTime?.toISOString().split('T')[1]?.slice(0, 5) ?? '',
      customer: r.customer,
      phone: r.phone,
      vehicle: r.vehicle,
      service: r.service,
      receivedBy: r.receivedByName ?? '',
      odometer: r.odometer,
      status: r.status,
    }));
  }

  async getCheckinReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getCheckins(franchiseId, parseDate(from), parseDate(to));
    return rows.map(r => ({
      checkInNo: r.id,
      jobCardNo: r.jobCardId,
      date: r.inTime?.toISOString().split('T')[0] ?? '',
      customer: r.customer,
      phone: r.phone,
      vehicle: r.vehicle,
      model: r.model,
      service: r.service,
      odometer: r.odometer,
      fuelLevel: r.fuelLevel ?? '',
      keyCount: r.keyCount ?? 1,
      receivedBy: r.receivedByName ?? '',
      expectedDelivery: r.expectedDelivery?.toISOString().split('T')[0] ?? '',
      status: r.status,
    }));
  }

  async getDeliveryReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getDeliveries(franchiseId, parseDate(from), parseDate(to));
    return rows.map(r => ({
      checkInNo: r.id,
      jobCardNo: r.jobCardId,
      checkInDate: r.inTime?.toISOString().split('T')[0] ?? '',
      checkOutDate: r.checkOutAt?.toISOString().split('T')[0] ?? '',
      checkOutTime: r.checkOutAt?.toISOString().split('T')[1]?.slice(0, 5) ?? '',
      customer: r.customer,
      vehicle: r.vehicle,
      service: r.service,
      deliveredBy: r.checkOutByName ?? '',
      customerAcknowledgement: r.customerAcknowledgement ?? '',
    }));
  }

  async getReceptionRegister(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getReceptionRegister(franchiseId, parseDate(from), parseDate(to));
    return rows.map(r => ({
      id: r.id,
      jobCardNo: r.jobCardId,
      checkInDate: r.inTime?.toISOString().split('T')[0] ?? '',
      customer: r.customer,
      phone: r.phone,
      vehicle: r.vehicle,
      service: r.service,
      receivedBy: r.receivedByName ?? '',
      status: r.status,
      deliveryDate: r.checkOutAt?.toISOString().split('T')[0] ?? '',
      deliveredBy: r.checkOutByName ?? '',
    }));
  }

  async getPendingVehicleReport(franchiseId?: string) {
    const rows = await this.repository.getPendingVehicles(franchiseId);
    const now = new Date();
    return rows.map(r => {
      const inTime = r.inTime ? new Date(r.inTime) : now;
      const daysInWorkshop = Math.floor((now.getTime() - inTime.getTime()) / (1000 * 60 * 60 * 24));
      const expectedDelivery = r.expectedDelivery ? new Date(r.expectedDelivery) : null;
      const isOverdue = expectedDelivery && now > expectedDelivery;
      return {
        id: r.id,
        jobCardNo: r.jobCardId,
        checkInDate: r.inTime?.toISOString().split('T')[0] ?? '',
        customer: r.customer,
        phone: r.phone,
        vehicle: r.vehicle,
        service: r.service,
        expectedDelivery: r.expectedDelivery?.toISOString().split('T')[0] ?? 'Not Set',
        daysInWorkshop,
        isOverdue: isOverdue ? 'Yes' : 'No',
        status: r.status,
      };
    });
  }

  async getDailyMovementReport(franchiseId?: string, date?: string) {
    const rows = await this.repository.getDailyMovement(franchiseId, parseDate(date));
    return rows.map(r => ({
      id: r.id,
      customer: r.customer,
      vehicle: r.vehicle,
      service: r.service,
      checkIn: r.inTime?.toISOString().split('T')[1]?.slice(0, 5) ?? '',
      checkOut: r.checkOutAt?.toISOString().split('T')[1]?.slice(0, 5) ?? '',
      receivedBy: r.receivedByName ?? '',
      deliveredBy: r.checkOutByName ?? '',
      status: r.status,
    }));
  }

  // ─── Workshop Reports (PRD §10.12) ─────────────────────────────────────────

  async getWorkProgressReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getWorkshopJobs(franchiseId, parseDate(from), parseDate(to));
    return rows.map(r => ({
      jobCardNo: r.id,
      customer: r.customer,
      vehicle: r.vehicle,
      service: r.service,
      technician: r.technician,
      priority: r.priority,
      status: r.status,
      estCompletion: r.estCompletion?.toISOString().split('T')[0] ?? '',
    }));
  }

  async getEmployeeWorkloadReport(franchiseId?: string) {
    const [technicians, jobs] = await Promise.all([
      this.repository.getTechnicians(franchiseId),
      this.repository.getWorkshopJobs(franchiseId),
    ]);
    const isCompleted = (s: string) => COMPLETED_JOB_STATUSES.includes(s);
    return technicians.map(t => {
      const empJobs = jobs.filter(j => j.technicianId === t.id);
      return {
        employeeId: t.id,
        employeeName: t.name,
        assignedJobs: empJobs.length,
        inProgress: empJobs.filter(j => j.status === 'In Progress').length,
        completed: empJobs.filter(j => isCompleted(j.status)).length,
        rework: empJobs.filter(j => j.isRework).length,
      };
    });
  }

  async getCompletedJobsReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getWorkshopJobs(franchiseId, parseDate(from), parseDate(to));
    return rows
      .filter(r => COMPLETED_JOB_STATUSES.includes(r.status))
      .map(r => ({
        jobCardNo: r.id,
        customer: r.customer,
        vehicle: r.vehicle,
        service: r.service,
        technician: r.technician,
        startDate: r.startDate?.toISOString().split('T')[0] ?? '',
        actualCompletion: r.actualCompletion?.toISOString().split('T')[0] ?? '',
      }));
  }

  async getPendingJobsReport(franchiseId?: string) {
    const rows = await this.repository.getWorkshopJobs(franchiseId);
    const now = new Date();
    return rows
      .filter(r => !COMPLETED_JOB_STATUSES.includes(r.status))
      .map(r => ({
        jobCardNo: r.id,
        customer: r.customer,
        vehicle: r.vehicle,
        service: r.service,
        technician: r.technician,
        status: r.status,
        estCompletion: r.estCompletion?.toISOString().split('T')[0] ?? '',
        isOverdue: r.estCompletion && now > r.estCompletion ? 'Yes' : 'No',
      }));
  }

  async getMaterialConsumptionReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getMaterialConsumptions(franchiseId, parseDate(from), parseDate(to));
    return rows.map(r => ({
      jobCardNo: r.jobId,
      item: r.itemName,
      quantity: r.quantity,
      unit: r.unit ?? '',
      status: r.status,
      recordedBy: r.recordedBy ?? '',
      approvedBy: r.approvedBy ?? '',
      date: r.createdAt?.toISOString().split('T')[0] ?? '',
    }));
  }

  async getDelayAnalysisReport(franchiseId?: string) {
    const rows = await this.repository.getWorkshopJobs(franchiseId);
    const now = new Date();
    return rows
      .map(r => {
        const isCompleted = COMPLETED_JOB_STATUSES.includes(r.status);
        const end = isCompleted ? (r.actualCompletion ?? now) : now;
        const delayMs = end.getTime() - r.estCompletion.getTime();
        return { r, delayMs, isCompleted };
      })
      .filter(({ delayMs }) => delayMs > 0)
      .map(({ r, delayMs, isCompleted }) => ({
        jobCardNo: r.id,
        customer: r.customer,
        vehicle: r.vehicle,
        technician: r.technician,
        estCompletion: r.estCompletion?.toISOString().split('T')[0] ?? '',
        status: r.status,
        delayHours: Math.round(delayMs / (1000 * 60 * 60)),
        stillOpen: isCompleted ? 'No' : 'Yes',
      }));
  }

  // REP-01C (§16.5 Operational Reports) — the three "missing reports"
  // identified in REP-01: Job Card Register, Workshop Status Report,
  // Vehicle Live Status Report. All reuse the same this.repository.
  // getWorkshopJobs() rows and the existing Job.status vocabulary/
  // COMPLETED_JOB_STATUSES constant already used above — no new
  // workflow-stage engine invented (the EPB's §11.4 17-stage board is not
  // implemented anywhere in this codebase's data model, so Job.status is
  // used as "Current Stage", matching the existing convention).

  // REP-01C (D-REP6) — see getCustomerRegisterReport above for the
  // includeDeleted convention this follows.
  async getJobCardRegisterReport(franchiseId?: string, from?: string, to?: string, includeDeleted = false) {
    const rows = includeDeleted
      ? await this.repository.getWorkshopJobsForRegister(franchiseId, parseDate(from), parseDate(to), true)
      : await this.repository.getWorkshopJobs(franchiseId, parseDate(from), parseDate(to));
    return rows.map(r => ({
      jobCardNo: r.id,
      customer: r.customer,
      vehicle: r.vehicle,
      service: r.service,
      technician: r.technician,
      priority: r.priority,
      status: r.status,
      startDate: r.startDate?.toISOString().split('T')[0] ?? '',
      estCompletion: r.estCompletion?.toISOString().split('T')[0] ?? '',
      actualCompletion: r.actualCompletion?.toISOString().split('T')[0] ?? '',
      ...(includeDeleted ? { recordStatus: r.isDeleted ? 'Deleted' : 'Active' } : {}),
    }));
  }

  async getWorkshopStatusReport(franchiseId?: string) {
    const rows = await this.repository.getWorkshopJobs(franchiseId);
    const now = new Date();
    const statusMap = new Map<string, number>();
    rows.forEach(r => statusMap.set(r.status, (statusMap.get(r.status) || 0) + 1));
    return {
      totalActiveJobs: rows.filter(r => !COMPLETED_JOB_STATUSES.includes(r.status)).length,
      statusBreakdown: Array.from(statusMap.entries()).map(([status, count]) => ({ status, count })),
      delayedVehicles: rows.filter(r => !COMPLETED_JOB_STATUSES.includes(r.status) && r.estCompletion && now > r.estCompletion).length,
      readyForDelivery: rows.filter(r => r.status === 'Completed').length,
    };
  }

  // §11.3/§11.12.5 — the live board shows every ACTIVE (not yet Delivered/
  // Completed) job card; delivered vehicles drop off the board.
  async getVehicleLiveStatusReport(franchiseId?: string) {
    const rows = await this.repository.getWorkshopJobs(franchiseId);
    const now = new Date();
    return rows
      .filter(r => !COMPLETED_JOB_STATUSES.includes(r.status))
      .map(r => ({
        vehicleNo: r.vehicle,
        customer: r.customer,
        jobCardNo: r.id,
        assignedEmployee: r.technician,
        currentStage: r.status,
        priority: r.priority,
        checkInTime: r.startDate?.toISOString() ?? '',
        expectedDeliveryTime: r.estCompletion?.toISOString() ?? '',
        isDelayed: r.estCompletion && now > r.estCompletion ? 'Yes' : 'No',
      }));
  }

  // ─── QC Reports (PRD §12.9) ─────────────────────────────────────────────────

  private async getQcInspectionsWithJobs(franchiseId?: string, from?: string, to?: string) {
    const inspections = await this.repository.getQcInspections(franchiseId, parseDate(from), parseDate(to));
    const jobIds = [...new Set(inspections.map(i => i.jobId))];
    const jobs = jobIds.length > 0
      ? await this.repository.getWorkshopJobs(franchiseId)
      : [];
    const jobMap = new Map(jobs.map(j => [j.id, j]));
    return inspections.map(i => ({ inspection: i, job: jobMap.get(i.jobId) }));
  }

  async getQcRegisterReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.getQcInspectionsWithJobs(franchiseId, from, to);
    return rows.map(({ inspection: i, job }) => ({
      jobCardNo: i.jobId,
      vehicle: job?.vehicle ?? '',
      customer: job?.customer ?? '',
      attempt: i.attemptNumber,
      inspector: i.inspectorName ?? '',
      scheduledAt: i.scheduledAt?.toISOString().split('T')[0] ?? '',
      result: i.result,
      decidedAt: i.decidedAt?.toISOString().split('T')[0] ?? '',
    }));
  }

  async getPassedVehiclesReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.getQcInspectionsWithJobs(franchiseId, from, to);
    return rows
      .filter(({ inspection }) => inspection.result === 'Passed')
      .map(({ inspection: i, job }) => ({
        jobCardNo: i.jobId,
        vehicle: job?.vehicle ?? '',
        customer: job?.customer ?? '',
        inspector: i.inspectorName ?? '',
        decidedAt: i.decidedAt?.toISOString().split('T')[0] ?? '',
      }));
  }

  async getFailedVehiclesReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.getQcInspectionsWithJobs(franchiseId, from, to);
    return rows
      .filter(({ inspection }) => inspection.result === 'Failed')
      .map(({ inspection: i, job }) => ({
        jobCardNo: i.jobId,
        vehicle: job?.vehicle ?? '',
        customer: job?.customer ?? '',
        inspector: i.inspectorName ?? '',
        reason: i.reason ?? '',
        decidedAt: i.decidedAt?.toISOString().split('T')[0] ?? '',
      }));
  }

  async getReworkReport(franchiseId?: string) {
    const jobs = await this.repository.getWorkshopJobs(franchiseId);
    return jobs
      .filter(j => j.reworkCount > 0)
      .map(j => ({
        jobCardNo: j.id,
        vehicle: j.vehicle,
        customer: j.customer,
        technician: j.technician,
        reworkCount: j.reworkCount,
        qcAttempts: j.qcAttemptCount,
        status: j.status,
      }));
  }

  async getQcPerformanceReport(franchiseId?: string, from?: string, to?: string) {
    const [inspectors, inspections] = await Promise.all([
      this.repository.getQualityInspectors(franchiseId),
      this.repository.getQcInspections(franchiseId, parseDate(from), parseDate(to)),
    ]);
    return inspectors.map(insp => {
      const own = inspections.filter(i => i.inspectorId === insp.id);
      const decided = own.filter(i => i.result !== 'Pending');
      const passed = own.filter(i => i.result === 'Passed').length;
      const failed = own.filter(i => i.result === 'Failed').length;
      const avgDecisionHours = decided.length > 0
        ? decided.reduce((sum, i) => {
            if (!i.decidedAt) return sum;
            return sum + (i.decidedAt.getTime() - i.createdAt.getTime()) / (1000 * 60 * 60);
          }, 0) / decided.length
        : 0;
      return {
        inspectorId: insp.id,
        inspectorName: insp.name,
        totalAttempts: own.length,
        passed,
        failed,
        passRate: (passed + failed) > 0 ? Math.round((passed / (passed + failed)) * 100) : 0,
        avgDecisionHours: Math.round(avgDecisionHours * 10) / 10,
      };
    });
  }

  async getEmployeeReworkReport(franchiseId?: string) {
    const jobs = await this.repository.getWorkshopJobs(franchiseId);
    const byTechnician = new Map<string, { technicianId: string; technician: string; assignedJobs: number; reworkCount: number }>();
    for (const j of jobs) {
      const key = j.technicianId || j.technician || 'Unassigned';
      const entry = byTechnician.get(key) || { technicianId: j.technicianId ?? '', technician: j.technician, assignedJobs: 0, reworkCount: 0 };
      entry.assignedJobs++;
      entry.reworkCount += j.reworkCount;
      byTechnician.set(key, entry);
    }
    return Array.from(byTechnician.values());
  }

  async getBranchQcReport() {
    const [franchises, inspections] = await Promise.all([
      this.repository.getFranchises(),
      this.repository.getQcInspections(),
    ]);
    return franchises.map(f => {
      const own = inspections.filter(i => i.franchiseId === f.id);
      const passed = own.filter(i => i.result === 'Passed').length;
      const failed = own.filter(i => i.result === 'Failed').length;
      return {
        franchiseId: f.id,
        franchiseName: f.name,
        totalInspections: own.length,
        passed,
        failed,
        passRate: (passed + failed) > 0 ? Math.round((passed / (passed + failed)) * 100) : 0,
      };
    });
  }

  // ─── CSV Export (QC) ────────────────────────────────────────────────────────

  async exportQcCsv(type: string, franchiseId?: string, from?: string, to?: string): Promise<{ csv: string; filename: string }> {
    const columnSets: Record<string, { key: string; label: string }[]> = {
      register: [
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'customer', label: 'Customer' },
        { key: 'attempt', label: 'Attempt' },
        { key: 'inspector', label: 'Inspector' },
        { key: 'scheduledAt', label: 'Scheduled' },
        { key: 'result', label: 'Result' },
        { key: 'decidedAt', label: 'Decided On' },
      ],
      passed: [
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'customer', label: 'Customer' },
        { key: 'inspector', label: 'Inspector' },
        { key: 'decidedAt', label: 'Decided On' },
      ],
      failed: [
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'customer', label: 'Customer' },
        { key: 'inspector', label: 'Inspector' },
        { key: 'reason', label: 'Reason' },
        { key: 'decidedAt', label: 'Decided On' },
      ],
      rework: [
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'customer', label: 'Customer' },
        { key: 'technician', label: 'Technician' },
        { key: 'reworkCount', label: 'Rework Count' },
        { key: 'qcAttempts', label: 'QC Attempts' },
        { key: 'status', label: 'Status' },
      ],
      performance: [
        { key: 'inspectorId', label: 'Inspector ID' },
        { key: 'inspectorName', label: 'Inspector Name' },
        { key: 'totalAttempts', label: 'Total Attempts' },
        { key: 'passed', label: 'Passed' },
        { key: 'failed', label: 'Failed' },
        { key: 'passRate', label: 'Pass Rate %' },
        { key: 'avgDecisionHours', label: 'Avg Decision Time (hrs)' },
      ],
      'employee-rework': [
        { key: 'technicianId', label: 'Technician ID' },
        { key: 'technician', label: 'Technician' },
        { key: 'assignedJobs', label: 'Assigned Jobs' },
        { key: 'reworkCount', label: 'Rework Count' },
      ],
      branch: [
        { key: 'franchiseId', label: 'Franchise ID' },
        { key: 'franchiseName', label: 'Franchise' },
        { key: 'totalInspections', label: 'Total Inspections' },
        { key: 'passed', label: 'Passed' },
        { key: 'failed', label: 'Failed' },
        { key: 'passRate', label: 'Pass Rate %' },
      ],
    };

    let rows: any[] = [];
    const today = new Date().toISOString().split('T')[0];

    switch (type) {
      case 'register':         rows = await this.getQcRegisterReport(franchiseId, from, to); break;
      case 'passed':           rows = await this.getPassedVehiclesReport(franchiseId, from, to); break;
      case 'failed':           rows = await this.getFailedVehiclesReport(franchiseId, from, to); break;
      case 'rework':           rows = await this.getReworkReport(franchiseId); break;
      case 'performance':      rows = await this.getQcPerformanceReport(franchiseId, from, to); break;
      case 'employee-rework':  rows = await this.getEmployeeReworkReport(franchiseId); break;
      case 'branch':           rows = await this.getBranchQcReport(); break;
      default: throw new Error(`Unknown report type: ${type}`);
    }

    const columns = columnSets[type]!;
    const csv = toCsv(rows, columns);
    const filename = `qc_${type}_${today}.csv`;

    return { csv, filename };
  }

  // ─── CSV Export ────────────────────────────────────────────────────────────

  async exportWorkshopCsv(type: string, franchiseId?: string, from?: string, to?: string): Promise<{ csv: string; filename: string }> {
    const columnSets: Record<string, { key: string; label: string }[]> = {
      progress: [
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'customer', label: 'Customer' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'technician', label: 'Technician' },
        { key: 'priority', label: 'Priority' },
        { key: 'status', label: 'Status' },
        { key: 'estCompletion', label: 'Estimated Completion' },
      ],
      workload: [
        { key: 'employeeId', label: 'Employee ID' },
        { key: 'employeeName', label: 'Employee Name' },
        { key: 'assignedJobs', label: 'Assigned Jobs' },
        { key: 'inProgress', label: 'In Progress' },
        { key: 'completed', label: 'Completed' },
        { key: 'rework', label: 'Rework' },
      ],
      completed: [
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'customer', label: 'Customer' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'technician', label: 'Technician' },
        { key: 'startDate', label: 'Start Date' },
        { key: 'actualCompletion', label: 'Completed On' },
      ],
      pending: [
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'customer', label: 'Customer' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'technician', label: 'Technician' },
        { key: 'status', label: 'Status' },
        { key: 'estCompletion', label: 'Estimated Completion' },
        { key: 'isOverdue', label: 'Overdue?' },
      ],
      materials: [
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'item', label: 'Item' },
        { key: 'quantity', label: 'Quantity' },
        { key: 'unit', label: 'Unit' },
        { key: 'status', label: 'Status' },
        { key: 'recordedBy', label: 'Recorded By' },
        { key: 'approvedBy', label: 'Approved By' },
        { key: 'date', label: 'Date' },
      ],
      delays: [
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'customer', label: 'Customer' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'technician', label: 'Technician' },
        { key: 'estCompletion', label: 'Estimated Completion' },
        { key: 'status', label: 'Status' },
        { key: 'delayHours', label: 'Delay (Hours)' },
        { key: 'stillOpen', label: 'Still Open?' },
      ],
      // REP-01C — Job Card Register / Vehicle Live Status (§16.5). Workshop
      // Status is a single aggregate object, not a row list, so it is
      // deliberately not included here (its own JSON route is sufficient,
      // matching how getHQSummary/getFranchiseDashboardReport are also
      // JSON-only, no CSV export).
      'job-card-register': [
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'customer', label: 'Customer' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'technician', label: 'Technician' },
        { key: 'priority', label: 'Priority' },
        { key: 'status', label: 'Status' },
        { key: 'startDate', label: 'Start Date' },
        { key: 'estCompletion', label: 'Estimated Completion' },
        { key: 'actualCompletion', label: 'Actual Completion' },
      ],
      'vehicle-live-status': [
        { key: 'vehicleNo', label: 'Vehicle No' },
        { key: 'customer', label: 'Customer' },
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'assignedEmployee', label: 'Assigned Employee' },
        { key: 'currentStage', label: 'Current Stage' },
        { key: 'priority', label: 'Priority' },
        { key: 'checkInTime', label: 'Check-In Time' },
        { key: 'expectedDeliveryTime', label: 'Expected Delivery Time' },
        { key: 'isDelayed', label: 'Delayed?' },
      ],
    };

    let rows: any[] = [];
    const today = new Date().toISOString().split('T')[0];

    switch (type) {
      case 'progress':  rows = await this.getWorkProgressReport(franchiseId, from, to); break;
      case 'workload':  rows = await this.getEmployeeWorkloadReport(franchiseId);       break;
      case 'completed': rows = await this.getCompletedJobsReport(franchiseId, from, to); break;
      case 'pending':   rows = await this.getPendingJobsReport(franchiseId);            break;
      case 'materials': rows = await this.getMaterialConsumptionReport(franchiseId, from, to); break;
      case 'delays':    rows = await this.getDelayAnalysisReport(franchiseId);          break;
      case 'job-card-register':   rows = await this.getJobCardRegisterReport(franchiseId, from, to); break;
      case 'vehicle-live-status': rows = await this.getVehicleLiveStatusReport(franchiseId);          break;
      default: throw new Error(`Unknown report type: ${type}`);
    }

    const columns = columnSets[type]!;
    const csv = toCsv(rows, columns);
    const filename = `workshop_${type}_${today}.csv`;

    return { csv, filename };
  }

  // ─── CSV Export (Reception) ────────────────────────────────────────────────

  async exportReceptionCsv(type: string, franchiseId?: string, from?: string, to?: string, date?: string): Promise<{ csv: string; filename: string }> {
    const columnSets: Record<string, { key: string; label: string }[]> = {
      appointments: [
        { key: 'appointmentNo', label: 'Appointment No' },
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'customer', label: 'Customer' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'assignedStaff', label: 'Assigned Staff' },
        { key: 'status', label: 'Status' },
        { key: 'branch', label: 'Branch' },
      ],
      walkins: [
        { key: 'checkInNo', label: 'Check-In No' },
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'customer', label: 'Customer' },
        { key: 'phone', label: 'Phone' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'receivedBy', label: 'Received By' },
        { key: 'odometer', label: 'Odometer' },
        { key: 'status', label: 'Status' },
      ],
      checkins: [
        { key: 'checkInNo', label: 'Check-In No' },
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'date', label: 'Date' },
        { key: 'customer', label: 'Customer' },
        { key: 'phone', label: 'Phone' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'model', label: 'Model' },
        { key: 'service', label: 'Service' },
        { key: 'odometer', label: 'Odometer' },
        { key: 'fuelLevel', label: 'Fuel Level' },
        { key: 'keyCount', label: 'Key Count' },
        { key: 'receivedBy', label: 'Received By' },
        { key: 'expectedDelivery', label: 'Expected Delivery' },
        { key: 'status', label: 'Status' },
      ],
      deliveries: [
        { key: 'checkInNo', label: 'Check-In No' },
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'checkInDate', label: 'Check-In Date' },
        { key: 'checkOutDate', label: 'Delivery Date' },
        { key: 'checkOutTime', label: 'Delivery Time' },
        { key: 'customer', label: 'Customer' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'deliveredBy', label: 'Delivered By' },
        { key: 'customerAcknowledgement', label: 'Customer Acknowledgement' },
      ],
      register: [
        { key: 'id', label: 'ID' },
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'checkInDate', label: 'Check-In Date' },
        { key: 'customer', label: 'Customer' },
        { key: 'phone', label: 'Phone' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'receivedBy', label: 'Received By' },
        { key: 'status', label: 'Status' },
        { key: 'deliveryDate', label: 'Delivery Date' },
        { key: 'deliveredBy', label: 'Delivered By' },
      ],
      pending: [
        { key: 'id', label: 'ID' },
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'checkInDate', label: 'Check-In Date' },
        { key: 'customer', label: 'Customer' },
        { key: 'phone', label: 'Phone' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'expectedDelivery', label: 'Expected Delivery' },
        { key: 'daysInWorkshop', label: 'Days in Workshop' },
        { key: 'isOverdue', label: 'Overdue?' },
        { key: 'status', label: 'Status' },
      ],
      daily: [
        { key: 'id', label: 'ID' },
        { key: 'customer', label: 'Customer' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'checkIn', label: 'Check-In Time' },
        { key: 'checkOut', label: 'Check-Out Time' },
        { key: 'receivedBy', label: 'Received By' },
        { key: 'deliveredBy', label: 'Delivered By' },
        { key: 'status', label: 'Status' },
      ],
    };

    let rows: any[] = [];
    const today = new Date().toISOString().split('T')[0];

    switch (type) {
      case 'appointments': rows = await this.getAppointmentReport(franchiseId, from, to); break;
      case 'walkins':      rows = await this.getWalkInReport(franchiseId, from, to);      break;
      case 'checkins':     rows = await this.getCheckinReport(franchiseId, from, to);     break;
      case 'deliveries':   rows = await this.getDeliveryReport(franchiseId, from, to);   break;
      case 'register':     rows = await this.getReceptionRegister(franchiseId, from, to); break;
      case 'pending':      rows = await this.getPendingVehicleReport(franchiseId);        break;
      case 'daily':        rows = await this.getDailyMovementReport(franchiseId, date);  break;
      default: throw new Error(`Unknown report type: ${type}`);
    }

    const columns = columnSets[type]!;
    const csv = toCsv(rows, columns);
    const filename = `reception_${type}_${today}.csv`;

    return { csv, filename };
  }

  // ─── HQ & Franchise Dashboard Summary (PRD §16.3 & §16.4) ────────────────────

  // ═══ REP-01C (D-REP1/D-REP3) — Shared Dashboard Aggregation Layer ═══════
  // Canonical, reusable per-domain summary calculations. Every dashboard
  // view (HQ, Franchise, technician-facing, franchise-monitoring, CRM)
  // composes from these instead of independently re-querying/re-computing
  // the same business metrics — the root cause of the duplication REP-01
  // found. Extracted verbatim from getHQSummary's own pre-existing
  // formulas (including the REP-01A fixes below), not reformulated.

  async getRevenueSummary(franchiseId?: string) {
    const invoices = await this.repository.getInvoices(franchiseId);
    const todayStr = new Date().toISOString().split('T')[0] || '';
    const monthStr = todayStr.slice(0, 7);

    const todayRevenue = invoices
      .filter(i => (i.date?.toISOString().split('T')[0] === todayStr) && i.status !== 'Cancelled')
      .reduce((sum, i) => sum + this.invoiceNet(i), 0);

    const monthlyRevenue = invoices
      .filter(i => (i.date?.toISOString().slice(0, 7) === monthStr) && i.status !== 'Cancelled')
      .reduce((sum, i) => sum + this.invoiceNet(i), 0);

    const outstandingPayments = invoices
      .filter(i => i.status !== 'Paid' && i.status !== 'Cancelled')
      .reduce((sum, i) => sum + this.invoiceNet(i), 0);

    return { todayRevenue, monthlyRevenue, outstandingPayments };
  }

  async getLeadSummary(franchiseId?: string) {
    const leads = await this.repository.getLeads(franchiseId);
    return {
      newLeads: leads.filter(l => l.status === 'New' || l.status === 'NEW').length,
      convertedLeads: leads.filter(l => ['Converted', 'Won', 'Closed'].includes(l.status)).length,
      pendingFollowups: leads.filter(l => ['Follow-Up', 'Contacted', 'In Progress'].includes(l.status)).length,
      lostLeads: leads.filter(l => l.status === 'Lost' || l.status === 'LOST').length,
    };
  }

  async getWorkshopSummary(franchiseId?: string) {
    const jobs = await this.repository.getJobs(franchiseId);
    return {
      vehiclesInProgress: jobs.filter(j => j.status === 'In Progress').length,
      qcPending: jobs.filter(j => j.status === 'QC Pending').length,
      // REP-01A — "QC Passed" is the existing, established job status
      // meaning QC has cleared and the job is awaiting invoicing (the same
      // status billing.service.ts's own QC gate and
      // BILLING_ELIGIBLE_JOB_STATUSES already treat as billing-eligible).
      billingPending: jobs.filter(j => j.status === 'QC Passed').length,
      readyForDelivery: jobs.filter(j => j.status === 'Completed').length,
      delayedVehicles: jobs.filter(j => j.estCompletion && new Date(j.estCompletion) < new Date() && !COMPLETED_JOB_STATUSES.includes(j.status)).length,
    };
  }

  async getInventorySummary(franchiseId?: string) {
    const [inventory, inventoryRequests] = await Promise.all([
      this.repository.getInventory(franchiseId),
      this.repository.getInventoryRequestsList(franchiseId),
    ]);
    return {
      lowStock: inventory.filter(i => i.stock <= (i.reorder || 5)).length,
      pendingStockRequests: inventoryRequests.filter(r => r.status === 'Submitted').length,
      pendingDispatches: inventoryRequests.filter(r => r.status === 'Approved' || r.status === 'Partially Approved').length,
    };
  }

  async getEmployeeSummary(franchiseId?: string) {
    const employees = await this.repository.getEmployees(franchiseId);
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const todayRecords = await this.repository.getAttendanceForEmployees(employees.map(e => e.id), todayStart, todayEnd);
    return {
      totalEmployees: employees.length,
      presentToday: todayRecords.filter(a => a.status === 'Present').length,
      absentToday: todayRecords.filter(a => a.status === 'Absent').length,
    };
  }

  // EPB §16.4 Franchise Dashboard — canonical implementation. Reuses the
  // same shared aggregation methods as getHQSummary (D-REP3); the only
  // franchise-specific queries are today's appointments/check-ins, which
  // reuse the existing report repository methods already used by the
  // Reception reports (getAppointments/getCheckins), not a new query
  // mechanism.
  async getFranchiseDashboardReport(franchiseId: string) {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const [appointmentsToday, vehiclesReceivedToday, revenueSummary, workshopSummary, employeeSummary, inventorySummary] = await Promise.all([
      this.repository.getAppointments(franchiseId, todayStart, todayEnd),
      this.repository.getCheckins(franchiseId, todayStart, todayEnd),
      this.getRevenueSummary(franchiseId),
      this.getWorkshopSummary(franchiseId),
      this.getEmployeeSummary(franchiseId),
      this.getInventorySummary(franchiseId),
    ]);

    return {
      todaysAppointments: appointmentsToday.length,
      vehiclesReceived: vehiclesReceivedToday.length,
      activeJobs: workshopSummary.vehiclesInProgress,
      vehiclesReadyForDelivery: workshopSummary.readyForDelivery,
      revenueToday: revenueSummary.todayRevenue,
      outstandingPayments: revenueSummary.outstandingPayments,
      todaysAttendance: { present: employeeSummary.presentToday, absent: employeeSummary.absentToday },
      // Thin, matching the pre-existing workshop.service.ts implementation
      // this replaces as canonical — no per-employee breakdown exists yet
      // in that source either; not invented here as a "fix" beyond scope.
      employeePerformance: { totalEmployees: employeeSummary.totalEmployees },
      lowStockProducts: inventorySummary.lowStock,
    };
  }

  async getHQSummary(franchiseId?: string) {
    const [invoices, jobs, inventory, franchises, employees, customers, revenueSummary, leadSummary, workshopSummary, inventorySummaryShared] = await Promise.all([
      this.repository.getInvoices(franchiseId),
      this.repository.getJobs(franchiseId),
      this.repository.getInventory(franchiseId),
      this.repository.getFranchises(franchiseId),
      this.repository.getEmployees(franchiseId),
      this.repository.getCustomers(franchiseId),
      this.getRevenueSummary(franchiseId),
      this.getLeadSummary(franchiseId),
      this.getWorkshopSummary(franchiseId),
      this.getInventorySummary(franchiseId),
    ]);

    const franchiseMap = new Map(franchises.map(f => [f.id, f.name]));
    const branchRevMap = new Map<string, number>();
    invoices.filter(i => i.status !== 'Cancelled').forEach(i => {
      const bName = franchiseMap.get(i.franchiseId || '') || 'Main Branch';
      branchRevMap.set(bName, (branchRevMap.get(bName) || 0) + this.invoiceNet(i));
    });
    const branchRevenue = Array.from(branchRevMap.entries()).map(([branch, amount]) => ({ branch, amount }));

    return {
      businessSummary: {
        totalFranchises: franchises.length,
        // REP-01A — was identical to totalFranchises (franchises.length
        // with no status filter). "Active" is the existing, established
        // Franchise.status value already used elsewhere in this codebase
        // (e.g. hq.ts's own /dashboard route) — reused, not invented.
        activeFranchises: franchises.filter(f => f.status === 'Active').length,
        totalEmployees: employees.length,
        totalCustomers: customers.length,
        vehiclesServiced: jobs.filter(j => COMPLETED_JOB_STATUSES.includes(j.status)).length,
        activeJobCards: jobs.filter(j => !COMPLETED_JOB_STATUSES.includes(j.status)).length,
      },
      revenueSummary: {
        ...revenueSummary,
        branchRevenue,
      },
      leadSummary,
      workshopSummary,
      inventorySummary: {
        ...inventorySummaryShared,
        // HQ-specific valuation figure — not part of the shared summary
        // above since it's not a widely reused per-domain metric.
        inventoryValuation: inventory.reduce((sum, i) => sum + (i.stock * i.cost), 0),
      },
    };
  }

  // ─── CRM Reports (PRD §16.6) ─────────────────────────────────────────────────

  // REP-01C (D-REP6) — see getCustomerRegisterReport above for the
  // includeDeleted convention this follows.
  async getLeadRegisterReport(franchiseId?: string, from?: string, to?: string, includeDeleted = false) {
    const rows = includeDeleted
      ? await this.repository.getLeadsInRangeForRegister(franchiseId, parseDate(from), parseDate(to), true)
      : await this.repository.getLeadsInRange(franchiseId, parseDate(from), parseDate(to));
    return rows.map(l => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      source: l.source || 'Walk-in',
      status: l.status,
      assignedTo: l.assignedTo || 'Unassigned',
      date: l.date?.toISOString().split('T')[0] || '',
      notes: l.notes || '',
      ...(includeDeleted ? { recordStatus: l.isDeleted ? 'Deleted' : 'Active' } : {}),
    }));
  }

  async getLeadSourceAnalysisReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getLeadsInRange(franchiseId, parseDate(from), parseDate(to));
    const sourceMap = new Map<string, { count: number; converted: number }>();
    rows.forEach(l => {
      const s = l.source || 'Other';
      const entry = sourceMap.get(s) || { count: 0, converted: 0 };
      entry.count += 1;
      if (['Converted', 'Won', 'Closed'].includes(l.status)) entry.converted += 1;
      sourceMap.set(s, entry);
    });
    return Array.from(sourceMap.entries()).map(([source, data]) => ({
      source,
      count: data.count,
      converted: data.converted,
      conversionRate: data.count > 0 ? Math.round((data.converted / data.count) * 100) : 0,
    }));
  }

  async getLeadConversionReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getLeadsInRange(franchiseId, parseDate(from), parseDate(to));
    const total = rows.length;
    const converted = rows.filter(l => ['Converted', 'Won', 'Closed'].includes(l.status)).length;
    const lost = rows.filter(l => l.status === 'Lost' || l.status === 'LOST').length;
    const pending = total - converted - lost;
    return [{
      totalLeads: total,
      convertedLeads: converted,
      lostLeads: lost,
      pendingLeads: pending,
      conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0,
    }];
  }

  async getLostLeadReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getLeadsInRange(franchiseId, parseDate(from), parseDate(to));
    return rows.filter(l => l.status === 'Lost' || l.status === 'LOST').map(l => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      source: l.source || 'Other',
      date: l.date?.toISOString().split('T')[0] || '',
      reason: l.lostReason || l.notes || 'No reason specified',
    }));
  }

  async getFollowUpPerformanceReport(franchiseId?: string, from?: string, to?: string) {
    const followUps = await this.repository.getLeadFollowUpsInRange(franchiseId, parseDate(from), parseDate(to));
    const empMap = new Map<string, { employeeName: string; totalFollowups: number; modes: Record<string, number>; outcomes: Record<string, number> }>();
    followUps.forEach(f => {
      const name = f.performedBy || 'System';
      const entry = empMap.get(name) || { employeeName: name, totalFollowups: 0, modes: {}, outcomes: {} };
      entry.totalFollowups += 1;
      entry.modes[f.mode] = (entry.modes[f.mode] || 0) + 1;
      if (f.outcome) {
        entry.outcomes[f.outcome] = (entry.outcomes[f.outcome] || 0) + 1;
      }
      empMap.set(name, entry);
    });
    return Array.from(empMap.values()).map(e => ({
      employeeName: e.employeeName,
      totalFollowups: e.totalFollowups,
      phoneCall: e.modes['Phone Call'] || 0,
      whatsApp: e.modes['WhatsApp'] || 0,
      email: e.modes['Email'] || 0,
      interested: e.outcomes['Interested'] || 0,
      dealClosed: e.outcomes['Deal Closed'] || 0,
      noResponse: e.outcomes['No Response'] || 0,
    }));
  }

  // REP-01C (§16.6) — two more of the "missing reports" identified in
  // REP-01: Referral Report and Service Due Follow-up Report. Both
  // previously existed ONLY as an unscoped case inside
  // CustomerService.getReportCSV's own switch (no franchiseId filter at
  // all — a real cross-franchise data leak on export, not just
  // duplication); customer.service.ts's cases now delegate to these.
  async getReferralReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getReferralsInRange(franchiseId, parseDate(from), parseDate(to));
    return rows.map(r => ({
      id: r.id,
      referringCustomer: r.referringCustomer,
      referredName: r.referredName,
      referredPhone: r.referredPhone,
      referralDate: r.referralDate?.toISOString().split('T')[0] || '',
      status: r.status,
      rewardPointsApplied: r.rewardPointsApplied,
    }));
  }

  // Returns every ServiceReminder (all statuses), same as the original
  // unscoped customer.service.ts case this replaces — not pre-filtered to
  // "still pending", so no row that a prior consumer could see is dropped.
  // isOverdue is added, not a status filter, so callers can distinguish
  // "due but not yet acted on" for themselves.
  async getServiceDueFollowUpReport(franchiseId?: string) {
    const rows = await this.repository.getServiceDueReminders(franchiseId);
    return rows.map(sr => ({
      id: sr.id,
      customerName: sr.customer.name,
      vehicleNo: sr.vehicleNo,
      reminderType: sr.reminderType,
      scheduledDate: sr.scheduledDate?.toISOString().split('T')[0] || '',
      status: sr.status,
      isOverdue: sr.status === 'Pending' && sr.scheduledDate && new Date() > sr.scheduledDate ? 'Yes' : 'No',
      notes: sr.notes || '',
    }));
  }

  async exportCrmCsv(type: string, franchiseId?: string, from?: string, to?: string): Promise<{ csv: string; filename: string }> {
    let rows: any[] = [];
    const today = new Date().toISOString().split('T')[0];
    const columnSets: Record<string, { key: string; label: string }[]> = {
      register: [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Lead Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'source', label: 'Source' },
        { key: 'status', label: 'Status' },
        { key: 'assignedTo', label: 'Assigned To' },
        { key: 'date', label: 'Date' },
      ],
      sources: [
        { key: 'source', label: 'Source' },
        { key: 'count', label: 'Total Leads' },
        { key: 'converted', label: 'Converted' },
        { key: 'conversionRate', label: 'Conversion Rate (%)' },
      ],
      conversion: [
        { key: 'totalLeads', label: 'Total Leads' },
        { key: 'convertedLeads', label: 'Converted Leads' },
        { key: 'lostLeads', label: 'Lost Leads' },
        { key: 'pendingLeads', label: 'Pending Leads' },
        { key: 'conversionRate', label: 'Conversion Rate (%)' },
      ],
      lost: [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Lead Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'source', label: 'Source' },
        { key: 'date', label: 'Date' },
        { key: 'reason', label: 'Reason' },
      ],
      'followup-performance': [
        { key: 'employeeName', label: 'Employee Name' },
        { key: 'totalFollowups', label: 'Total Follow-ups' },
        { key: 'phoneCall', label: 'Phone Call Count' },
        { key: 'whatsApp', label: 'WhatsApp Count' },
        { key: 'email', label: 'Email Count' },
        { key: 'interested', label: 'Interested Count' },
        { key: 'dealClosed', label: 'Deal Closed Count' },
        { key: 'noResponse', label: 'No Response Count' },
      ],
      referrals: [
        { key: 'id', label: 'Referral ID' },
        { key: 'referringCustomer', label: 'Referring Customer' },
        { key: 'referredName', label: 'Referred Name' },
        { key: 'referredPhone', label: 'Referred Phone' },
        { key: 'referralDate', label: 'Referral Date' },
        { key: 'status', label: 'Status' },
        { key: 'rewardPointsApplied', label: 'Reward Points' },
      ],
      'service-due-followup': [
        { key: 'id', label: 'Reminder ID' },
        { key: 'customerName', label: 'Customer Name' },
        { key: 'vehicleNo', label: 'Vehicle No' },
        { key: 'reminderType', label: 'Reminder Type' },
        { key: 'scheduledDate', label: 'Scheduled Date' },
        { key: 'status', label: 'Status' },
        { key: 'isOverdue', label: 'Overdue?' },
        { key: 'notes', label: 'Notes' },
      ],
    };

    switch (type) {
      case 'register':   rows = await this.getLeadRegisterReport(franchiseId, from, to); break;
      case 'sources':    rows = await this.getLeadSourceAnalysisReport(franchiseId, from, to); break;
      case 'conversion': rows = await this.getLeadConversionReport(franchiseId, from, to); break;
      case 'lost':       rows = await this.getLostLeadReport(franchiseId, from, to); break;
      case 'followup-performance': rows = await this.getFollowUpPerformanceReport(franchiseId, from, to); break;
      case 'referrals':             rows = await this.getReferralReport(franchiseId, from, to); break;
      case 'service-due-followup':  rows = await this.getServiceDueFollowUpReport(franchiseId); break;
      default: throw new Error(`Unknown CRM report type: ${type}`);
    }

    const columns = columnSets[type] || columnSets['register']!;
    const csv = toCsv(rows, columns);
    return { csv, filename: `crm_${type}_${today}.csv` };
  }

  // ─── Customer Reports (PRD §16.7) ────────────────────────────────────────────

  // REP-01C (D-REP6) — includeDeleted is a caller-authorized opt-in
  // (controller enforces HQ-tier only before setting it true), default
  // false so ordinary calls are unchanged. When true, each row carries an
  // explicit recordStatus marker rather than silently mixing deleted rows
  // in with no way to tell them apart.
  async getCustomerRegisterReport(franchiseId?: string, includeDeleted = false) {
    const customers = includeDeleted
      ? await this.repository.getCustomersForRegister(franchiseId, true)
      : await this.repository.getCustomers(franchiseId);
    return customers.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email || '',
      city: c.city || '',
      joinedDate: c.lastVisit?.toISOString().split('T')[0] || '',
      vehiclesCount: 1,
      ...(includeDeleted ? { recordStatus: c.isDeleted ? 'Deleted' : 'Active' } : {}),
    }));
  }

  async getCustomerVisitReport(franchiseId?: string, from?: string, to?: string) {
    const jobs = await this.repository.getWorkshopJobs(franchiseId, parseDate(from), parseDate(to));
    const visitMap = new Map<string, { customer: string; phone: string; visits: number; lastVisit: string }>();
    jobs.forEach(j => {
      const key = (j.customer || 'Unknown').trim();
      const entry = visitMap.get(key) || { customer: key, phone: '', visits: 0, lastVisit: '' };
      entry.visits += 1;
      const jDate = j.startDate?.toISOString().split('T')[0] || '';
      if (jDate > entry.lastVisit) entry.lastVisit = jDate;
      visitMap.set(key, entry);
    });
    return Array.from(visitMap.values()).sort((a, b) => b.visits - a.visits);
  }

  async getCustomerRevenueReport(franchiseId?: string, from?: string, to?: string) {
    return this.getCustomerWiseRevenueReport(franchiseId, from, to);
  }

  async getCustomerServiceHistoryReport(franchiseId?: string, from?: string, to?: string) {
    const jobs = await this.repository.getWorkshopJobs(franchiseId, parseDate(from), parseDate(to));
    return jobs.map(j => ({
      jobId: j.id,
      date: j.startDate?.toISOString().split('T')[0] ?? '',
      customer: j.customer,
      vehicle: j.vehicle,
      service: j.service,
      status: j.status,
      technician: j.technician || 'Unassigned',
    }));
  }

  async exportCustomerCsv(type: string, franchiseId?: string, from?: string, to?: string): Promise<{ csv: string; filename: string }> {
    let rows: any[] = [];
    const today = new Date().toISOString().split('T')[0];
    const columnSets: Record<string, { key: string; label: string }[]> = {
      register: [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Customer Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' },
        { key: 'city', label: 'City' },
        { key: 'joinedDate', label: 'Joined Date' },
      ],
      visits: [
        { key: 'customer', label: 'Customer Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'visits', label: 'Total Visits' },
        { key: 'lastVisit', label: 'Last Visit Date' },
      ],
      revenue: [
        { key: 'customer', label: 'Customer Name' },
        { key: 'invoiceCount', label: 'Invoices' },
        { key: 'total', label: 'Total Revenue (₹)' },
      ],
      history: [
        { key: 'jobId', label: 'Job Card ID' },
        { key: 'date', label: 'Service Date' },
        { key: 'customer', label: 'Customer Name' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'status', label: 'Status' },
      ],
    };

    switch (type) {
      case 'register': rows = await this.getCustomerRegisterReport(franchiseId); break;
      case 'visits':   rows = await this.getCustomerVisitReport(franchiseId, from, to); break;
      case 'revenue':  rows = await this.getCustomerRevenueReport(franchiseId, from, to); break;
      case 'history':  rows = await this.getCustomerServiceHistoryReport(franchiseId, from, to); break;
      default: throw new Error(`Unknown Customer report type: ${type}`);
    }

    const columns = columnSets[type] || columnSets['register']!;
    const csv = toCsv(rows, columns);
    return { csv, filename: `customer_${type}_${today}.csv` };
  }

  // ─── Employee Reports (PRD §16.8) ────────────────────────────────────────────

  // REP-01A — this previously hardcoded attendanceToday: 'Present' and
  // daysWorkedThisMonth: 22 for every employee, never querying the
  // Attendance table at all. Now uses real Attendance rows and the same
  // status vocabulary/semantics already established elsewhere in this
  // codebase (hq.ts's employee performance report counts "Present"-status
  // rows the same way) — no new attendance business rules invented.
  async getAttendanceReport(franchiseId?: string) {
    const employees = await this.repository.getEmployees(franchiseId);
    const employeeIds = employees.map((e) => e.id);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

    const [todayRecords, monthRecords] = await Promise.all([
      this.repository.getAttendanceForEmployees(employeeIds, todayStart, todayEnd),
      this.repository.getAttendanceForEmployees(employeeIds, monthStart, todayEnd),
    ]);

    const todayStatusByEmployee = new Map(todayRecords.map((a) => [a.employeeId, a.status]));
    const presentDaysByEmployee = new Map<string, number>();
    monthRecords.forEach((a) => {
      if (a.status === 'Present') {
        presentDaysByEmployee.set(a.employeeId, (presentDaysByEmployee.get(a.employeeId) || 0) + 1);
      }
    });

    return employees.map(e => ({
      id: e.id,
      name: e.name,
      role: e.role,
      status: e.status || 'Active',
      attendanceToday: todayStatusByEmployee.get(e.id) || 'Not Logged',
      daysWorkedThisMonth: presentDaysByEmployee.get(e.id) || 0,
    }));
  }

  async getTechnicianProductivityReport(franchiseId?: string, from?: string, to?: string) {
    return this.getEmployeeWorkloadReport(franchiseId);
  }

  // REP-01C — canonical Leave Report (§16.8's missing report).
  async getLeaveReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getLeaveRequestsInRange(franchiseId, parseDate(from), parseDate(to));
    const now = new Date();
    return rows.map(lr => {
      const days = Math.max(1, Math.round((lr.endDate.getTime() - lr.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      return {
        id: lr.id,
        employeeId: lr.employeeId,
        employeeName: lr.employee.name,
        startDate: lr.startDate.toISOString().split('T')[0],
        endDate: lr.endDate.toISOString().split('T')[0],
        days,
        reason: lr.reason,
        status: lr.status,
        isOngoing: lr.status === 'Approved' && lr.startDate <= now && lr.endDate >= now ? 'Yes' : 'No',
      };
    });
  }

  async getRevenueContributionReport(franchiseId?: string, from?: string, to?: string) {
    const [jobs, invoices] = await Promise.all([
      this.repository.getWorkshopJobs(franchiseId, parseDate(from), parseDate(to)),
      this.repository.getInvoicesInRange(franchiseId, parseDate(from), parseDate(to)),
    ]);
    const jobInvoiceMap = new Map(invoices.map(i => [i.jobId || '', this.invoiceNet(i)]));
    const techMap = new Map<string, { technician: string; jobsCount: number; revenueGenerated: number }>();
    jobs.forEach(j => {
      const tech = j.technician || 'Unassigned';
      const entry = techMap.get(tech) || { technician: tech, jobsCount: 0, revenueGenerated: 0 };
      entry.jobsCount += 1;
      entry.revenueGenerated += jobInvoiceMap.get(j.id) || 0;
      techMap.set(tech, entry);
    });
    return Array.from(techMap.values()).sort((a, b) => b.revenueGenerated - a.revenueGenerated);
  }

  // REP-01C (D-REP1) — canonical Employee Performance Report, the "missing
  // report" identified in REP-01: this metric existed only as duplicates
  // in hq.ts's /reports/employees/performance and
  // LeadReportService.getEmployeePerformanceReport (a lead-only slice),
  // never in the canonical report layer. hq.ts's version is the richest
  // (attendance + jobs + leads + revenue per employee) so its exact
  // calculation logic is reused here verbatim; hq.ts itself now becomes a
  // compatibility wrapper around this method.
  async getEmployeePerformanceReport(franchiseId?: string, timeframe?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let dateLimit = new Date(today);
    if (timeframe === 'weekly') {
      dateLimit.setDate(today.getDate() - 7);
    } else if (timeframe === 'monthly') {
      dateLimit.setMonth(today.getMonth() - 1);
    } else if (timeframe === 'annual') {
      dateLimit.setFullYear(today.getFullYear() - 1);
    } else {
      dateLimit = today;
    }

    const employees = await this.repository.getEmployeesWithFranchise(franchiseId);

    return Promise.all(employees.map(async (emp) => {
      const [presentCount, absentCount, jobs] = await Promise.all([
        this.repository.getAttendanceCountForEmployee(emp.id, 'Present', dateLimit),
        this.repository.getAttendanceCountForEmployee(emp.id, 'Absent', dateLimit),
        this.repository.getJobsForEmployeePerformance(emp.id, dateLimit),
      ]);

      const jobsAssigned = jobs.length;
      const jobsCompleted = jobs.filter(j => j.status === 'Delivered' || j.status === 'Completed' || j.status === 'QC Passed').length;
      const jobsPending = jobs.filter(j => j.status === 'Pending' || j.status === 'In Progress').length;
      const reworkCount = jobs.reduce((sum, j) => sum + j.reworkCount, 0);
      const qcFails = jobs.filter(j => j.failedAt !== null).length;

      const leads = await this.repository.getLeadsForEmployeePerformance(emp.name || '', dateLimit);
      const leadsAssigned = leads.length;
      const leadsConverted = leads.filter(l => l.status === 'Converted').length;

      const jobIds = jobs.map(j => j.id);
      const invoices = await this.repository.getInvoicesForEmployeePerformance(jobIds, jobs.map(j => j.customer), dateLimit);
      const revenueContribution = invoices.reduce((sum, i) => sum + this.invoiceNet(i), 0);

      return {
        employeeId: emp.id,
        name: emp.name,
        role: emp.role,
        franchiseName: (emp as any).franchise?.name || 'HQ',
        attendance: { present: presentCount, absent: absentCount },
        jobs: { assigned: jobsAssigned, completed: jobsCompleted, pending: jobsPending, qcFailures: qcFails, reworkCount },
        leads: {
          assigned: leadsAssigned,
          converted: leadsConverted,
          conversionRate: leadsAssigned > 0 ? Number(((leadsConverted / leadsAssigned) * 100).toFixed(2)) : 0,
        },
        revenueContribution,
      };
    }));
  }

  async exportEmployeeCsv(type: string, franchiseId?: string, from?: string, to?: string): Promise<{ csv: string; filename: string }> {
    let rows: any[] = [];
    const today = new Date().toISOString().split('T')[0];
    const columnSets: Record<string, { key: string; label: string }[]> = {
      attendance: [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Employee Name' },
        { key: 'role', label: 'Role' },
        { key: 'status', label: 'Status' },
        { key: 'attendanceToday', label: 'Today' },
      ],
      productivity: [
        { key: 'technician', label: 'Technician Name' },
        { key: 'totalJobs', label: 'Total Jobs' },
        { key: 'completed', label: 'Completed Jobs' },
        { key: 'inProgress', label: 'In Progress' },
      ],
      contribution: [
        { key: 'technician', label: 'Technician Name' },
        { key: 'jobsCount', label: 'Jobs Serviced' },
        { key: 'revenueGenerated', label: 'Revenue Contribution (₹)' },
      ],
      leave: [
        { key: 'employeeName', label: 'Employee Name' },
        { key: 'startDate', label: 'Start Date' },
        { key: 'endDate', label: 'End Date' },
        { key: 'days', label: 'Days' },
        { key: 'reason', label: 'Reason' },
        { key: 'status', label: 'Status' },
      ],
      // Employee Performance is a nested-object shape (attendance/jobs/
      // leads), not a flat row list, so it is deliberately not included
      // here — its own JSON route is sufficient, same reasoning as
      // Workshop Status above.
    };

    switch (type) {
      case 'attendance':   rows = await this.getAttendanceReport(franchiseId); break;
      case 'productivity': rows = await this.getTechnicianProductivityReport(franchiseId, from, to); break;
      case 'contribution': rows = await this.getRevenueContributionReport(franchiseId, from, to); break;
      case 'leave':        rows = await this.getLeaveReport(franchiseId, from, to); break;
      default: throw new Error(`Unknown Employee report type: ${type}`);
    }

    const columns = columnSets[type] || columnSets['attendance']!;
    const csv = toCsv(rows, columns);
    return { csv, filename: `employee_${type}_${today}.csv` };
  }

  // ─── Financial Reports (PRD §16.9) ───────────────────────────────────────────

  async getPaymentRegisterReport(franchiseId?: string, from?: string, to?: string) {
    const payments = await this.repository.getPaymentsInRange(franchiseId, parseDate(from), parseDate(to));
    return payments.map(p => ({
      receiptNo: p.receiptNumber || p.id,
      invoiceRef: p.invoiceId || 'N/A',
      client: p.client,
      amount: p.amount,
      mode: p.mode,
      type: p.type || 'Full Payment',
      date: p.date.toISOString().split('T')[0],
    }));
  }

  async getOutstandingReport(franchiseId?: string, from?: string, to?: string) {
    const invoices = await this.repository.getInvoicesInRange(franchiseId, parseDate(from), parseDate(to));
    return invoices
      .filter(i => i.status !== 'Paid' && i.status !== 'Cancelled')
      .map(i => {
        const net = this.invoiceNet(i);
        const paid = i.status === 'Paid' ? net : 0;
        return {
          invoiceNo: i.id,
          date: i.date?.toISOString().split('T')[0] ?? '',
          customer: i.client,
          phone: i.phone,
          totalAmount: net,
          amountPaid: paid,
          outstandingAmount: net - paid,
          status: i.status,
        };
      });
  }

  async getCollectionReport(franchiseId?: string, from?: string, to?: string) {
    const payments = await this.repository.getPaymentsInRange(franchiseId, parseDate(from), parseDate(to));
    const modeMap = new Map<string, { count: number; total: number }>();
    payments.forEach(p => {
      const mode = p.mode || 'Cash';
      const entry = modeMap.get(mode) || { count: 0, total: 0 };
      entry.count += 1;
      entry.total += p.amount;
      modeMap.set(mode, entry);
    });
    return Array.from(modeMap.entries()).map(([mode, data]) => ({
      mode,
      transactions: data.count,
      totalCollected: data.total,
    }));
  }

  async getPaymentModeSummaryReport(franchiseId?: string, from?: string, to?: string) {
    return this.getCollectionReport(franchiseId, from, to);
  }

  async exportFinancialCsv(type: string, franchiseId?: string, from?: string, to?: string): Promise<{ csv: string; filename: string }> {
    let rows: any[] = [];
    const today = new Date().toISOString().split('T')[0];
    const columnSets: Record<string, { key: string; label: string }[]> = {
      'payment-register': [
        { key: 'receiptNo', label: 'Receipt No' },
        { key: 'invoiceRef', label: 'Invoice Ref' },
        { key: 'client', label: 'Client' },
        { key: 'amount', label: 'Amount (₹)' },
        { key: 'mode', label: 'Payment Mode' },
        { key: 'type', label: 'Type' },
        { key: 'date', label: 'Date' },
      ],
      outstanding: [
        { key: 'invoiceNo', label: 'Invoice No' },
        { key: 'date', label: 'Date' },
        { key: 'customer', label: 'Customer' },
        { key: 'phone', label: 'Phone' },
        { key: 'totalAmount', label: 'Total Amount (₹)' },
        { key: 'amountPaid', label: 'Paid (₹)' },
        { key: 'outstandingAmount', label: 'Outstanding (₹)' },
        { key: 'status', label: 'Status' },
      ],
      collection: [
        { key: 'mode', label: 'Payment Mode' },
        { key: 'transactions', label: 'Transaction Count' },
        { key: 'totalCollected', label: 'Total Collected (₹)' },
      ],
    };
    // REP-01A — getPaymentModeSummaryReport delegates entirely to
    // getCollectionReport (same {mode, transactions, totalCollected} row
    // shape), but this columnSets map had no 'payment-modes' entry, so the
    // export silently fell back to 'payment-register''s columns
    // (receiptNo/invoiceRef/client/...) against the wrong row shape,
    // rendering blank/misaligned CSV output. Reuses the existing
    // 'collection' column set rather than duplicating it, since the data is
    // literally the same.
    columnSets['payment-modes'] = columnSets['collection']!;

    switch (type) {
      case 'payment-register': rows = await this.getPaymentRegisterReport(franchiseId, from, to); break;
      case 'outstanding':      rows = await this.getOutstandingReport(franchiseId, from, to); break;
      case 'collection':       rows = await this.getCollectionReport(franchiseId, from, to); break;
      case 'payment-modes':    rows = await this.getPaymentModeSummaryReport(franchiseId, from, to); break;
      default: throw new Error(`Unknown Financial report type: ${type}`);
    }

    const columns = columnSets[type] || columnSets['payment-register']!;
    const csv = toCsv(rows, columns);
    return { csv, filename: `financial_${type}_${today}.csv` };
  }

  // ─── Inventory Reports (PRD §16.10) ──────────────────────────────────────────

  // INV-06A — `price` (Math.round(cost * 1.35)) removed. There is no
  // Inventory.price/sellingPrice field and no configured markup anywhere
  // else in the codebase — the 35% figure was invented with no traceable
  // source and had no business behind it. `cost` (a real, persisted field)
  // is the only genuine value this report can show.
  async getProductRegisterReport(franchiseId?: string) {
    const items = await this.repository.getInventory(franchiseId);
    return items.map(i => ({
      sku: i.id,
      name: i.name,
      category: i.category || 'General',
      stock: i.stock,
      unit: i.unit || 'pcs',
      minStock: i.reorder || 5,
      cost: i.cost,
    }));
  }

  async getStockSummaryReport(franchiseId?: string) {
    const items = await this.repository.getInventory(franchiseId);
    const catMap = new Map<string, { category: string; totalItems: number; totalStock: number; totalValue: number }>();
    items.forEach(i => {
      const cat = i.category || 'General';
      const entry = catMap.get(cat) || { category: cat, totalItems: 0, totalStock: 0, totalValue: 0 };
      entry.totalItems += 1;
      entry.totalStock += i.stock;
      entry.totalValue += i.stock * i.cost;
      catMap.set(cat, entry);
    });
    return Array.from(catMap.values()).sort((a, b) => b.totalValue - a.totalValue);
  }

  async getLowStockReport(franchiseId?: string) {
    const items = await this.repository.getInventory(franchiseId);
    return items
      .filter(i => i.stock <= (i.reorder || 5))
      .map(i => ({
        sku: i.id,
        name: i.name,
        category: i.category || 'General',
        currentStock: i.stock,
        minStock: i.reorder || 5,
        status: i.stock === 0 ? 'Out of Stock' : 'Low Stock',
      }));
  }

  // INV-06A — `price`/`totalRetailValue` removed for the same reason as
  // getProductRegisterReport above: no authoritative selling-price source
  // exists. `totalCostValue` (stock * the item's current cost field) is
  // the only genuine valuation figure available. This is still a
  // current/last-cost basis, not FIFO/weighted-average — that valuation-
  // method decision remains explicitly deferred (INV-03), unchanged by
  // this fix.
  async getInventoryValuationReport(franchiseId?: string) {
    const items = await this.repository.getInventory(franchiseId);
    return items.map(i => ({
      sku: i.id,
      name: i.name,
      category: i.category || 'General',
      stock: i.stock,
      cost: i.cost,
      totalCostValue: i.stock * i.cost,
    }));
  }

  // INV-06A — added optional from/to bounding, consistent with the rest of
  // this report module (billing/workshop/reception reports already take
  // from/to; the Ledger previously did not).
  // INV-06B — the item-name lookup is now built from ALL items
  // (this.repository.getInventory(), no franchiseId), not just the
  // viewer's own scoped items. This fixes a latent gap: since INV-02/INV-05,
  // a franchise-scoped Ledger correctly SHOWS a DISPATCH movement destined
  // for them (via the movement's own franchiseId tag) even though that
  // movement's itemId belongs to HQ's copy of the item — but the old
  // franchise-scoped item map could never contain that HQ item id, so the
  // name always fell back to "Unknown Item". Item names aren't
  // franchise-sensitive data (the same catalog names are already visible
  // cross-franchise elsewhere); only the movement rows themselves need
  // scoping, and that scoping is untouched — this only fixes the
  // display-name enrichment.
  async getStockLedgerReport(franchiseId?: string, from?: string, to?: string) {
    const [movements, inventory] = await Promise.all([
      this.repository.getInventoryMovements(franchiseId, parseDate(from), parseDate(to)),
      this.repository.getInventory(),
    ]);
    const itemMap = new Map(inventory.map(i => [i.id, i.name]));
    return movements.map(m => ({
      date: m.performedAt.toISOString().split('T')[0] ?? '',
      time: m.performedAt.toISOString().split('T')[1]?.slice(0, 5) ?? '',
      sku: m.itemId,
      name: itemMap.get(m.itemId) || 'Unknown Item',
      type: m.type,
      qty: m.quantity,
      balance: m.balance,
      reference: m.reference,
      performedBy: m.performedBy,
    }));
  }

  // INV-06B — EPB §16.10 explicitly names "Stock Movement Report" and
  // "Stock Ledger" as two separate items in the same requirement sentence.
  // The Ledger (above) is the row-level chronological detail; this is the
  // smallest necessary distinction — the same movement rows, the same
  // scope/date-bound query, aggregated to totals per movement type instead
  // of listed individually. Not a new data source, not a new query
  // mechanism, no additional filters/charts/dashboards invented beyond
  // this one aggregation.
  async getStockMovementReport(franchiseId?: string, from?: string, to?: string) {
    const movements = await this.repository.getInventoryMovements(franchiseId, parseDate(from), parseDate(to));
    const typeMap = new Map<string, { type: string; transactionCount: number; totalQuantity: number }>();
    movements.forEach(m => {
      const entry = typeMap.get(m.type) || { type: m.type, transactionCount: 0, totalQuantity: 0 };
      entry.transactionCount += 1;
      entry.totalQuantity += m.quantity;
      typeMap.set(m.type, entry);
    });
    return Array.from(typeMap.values()).sort((a, b) => a.type.localeCompare(b.type));
  }

  // INV-06B — EPB §16.10 explicitly requires a Stock Request Report.
  // Sourced entirely from persisted InventoryRequest fields (INV-05
  // already added requestedBy/requestedById) plus a lookup of that
  // request's own DISPATCH/RECEIVE movements by reference (`REQ-<id>`) —
  // real, already-persisted data, not invented fields. InventoryRequest
  // has no dedicated approvedBy/approvedAt/dispatchedAt/receivedAt columns
  // of its own (unlike InventoryAdjustmentRequest), so "approval
  // information" here is limited to status + quantityApproved; adding
  // those columns is a schema change this report doesn't need (see Part M
  // in the completion report).
  async getStockRequestReport(franchiseId?: string, from?: string, to?: string) {
    const [requests, inventory, franchises, transferMovements] = await Promise.all([
      this.repository.getInventoryRequestsInRange(franchiseId, parseDate(from), parseDate(to)),
      this.repository.getInventory(),
      this.repository.getFranchises(),
      this.repository.getInventoryMovements(franchiseId, undefined, undefined, ['DISPATCH', 'RECEIVE']),
    ]);
    const itemMap = new Map(inventory.map(i => [i.id, i.name]));
    const franchiseMap = new Map(franchises.map(f => [f.id, f.name]));

    // Keyed by request id (parsed from the movement's own `REQ-<id>`
    // reference — the same convention dispatchRequest/receiveRequest
    // already write), one dispatch + one receive entry per request.
    const movementByRequest = new Map<string, { dispatchedAt?: Date; dispatchedBy?: string; receivedAt?: Date; receivedBy?: string }>();
    transferMovements.forEach(m => {
      if (!m.reference.startsWith('REQ-')) return;
      const requestId = m.reference.slice('REQ-'.length);
      const entry = movementByRequest.get(requestId) || {};
      if (m.type === 'DISPATCH') { entry.dispatchedAt = m.performedAt; entry.dispatchedBy = m.performedBy; }
      if (m.type === 'RECEIVE') { entry.receivedAt = m.performedAt; entry.receivedBy = m.performedBy; }
      movementByRequest.set(requestId, entry);
    });

    return requests.map(r => {
      const transfer = movementByRequest.get(r.id) || {};
      return {
        requestId: r.id,
        sku: r.itemId,
        name: itemMap.get(r.itemId) || 'Unknown Item',
        franchise: r.franchiseId ? (franchiseMap.get(r.franchiseId) || r.franchiseId) : 'Headquarters',
        quantityRequested: r.quantityRequested,
        quantityApproved: r.quantityApproved ?? '',
        status: r.status,
        requestedBy: r.requestedBy || '',
        requestDate: r.date.toISOString().split('T')[0] ?? '',
        dispatchedAt: transfer.dispatchedAt ? transfer.dispatchedAt.toISOString().split('T')[0] : '',
        dispatchedBy: transfer.dispatchedBy || '',
        receivedAt: transfer.receivedAt ? transfer.receivedAt.toISOString().split('T')[0] : '',
        receivedBy: transfer.receivedBy || '',
      };
    });
  }

  // INV-06B — EPB §16.10 explicitly requires a Dispatch Report. Identified
  // strictly from the persisted DISPATCH movement type (never inferred
  // from InventoryRequest.status alone, per the locked instruction), reusing
  // the exact same scope/date-bounded getInventoryMovements() query the
  // Ledger and Movement reports use — filtered to just DISPATCH, not a
  // second stock-ledger implementation.
  async getDispatchReport(franchiseId?: string, from?: string, to?: string) {
    const [movements, inventory, franchises, requests] = await Promise.all([
      this.repository.getInventoryMovements(franchiseId, parseDate(from), parseDate(to), ['DISPATCH']),
      this.repository.getInventory(),
      this.repository.getFranchises(),
      this.repository.getInventoryRequestsList(),
    ]);
    const itemMap = new Map(inventory.map(i => [i.id, i.name]));
    const franchiseMap = new Map(franchises.map(f => [f.id, f.name]));
    const requestMap = new Map(requests.map(r => [r.id, r]));

    return movements.map(m => {
      const requestId = m.reference.startsWith('REQ-') ? m.reference.slice('REQ-'.length) : null;
      const request = requestId ? requestMap.get(requestId) : undefined;
      return {
        reference: m.reference,
        sku: m.itemId,
        name: itemMap.get(m.itemId) || 'Unknown Item',
        quantity: Math.abs(m.quantity),
        source: 'Headquarters',
        destinationFranchise: m.franchiseId ? (franchiseMap.get(m.franchiseId) || m.franchiseId) : 'Unknown',
        relatedRequestId: requestId || '',
        relatedRequestStatus: request?.status || '',
        performedBy: m.performedBy,
        dispatchedAt: m.performedAt.toISOString().split('T')[0] ?? '',
      };
    });
  }

  async exportInventoryCsv(type: string, franchiseId?: string, from?: string, to?: string): Promise<{ csv: string; filename: string }> {
    let rows: any[] = [];
    const today = new Date().toISOString().split('T')[0];
    const columnSets: Record<string, { key: string; label: string }[]> = {
      register: [
        { key: 'sku', label: 'SKU / Code' },
        { key: 'name', label: 'Product Name' },
        { key: 'category', label: 'Category' },
        { key: 'stock', label: 'Stock' },
        { key: 'unit', label: 'Unit' },
        { key: 'cost', label: 'Cost Price (₹)' },
      ],
      summary: [
        { key: 'category', label: 'Category' },
        { key: 'totalItems', label: 'Unique Items' },
        { key: 'totalStock', label: 'Total Units' },
        { key: 'totalValue', label: 'Stock Value (₹)' },
      ],
      'low-stock': [
        { key: 'sku', label: 'SKU / Code' },
        { key: 'name', label: 'Product Name' },
        { key: 'category', label: 'Category' },
        { key: 'currentStock', label: 'Current Stock' },
        { key: 'minStock', label: 'Min Alert Stock' },
        { key: 'status', label: 'Status' },
      ],
      valuation: [
        { key: 'sku', label: 'SKU / Code' },
        { key: 'name', label: 'Product Name' },
        { key: 'stock', label: 'Stock Units' },
        { key: 'cost', label: 'Cost Price (₹)' },
        { key: 'totalCostValue', label: 'Total Cost Value (₹)' },
      ],
      ledger: [
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'sku', label: 'SKU / Code' },
        { key: 'name', label: 'Product Name' },
        { key: 'type', label: 'Transaction Type' },
        { key: 'qty', label: 'Quantity' },
        { key: 'balance', label: 'Balance Stock' },
        { key: 'reference', label: 'Reference' },
        { key: 'performedBy', label: 'Performed By' },
      ],
      movement: [
        { key: 'type', label: 'Transaction Type' },
        { key: 'transactionCount', label: 'Transaction Count' },
        { key: 'totalQuantity', label: 'Total Quantity' },
      ],
      'stock-request': [
        { key: 'requestId', label: 'Request ID' },
        { key: 'sku', label: 'SKU / Code' },
        { key: 'name', label: 'Product Name' },
        { key: 'franchise', label: 'Franchise' },
        { key: 'quantityRequested', label: 'Quantity Requested' },
        { key: 'quantityApproved', label: 'Quantity Approved' },
        { key: 'status', label: 'Status' },
        { key: 'requestedBy', label: 'Requested By' },
        { key: 'requestDate', label: 'Request Date' },
        { key: 'dispatchedAt', label: 'Dispatched Date' },
        { key: 'dispatchedBy', label: 'Dispatched By' },
        { key: 'receivedAt', label: 'Received Date' },
        { key: 'receivedBy', label: 'Received By' },
      ],
      dispatch: [
        { key: 'reference', label: 'Reference' },
        { key: 'sku', label: 'SKU / Code' },
        { key: 'name', label: 'Product Name' },
        { key: 'quantity', label: 'Quantity' },
        { key: 'source', label: 'Source' },
        { key: 'destinationFranchise', label: 'Destination Franchise' },
        { key: 'relatedRequestId', label: 'Request ID' },
        { key: 'relatedRequestStatus', label: 'Request Status' },
        { key: 'performedBy', label: 'Performed By' },
        { key: 'dispatchedAt', label: 'Dispatched Date' },
      ],
    };

    switch (type) {
      case 'register':       rows = await this.getProductRegisterReport(franchiseId); break;
      case 'summary':        rows = await this.getStockSummaryReport(franchiseId); break;
      case 'low-stock':      rows = await this.getLowStockReport(franchiseId); break;
      case 'valuation':      rows = await this.getInventoryValuationReport(franchiseId); break;
      case 'ledger':         rows = await this.getStockLedgerReport(franchiseId, from, to); break;
      case 'movement':       rows = await this.getStockMovementReport(franchiseId, from, to); break;
      case 'stock-request':  rows = await this.getStockRequestReport(franchiseId, from, to); break;
      case 'dispatch':       rows = await this.getDispatchReport(franchiseId, from, to); break;
      default: throw new Error(`Unknown Inventory report type: ${type}`);
    }

    const columns = columnSets[type] || columnSets['register']!;
    const csv = toCsv(rows, columns);
    return { csv, filename: `inventory_${type}_${today}.csv` };
  }
}
