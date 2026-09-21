import { db } from '../../../lib/db.js';
import type { Prisma } from '@prisma/client';

// GST-05 — writes to the single normalized GST reporting ledger. This is
// deliberately a thin insert, not a calculator: everything it writes was
// already computed by GstCalculationService and resolved by
// GstInvoiceResolverService — this service's only job is to record it,
// never to recompute or reinterpret it.
export type GstDocumentType = 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'REFUND' | 'PURCHASE';

export interface RecordGstTransactionInput {
  franchiseId?: string | null;
  documentType: GstDocumentType;
  documentId: string;
  documentNumber: string;
  documentDate: Date;
  sellerGstin?: string | null;
  buyerGstin?: string | null;
  buyerName?: string | null;
  sellerState?: string | null;
  placeOfSupply?: string | null;
  supplyType?: string | null;
  // GST-07 — one ledger row represents one (rate, HSN) group, not the whole
  // document; a multi-rate document is recorded as multiple rows sharing the
  // same documentId, each with its own hsnSac/gstRate/figures.
  hsnSac?: string | null;
  gstRate?: number | null;
  taxableValue: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  cess?: number;
  // Purchase GST/ITC foundation — only meaningful for documentType='PURCHASE'
  // rows (see the schema's own comment on GstTransaction.itcEligible); every
  // other document type omits this and keeps writing null, unchanged.
  itcEligible?: boolean | null;
  status?: string;
}

function toReturnPeriod(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export class GstTransactionLedgerService {
  // GST-05A — accepts an optional transaction client so the caller can make
  // this write part of the same atomic transaction as the invoice write it
  // belongs to; falls back to the plain client for any caller that doesn't
  // need that (there are none left after GST-12, but the fallback keeps this
  // service usable standalone, e.g. from a script or test).
  async record(input: RecordGstTransactionInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? db;
    return client.gstTransaction.create({
      data: {
        franchiseId: input.franchiseId ?? null,
        documentType: input.documentType,
        documentId: input.documentId,
        documentNumber: input.documentNumber,
        documentDate: input.documentDate,
        returnPeriod: toReturnPeriod(input.documentDate),
        sellerGstin: input.sellerGstin ?? null,
        buyerGstin: input.buyerGstin ?? null,
        buyerName: input.buyerName ?? null,
        sellerState: input.sellerState ?? null,
        placeOfSupply: input.placeOfSupply ?? null,
        supplyType: input.supplyType ?? null,
        hsnSac: input.hsnSac ?? null,
        gstRate: input.gstRate ?? null,
        taxableValue: input.taxableValue,
        cgst: input.cgst ?? 0,
        sgst: input.sgst ?? 0,
        igst: input.igst ?? 0,
        cess: input.cess ?? 0,
        itcEligible: input.itcEligible ?? null,
        status: input.status ?? 'Active',
      },
    });
  }
}
