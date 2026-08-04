import { db } from "../../../lib/db.js";
import type { CreateWarrantyDTO, UpdateWarrantyDTO, WarrantyClaimRecord } from "../types/warranty.types.js";

export class WarrantyRepository {
  async findAll(filter: { customerId?: string; vehicleNo?: string; status?: string; search?: string }) {
    const where: any = {
      isDeleted: false,
    };

    if (filter.customerId) where.customerId = filter.customerId;
    if (filter.vehicleNo) where.vehicleNo = filter.vehicleNo;
    if (filter.status) where.status = filter.status;

    if (filter.search) {
      where.OR = [
        { warrantyNo: { contains: filter.search, mode: "insensitive" } },
        { vehicleNo: { contains: filter.search, mode: "insensitive" } },
        { itemName: { contains: filter.search, mode: "insensitive" } },
        { customer: { name: { contains: filter.search, mode: "insensitive" } } },
      ];
    }

    return db.warranty.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string) {
    return db.warranty.findFirst({
      where: { id, isDeleted: false },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });
  }

  async findByInvoiceId(invoiceId: string) {
    return db.warranty.findMany({
      where: { invoiceId, isDeleted: false },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });
  }

  async allocateWarrantyNo(): Promise<string> {
    const date = new Date();
    const year = date.getFullYear();
    const prefix = `WR-${year}-`;

    const count = await db.warranty.count({
      where: {
        warrantyNo: {
          startsWith: prefix,
        } as any,
      },
    });

    const seq = (count + 1).toString().padStart(4, "0");
    return `${prefix}${seq}`;
  }

  async create(data: CreateWarrantyDTO & { warrantyNo: string }) {
    const start = data.startDate ? new Date(data.startDate) : new Date();
    const expiry = data.expiryDate
      ? new Date(data.expiryDate)
      : new Date(start.getTime() + data.durationDays * 24 * 60 * 60 * 1000);

    return db.warranty.create({
      data: {
        warrantyNo: data.warrantyNo,
        customerId: data.customerId,
        vehicleNo: data.vehicleNo,
        jobId: data.jobId || null,
        invoiceId: data.invoiceId || null,
        itemName: data.itemName,
        durationDays: data.durationDays,
        startDate: start,
        expiryDate: expiry,
        status: data.status || "Active",
        notes: data.notes || null,
        claims: JSON.stringify([]),
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });
  }

  async update(id: string, data: UpdateWarrantyDTO) {
    const updateData: any = {};
    if (data.itemName !== undefined) updateData.itemName = data.itemName;
    if (data.durationDays !== undefined) updateData.durationDays = data.durationDays;
    if (data.expiryDate !== undefined) updateData.expiryDate = new Date(data.expiryDate);
    if (data.status !== undefined) updateData.status = data.status;
    if (data.notes !== undefined) updateData.notes = data.notes;

    return db.warranty.update({
      where: { id },
      data: updateData,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });
  }

  async addClaim(id: string, existingClaims: WarrantyClaimRecord[], newClaim: WarrantyClaimRecord, newStatus?: string) {
    const claimsArray = [...existingClaims, newClaim];
    const updateData: any = {
      claims: JSON.stringify(claimsArray),
    };
    if (newStatus) {
      updateData.status = newStatus;
    }
    return db.warranty.update({
      where: { id },
      data: updateData,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });
  }

  async softDelete(id: string) {
    return db.warranty.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
  }
}
