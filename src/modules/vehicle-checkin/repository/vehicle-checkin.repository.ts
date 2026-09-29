import { db } from '../../../lib/db.js';
import { logger } from '../../../shared/logger/logger.js';
import type { CreateCheckinDTO, UpdateCheckinDTO } from '../validation/vehicle-checkin.validation.js';

function safeIsoDate(input?: string | Date | null): string {
  if (!input) return new Date().toISOString();
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

export class VehicleCheckinRepository {
  async findAll(franchiseId?: string | null) {
    return db.carIn.findMany({
      where: franchiseId
        ? { isDeleted: false, status: { notIn: ["Out", "Delivered", "Issued"] }, franchiseId }
        : { isDeleted: false, status: { notIn: ["Out", "Delivered", "Issued"] } },
      include: {
        franchise: {
          select: { id: true, name: true, businessName: true },
        },
      },
      orderBy: { inTime: "desc" },
    });
  }

  async findById(id: string) {
    return db.carIn.findFirst({ where: { id, isDeleted: false } });
  }

  async findActiveCheckinByVehicle(vehicleNo: string) {
    const normalizedInput = vehicleNo.replace(/[^A-Z0-9]/gi, "").toUpperCase();

    // 1. Check for any active, non-delivered CarIn records
    const checkins = await db.carIn.findMany({
      where: {
        isDeleted: false,
        status: { notIn: ["Delivered", "Out"] },
        outTime: null,
      },
      orderBy: { inTime: "desc" },
    });

    const activeCar = checkins.find((car) => {
      const norm = (car.vehicle || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
      return norm === normalizedInput;
    });

    if (activeCar) return activeCar;

    // 2. Also check if there is an active Job that has not reached final delivery/checkout
    const activeJobs = await db.job.findMany({
      where: {
        status: { notIn: ["Delivered", "Out"] },
      },
      orderBy: { startDate: "desc" },
    });

    const activeJob = activeJobs.find((j) => {
      const norm = (j.vehicle || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
      return norm === normalizedInput;
    });

    if (activeJob) {
      if (activeJob.carInId) {
        const linkedCar = await db.carIn.findFirst({
          where: { id: activeJob.carInId, isDeleted: false },
        });
        if (linkedCar) return linkedCar;
      }
      return {
        id: activeJob.carInId || activeJob.id,
        vehicle: activeJob.vehicle,
        jobCardId: activeJob.id,
        status: activeJob.status,
        inTime: activeJob.startDate,
      };
    }

    return null;
  }

  async findRecentCheckinByVehicle(vehicleNo: string, hours = 24) {
    return this.findActiveCheckinByVehicle(vehicleNo);
  }

  async create(id: string, data: CreateCheckinDTO, jobCardId: string, franchiseId: string | null) {
    return db.carIn.create({
      data: {
        id,
        vehicle: data.vehicle,
        model: data.model || "",
        customer: data.customer || "",
        phone: data.phone || "",
        service: data.service || "",
        inTime: safeIsoDate(data.inTime),
        outTime: null,
        status: "In Workshop",
        odometer: String(data.odometer || "0"),
        notes: data.notes || "",
        jobCardId,
        franchiseId,
        receivedById: data.receivedById || null,
        receivedByName: data.receivedByName || null,
        fuelLevel: data.fuelLevel || null,
        keyCount: data.keyCount || 1,
        expectedDelivery: data.expectedDelivery || null,
        scratches: data.scratches || null,
        dents: data.dents || null,
        brokenParts: data.brokenParts || null,
        glassDamage: data.glassDamage || null,
        wheelDamage: data.wheelDamage || null,
        interiorCondition: data.interiorCondition || null,
        accessoriesReceived: data.accessoriesReceived || null,
        remarks: data.remarks || null,
        photoFront: data.photoFront || null,
        photoRear: data.photoRear || null,
        photoLeft: data.photoLeft || null,
        photoRight: data.photoRight || null,
        photoDashboard: data.photoDashboard || null,
        photoOdometer: data.photoOdometer || null,
        photoDamages: data.photoDamages || [],
        hasSpareWheel: data.hasSpareWheel || false,
        hasJack: data.hasJack || false,
        hasToolkit: data.hasToolkit || false,
        hasFloorMats: data.hasFloorMats || false,
        hasFastag: data.hasFastag || false,
        hasDashCam: data.hasDashCam || false,
        hasUsbCharger: data.hasUsbCharger || false,
        otherAccessories: data.otherAccessories || null
      },
    });
  }

  async update(id: string, data: UpdateCheckinDTO) {
    return db.carIn.update({
      where: { id },
      data: {
        vehicle: data.vehicle,
        model: data.model,
        customer: data.customer,
        phone: data.phone,
        service: data.service,
        odometer: data.odometer ? String(data.odometer) : undefined,
        notes: data.notes,
        receivedById: data.receivedById,
        receivedByName: data.receivedByName,
        fuelLevel: data.fuelLevel,
        keyCount: data.keyCount,
        expectedDelivery: data.expectedDelivery,
        scratches: data.scratches,
        dents: data.dents,
        brokenParts: data.brokenParts,
        glassDamage: data.glassDamage,
        wheelDamage: data.wheelDamage,
        interiorCondition: data.interiorCondition,
        accessoriesReceived: data.accessoriesReceived,
        remarks: data.remarks,
        photoFront: data.photoFront,
        photoRear: data.photoRear,
        photoLeft: data.photoLeft,
        photoRight: data.photoRight,
        photoDashboard: data.photoDashboard,
        photoOdometer: data.photoOdometer,
        photoDamages: data.photoDamages,
        hasSpareWheel: data.hasSpareWheel,
        hasJack: data.hasJack,
        hasToolkit: data.hasToolkit,
        hasFloorMats: data.hasFloorMats,
        hasFastag: data.hasFastag,
        hasDashCam: data.hasDashCam,
        hasUsbCharger: data.hasUsbCharger,
        otherAccessories: data.otherAccessories
      },
    });
  }

  async checkout(id: string, outTime: string, checkoutData?: {
    deliveredById?: string | null;
    deliveredByName?: string | null;
    customerAcknowledgement?: string | null;
  }) {
    return db.carIn.update({
      where: { id },
      data: {
        outTime,
        status: "Delivered",
        checkOutAt: new Date(outTime),
        checkOutById: checkoutData?.deliveredById || null,
        checkOutByName: checkoutData?.deliveredByName || null,
        customerAcknowledgement: checkoutData?.customerAcknowledgement || null,
      },
    });
  }

  async delete(id: string) {
    try {
      return await db.carIn.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date() },
      });
    } catch (err: any) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  }

  // Related auto-creation methods
  async createJobCard(data: any) {
    const jobData = { ...data };
    if (!jobData.startDate || (typeof jobData.startDate === 'string' && !jobData.startDate.trim())) {
      jobData.startDate = safeIsoDate(null);
    } else {
      jobData.startDate = safeIsoDate(jobData.startDate);
    }
    if (!jobData.estCompletion || (typeof jobData.estCompletion === 'string' && !jobData.estCompletion.trim())) {
      jobData.estCompletion = safeIsoDate(jobData.startDate);
    } else {
      jobData.estCompletion = safeIsoDate(jobData.estCompletion);
    }
    return db.job.create({ data: jobData });
  }

  async updateJobCard(id: string, data: any) {
    try {
      const updateData: any = { ...data };
      if (updateData.startDate) updateData.startDate = safeIsoDate(updateData.startDate);
      if (updateData.estCompletion) updateData.estCompletion = safeIsoDate(updateData.estCompletion);
      return await db.job.update({ where: { id }, data: updateData });
    } catch (err: any) {
      if (err.code === 'P2025') {
        logger.warn(`Job card with ID ${id} not found during updateJobCard operation.`);
        return null;
      }
      throw err;
    }
  }

  async deleteJobCard(id: string) {
    try {
      let targetJobId = id;
      const existing = await db.job.findFirst({ where: { id } });
      if (!existing) {
        const carIn = await db.carIn.findFirst({ where: { id } });
        if (carIn && carIn.jobCardId) {
          targetJobId = carIn.jobCardId;
        }
      }

      return await db.job.update({
        where: { id: targetJobId },
        data: { isDeleted: true, deletedAt: new Date() },
      });
    } catch (err: any) {
      if (err.code === 'P2025') {
        logger.warn(`Job card with ID ${id} not found during deleteJobCard operation.`);
        return null;
      }
      throw err;
    }
  }

  async findCustomerByPhone(phone: string) {
    return db.customer.findFirst({ where: { phone } });
  }

  async updateCustomerVisits(id: string, visits: number, lastVisit: string) {
    return db.customer.update({ where: { id }, data: { visits, lastVisit } });
  }

  async createCustomer(data: any) {
    return db.customer.create({ data });
  }

  async findOutpassByCarInId(carInId: string) {
    return db.outPass.findFirst({ where: { carInId } });
  }

  async createOutpass(data: any) {
    return db.outPass.create({ data });
  }

  // EPB 21 — "Delivery history shall remain permanent." Previously a real
  // deleteMany; now matches the soft-delete pattern already used for
  // CarIn/Job in this same file.
  async deleteOutpassesByCarInId(carInId: string) {
    return db.outPass.updateMany({
      where: { carInId, isDeleted: false },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }
}
