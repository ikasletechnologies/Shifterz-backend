import { BillingRepository } from '../repository/billing.repository.js';
import type { CreateInvoiceDTO, UpdateInvoiceDTO } from '../validation/billing.validation.js';
import { db } from '../../../lib/db.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';
import { logAudit } from '../../../shared/services/audit.service.js';
import { notifyCustomer, notifyManagers } from '../../../shared/services/notification.service.js';
import { WarrantyService } from '../../warranty/service/warranty.service.js';

// 13.14: HQ is notified when an overall discount looks abnormal.
const ABNORMAL_DISCOUNT_THRESHOLD_PERCENT = 20;

export interface BillingActor {
  id?: string;
  name?: string;
  role?: string;
  franchiseId?: string | null;
}

export class BillingService {
  constructor(private readonly repository: BillingRepository = new BillingRepository()) {}

  async getAllInvoices(franchiseId?: string | null) {
    const list = await this.repository.findAll(franchiseId);
    const payments = await this.repository.findAllPayments();

    return list.map(inv => {
      const invPayments = payments.filter(p => p.invoiceId === inv.id);
      const paidAmount = invPayments.reduce((sum, p) => sum + p.amount, 0);
      return { ...inv, paidAmount };
    });
  }

  async createInvoice(data: CreateInvoiceDTO, actor?: BillingActor) {
    // 12.11.4: No vehicle shall proceed to billing until QC is marked as Passed.
    // Only enforced for actual Invoices linked to a job (Quotations/Estimates
    // are pre-service documents, not billing, and non-job invoices are unaffected).
    if (data.jobId && data.type === 'Invoice') {
      const job = await db.job.findFirst({ where: { id: data.jobId, isDeleted: false } });
      if (!job) throw new ValidationError(`Job ${data.jobId} not found`);
      if (!job.passedAt) {
        throw new ValidationError(
          `Job ${data.jobId} has not passed Quality Control yet (current status: "${job.status}"). Billing cannot proceed until QC is passed.`
        );
      }
    }

    const date = new Date(data.date || Date.now());
    const year = date.getFullYear();
    const month = date.getMonth();
    const startYear = month >= 3 ? year : year - 1;
    const endYear = startYear + 1;
    const fy = `${startYear.toString().slice(2)}-${endYear.toString().slice(2)}`;

    const docTypePrefix = {
      Invoice: `STZ-${fy}-`,
      Quotation: `STZ-QT-${fy}-`,
      Estimate: `STZ-EST-${fy}-`,
    }[data.type] || `STZ-DOC-${fy}-`;

    const sequenceNumber = await this.repository.allocateSequence(docTypePrefix);
    const invId = `${docTypePrefix}${sequenceNumber}`;

    const invoice = await this.repository.create(invId, docTypePrefix, sequenceNumber, data);

    await logAudit({
      module: "billing",
      recordId: invoice.id,
      action: "create",
      userId: actor?.id || "system",
      branchId: invoice.franchiseId,
      newValue: invoice,
    });

    if (data.type === "Invoice" && invoice.phone) {
      await notifyCustomer(invoice.phone, null, "Invoice Generated", `Your invoice ${invoice.id} for ${invoice.vehicle} has been generated.`);
    }

    const subtotal = Number(data.amount || 0);
    const discountPercent = subtotal > 0 ? (Number(data.discount || 0) / subtotal) * 100 : 0;
    if (discountPercent > ABNORMAL_DISCOUNT_THRESHOLD_PERCENT) {
      await notifyManagers(
        invoice.franchiseId,
        "Abnormal Discount",
        `Invoice ${invoice.id} was created with a ${discountPercent.toFixed(1)}% discount.`
      );
    }

    if (data.type === "Invoice") {
      try {
        const warrantyService = new WarrantyService();
        await warrantyService.generateFromInvoice(invoice.id);
      } catch (err) {
        // ignore if invoice has no warranty items
      }
    }

    return invoice;
  }

  async updateInvoice(id: string, data: UpdateInvoiceDTO, actor?: BillingActor) {
    const existing = await this.repository.findById(id);

    const auditData: any = {};
    if (data.modifiedBy) auditData.modifiedBy = data.modifiedBy;
    if (data.status === "Cancelled" && existing?.status !== "Cancelled") auditData.cancelledBy = data.modifiedBy || data.cancelledBy;
    if (data.status === "Approved" && existing?.status !== "Approved") auditData.approvedBy = data.modifiedBy || data.approvedBy;

    const updateData = {
      ...auditData,
      status: data.status !== undefined ? data.status : undefined,
      notes: data.notes !== undefined ? data.notes : undefined,
      date: data.date ? new Date(data.date) : undefined,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      amount: data.amount !== undefined ? Number(data.amount) : undefined,
      gst: data.gst !== undefined ? Number(data.gst) : undefined,
      discount: data.discount !== undefined ? Number(data.discount) : undefined,
      type: data.type !== undefined ? data.type : undefined,
      client: data.client !== undefined ? data.client : undefined,
      phone: data.phone !== undefined ? data.phone : undefined,
      vehicle: data.vehicle !== undefined ? data.vehicle : undefined,
      service: data.service !== undefined ? data.service : undefined,
      items: data.items !== undefined ? data.items : undefined,
      bankDetails: data.bankDetails !== undefined ? data.bankDetails : undefined,
      paymentTerms: data.paymentTerms !== undefined ? data.paymentTerms : undefined,
      deliveryTerms: data.deliveryTerms !== undefined ? data.deliveryTerms : undefined,
      authorizedSignatory: data.authorizedSignatory !== undefined ? data.authorizedSignatory : undefined,
      warranty: data.warranty !== undefined ? data.warranty : undefined,
      discountReason: data.discountReason !== undefined ? data.discountReason : undefined,
    };

    const updated = await this.repository.update(id, updateData);

    await logAudit({
      module: "billing",
      recordId: id,
      action: "update",
      userId: actor?.id || "system",
      branchId: updated.franchiseId,
      oldValue: existing,
      newValue: updated,
    });

    if (updated.type === "Invoice" && (updated.status === "Completed" || updated.status === "Paid")) {
      try {
        const warrantyService = new WarrantyService();
        await warrantyService.generateFromInvoice(updated.id);
      } catch (err) {
        // ignore if invoice has no warranty items
      }
    }

    return updated;
  }

  async convertInvoice(oldId: string, newType: string, updates: { amount?: number, gst?: number, discount?: number }, actor?: BillingActor) {
    const existing = await this.repository.findById(oldId);
    if (!existing) throw new ValidationError("Invoice not found");

    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth();
    const startYear = month >= 3 ? year : year - 1;
    const endYear = startYear + 1;
    const fy = `${startYear.toString().slice(2)}-${endYear.toString().slice(2)}`;

    const docTypePrefix = {
      Invoice: `STZ-${fy}-`,
      Quotation: `STZ-QT-${fy}-`,
      Estimate: `STZ-EST-${fy}-`,
    }[newType] || `STZ-DOC-${fy}-`;

    const sequenceNumber = await this.repository.allocateSequence(docTypePrefix);
    const newId = `${docTypePrefix}${sequenceNumber}`;

    // Ensure we release the old sequence number if applicable
    if (existing.numberPrefix && existing.sequenceNumber != null) {
      await this.repository.releaseSequenceIfLast(existing.numberPrefix, existing.sequenceNumber);
    }

    const updateData: any = {
      id: newId,
      type: newType,
      numberPrefix: docTypePrefix,
      sequenceNumber: sequenceNumber,
      date: date,
      status: "Pending", // Or whatever the initial status should be
    };
    if (updates.amount !== undefined) updateData.amount = Number(updates.amount);
    if (updates.gst !== undefined) updateData.gst = Number(updates.gst);
    if (updates.discount !== undefined) updateData.discount = Number(updates.discount);

    // Swap the ID in a transaction to ensure related payments also update
    await db.$transaction([
      db.invoice.update({
        where: { id: oldId },
        data: updateData,
      }),
      db.payment.updateMany({
        where: { invoiceId: oldId },
        data: { invoiceId: newId },
      })
    ]);

    const converted = await this.repository.findById(newId);

    await logAudit({
      module: "billing",
      recordId: newId,
      action: "convert",
      userId: actor?.id || "system",
      branchId: converted?.franchiseId,
      oldValue: existing,
      newValue: converted,
    });

    if (newType === "Invoice" && converted?.phone) {
      await notifyCustomer(converted.phone, null, "Invoice Generated", `Your invoice ${newId} for ${converted.vehicle} has been generated.`);
    }

    return converted;
  }

  async cancelInvoice(id: string, reason: string, actor?: BillingActor) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new ValidationError("Invoice not found");

    const cancelled = await this.repository.cancel(id, reason, actor?.id);

    await logAudit({
      module: "billing",
      recordId: id,
      action: "cancel",
      userId: actor?.id || "system",
      branchId: cancelled.franchiseId,
      oldValue: existing,
      newValue: cancelled,
    });

    return cancelled;
  }

  async shareInvoice(id: string, channel: "whatsapp" | "email", actor?: BillingActor) {
    const invoice = await this.repository.findById(id);
    if (!invoice) throw new ValidationError("Invoice not found");

    await logAudit({
      module: "billing",
      recordId: id,
      action: "share",
      userId: actor?.id || "system",
      branchId: invoice.franchiseId,
      newValue: { channel },
    });

    const message = `Your invoice ${invoice.id} for ${invoice.vehicle} — total ₹${(invoice.amount + invoice.gst - invoice.discount).toFixed(2)}.`;
    if (channel === "whatsapp") {
      await notifyCustomer(invoice.phone, null, "Invoice Shared", message);
    } else {
      await notifyCustomer(null, invoice.client, "Invoice Shared", message);
    }

    return { success: true };
  }

  async deleteInvoice(id: string, actor?: BillingActor) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new ValidationError("Invoice not found");

    // 13.12: release the sequence number only if this was the most recently issued
    // invoice for its prefix — otherwise the gap stays open, matching the spec example.
    if (existing.numberPrefix && existing.sequenceNumber != null) {
      await this.repository.releaseSequenceIfLast(existing.numberPrefix, existing.sequenceNumber);
    }

    // Delete related payments first (FK)
    await this.repository.deletePaymentsByInvoiceId(id);

    // Then hard-delete the invoice — see hardDeleteInvoice for why this isn't soft delete
    const deleted = await this.repository.hardDeleteInvoice(id);

    await logAudit({
      module: "billing",
      recordId: id,
      action: "delete",
      userId: actor?.id || "system",
      branchId: existing.franchiseId,
      oldValue: existing,
    });

    return deleted;
  }
}
