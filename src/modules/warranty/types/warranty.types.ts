// WTY-01C (D-W2, locked) — invoiceId is now required: manual warranty
// creation must reference a qualifying invoice. customerId/vehicleNo are
// now derived server-side from that invoice (see WarrantyService.
// createWarranty), not trusted from the client — kept optional here only
// so a caller may still pass them without a type error; they are ignored
// in favor of the invoice-derived values.
export interface CreateWarrantyDTO {
  customerId?: string;
  vehicleNo?: string;
  jobId?: string;
  invoiceId: string;
  itemName: string;
  durationDays: number;
  startDate?: string | Date;
  expiryDate?: string | Date;
  status?: string;
  notes?: string;
}

export interface UpdateWarrantyDTO {
  itemName?: string;
  durationDays?: number;
  expiryDate?: string | Date;
  status?: string;
  notes?: string;
}

export interface WarrantyClaimDTO {
  description: string;
  resolution?: string;
  claimedBy?: string;
  status?: string;
}

export interface WarrantyClaimRecord {
  id: string;
  claimDate: string;
  description: string;
  resolution?: string;
  claimedBy?: string;
}
