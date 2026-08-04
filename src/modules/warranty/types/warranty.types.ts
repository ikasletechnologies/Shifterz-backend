export interface CreateWarrantyDTO {
  customerId: string;
  vehicleNo: string;
  jobId?: string;
  invoiceId?: string;
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
