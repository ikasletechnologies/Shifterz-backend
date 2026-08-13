import { db } from '../../../lib/db.js';
import type { CreateOutpassDTO, UpdateOutpassDTO } from '../validation/outpass.validation.js';

export class OutpassRepository {
  async findAll() {
    return db.outPass.findMany({ orderBy: { outTime: "desc" } });
  }

  async create(id: string, data: any) {
    let outTimeVal: Date = new Date();
    if (data.outTime) {
      const parsed = new Date(data.outTime);
      if (!isNaN(parsed.getTime())) {
        outTimeVal = parsed;
      }
    }

    return db.outPass.create({
      data: {
        id,
        vehicle: data.vehicle,
        model: data.model || "",
        customer: data.customer || "",
        phone: data.phone || "",
        service: data.service || "",
        outTime: outTimeVal,
        securityName: data.securityName || "",
        technicianName: data.technicianName || "",
        remarks: data.remarks || "",
        issued: data.issued !== undefined ? data.issued : false,
        status: data.status || "Pending",
        approvedBy: data.approvedBy || null,
        approvedAt: data.approvedAt || null,
        carInId: data.carInId || "",
        jobCardId: data.jobCardId || null,
        invoiceId: data.invoiceId || null,
        paymentStatus: data.paymentStatus || null,
        createdBy: data.createdBy || null,
        franchiseId: data.franchiseId || null,
      },
    });
  }

  async update(id: string, data: any) {
    const updateData: any = {
      vehicle: data.vehicle,
      model: data.model,
      customer: data.customer,
      phone: data.phone,
      service: data.service,
      securityName: data.securityName,
      technicianName: data.technicianName,
      remarks: data.remarks,
      status: data.status,
    };

    if (data.outTime) {
      const parsed = new Date(data.outTime);
      if (!isNaN(parsed.getTime())) {
        updateData.outTime = parsed;
      }
    }

    return db.outPass.update({
      where: { id },
      data: updateData,
    });
  }
}
