import { db } from '../../../lib/db.js';
import type { 
  CreateCustomerDTO, 
  UpdateCustomerDTO, 
  CreateVehicleDTO, 
  UpdateVehicleDTO,
  CreateWarrantyDTO,
  CreateReminderDTO
} from '../validation/customer.validation.js';

export class CustomerRepository {
  async findAll(tenantFilter: any) {
    return db.customer.findMany({
      where: {
        ...tenantFilter,
        isDeleted: false,
      },
      include: {
        vehicles: {
          where: { isDeleted: false }
        }
      },
      orderBy: { totalSpend: "desc" },
    });
  }

  async findById(id: string) {
    return db.customer.findFirst({
      where: {
        id,
        isDeleted: false
      },
      include: {
        vehicles: {
          where: { isDeleted: false }
        },
        warranties: {
          where: { isDeleted: false }
        },
        reminders: {
          where: { isDeleted: false }
        }
      }
    });
  }

  async create(id: string, data: CreateCustomerDTO, franchiseId: string | null) {
    return db.customer.create({
      data: {
        id,
        name: data.name,
        phone: data.phone || "",
        email: data.email || "",
        vehicle: data.vehicle || "",
        model: data.model || "",
        alternateNumber: data.alternateNumber || null,
        city: data.city || null,
        vehicleMake: data.vehicleMake || null,
        vehicleModel: data.vehicleModel || null,
        rewardPoints: data.rewardPoints || 0,
        dob: data.dob,
        anniversary: data.anniversary,
        gstNumber: data.gstNumber || null,
        address: data.address || null,
        state: data.state || null,
        pinCode: data.pinCode || null,
        status: data.status || "Active",
        visits: 0,
        totalSpend: 0,
        lastVisit: new Date(),
        franchiseId,
      },
      include: {
        vehicles: true
      }
    });
  }

  async update(id: string, data: UpdateCustomerDTO) {
    return db.customer.update({
      where: { id },
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email,
        vehicle: data.vehicle,
        model: data.model,
        alternateNumber: data.alternateNumber,
        city: data.city,
        vehicleMake: data.vehicleMake,
        vehicleModel: data.vehicleModel,
        rewardPoints: data.rewardPoints,
        dob: data.dob,
        anniversary: data.anniversary,
        gstNumber: data.gstNumber,
        address: data.address,
        state: data.state,
        pinCode: data.pinCode,
        status: data.status,
      }
    });
  }

  async softDelete(id: string) {
    return db.customer.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }

  // Vehicle Management
  async getVehicles(customerId: string) {
    return db.customerVehicle.findMany({
      where: { customerId, isDeleted: false }
    });
  }

  async findVehicleById(id: string) {
    return db.customerVehicle.findFirst({
      where: { id, isDeleted: false }
    });
  }

  async findVehicleByNo(vehicleNo: string) {
    return db.customerVehicle.findFirst({
      where: { vehicleNo, isDeleted: false }
    });
  }

  async addVehicle(customerId: string, data: CreateVehicleDTO) {
    return db.customerVehicle.create({
      data: {
        customerId,
        vehicleNo: data.vehicleNo.toUpperCase(),
        make: data.make,
        model: data.model,
        variant: data.variant || null,
        year: data.year || null,
        fuelType: data.fuelType || null,
        color: data.color || null,
        chassisNo: data.chassisNo || null,
        engineNo: data.engineNo || null,
        odometer: data.odometer || null,
        vin: data.vin || null
      }
    });
  }

  async updateVehicle(id: string, data: UpdateVehicleDTO) {
    return db.customerVehicle.update({
      where: { id },
      data: {
        vehicleNo: data.vehicleNo ? data.vehicleNo.toUpperCase() : undefined,
        make: data.make,
        model: data.model,
        variant: data.variant,
        year: data.year,
        fuelType: data.fuelType,
        color: data.color,
        chassisNo: data.chassisNo,
        engineNo: data.engineNo,
        odometer: data.odometer,
        vin: data.vin
      }
    });
  }

  async deleteVehicle(id: string) {
    return db.customerVehicle.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() }
    });
  }

  // Warranty Management
  async getWarranties(customerId: string) {
    return db.warranty.findMany({
      where: { customerId, isDeleted: false }
    });
  }

  async addWarranty(customerId: string, data: CreateWarrantyDTO) {
    const start = data.startDate || new Date();
    const expiry = new Date(start.getTime() + data.durationDays * 24 * 60 * 60 * 1000);
    return db.warranty.create({
      data: {
        customerId,
        vehicleNo: data.vehicleNo.toUpperCase(),
        jobId: data.jobId || null,
        invoiceId: data.invoiceId || null,
        itemName: data.itemName,
        durationDays: data.durationDays,
        startDate: start,
        expiryDate: expiry,
        status: "Active",
        notes: data.notes || null
      }
    });
  }

  // Service Reminders
  async getReminders(customerId: string) {
    return db.serviceReminder.findMany({
      where: { customerId, isDeleted: false }
    });
  }

  async addReminder(customerId: string, data: CreateReminderDTO) {
    return db.serviceReminder.create({
      data: {
        customerId,
        vehicleNo: data.vehicleNo.toUpperCase(),
        reminderType: data.reminderType,
        scheduledDate: data.scheduledDate,
        status: "Pending",
        notes: data.notes || null
      }
    });
  }

  // Referrals
  async getReferrals(customerId: string) {
    return db.referral.findMany({
      where: { referringCustomerId: customerId, isDeleted: false }
    });
  }

  // Complaints
  async getComplaints(customerId: string) {
    return db.customerComplaint.findMany({
      where: { customerId }
    });
  }

  async addComplaint(customerId: string, data: any) {
    return db.customerComplaint.create({
      data: {
        customerId,
        title: data.title,
        description: data.description,
        severity: data.severity || "Medium"
      }
    });
  }

  // Estimates
  async getEstimates(customerId: string) {
    return db.estimate.findMany({
      where: { customerId, isDeleted: false }
    });
  }

  async addEstimate(customerId: string, data: any, franchiseId: string | null) {
    return db.estimate.create({
      data: {
        id: data.id,
        customerId,
        customerName: data.customerName,
        phone: data.phone,
        vehicle: data.vehicle,
        model: data.model,
        amount: data.amount,
        status: data.status || "Pending",
        items: data.items || null,
        estimatedDelivery: data.estimatedDelivery || null,
        warranty: data.warranty || null,
        franchiseId
      }
    });
  }

  async search(query: string, tenantFilter: any) {
    const uppercaseQuery = query.toUpperCase();

    // 1. Find matching carIns to get candidate phones by jobCardId
    const matchingCarIns = await db.carIn.findMany({
      where: {
        OR: [
          { id: { contains: query, mode: 'insensitive' } },
          { jobCardId: { contains: query, mode: 'insensitive' } }
        ],
        isDeleted: false
      },
      select: { phone: true }
    });
    const jobPhones = matchingCarIns.map(j => j.phone).filter(Boolean);

    // 2. Find matching invoices to get candidate phones
    const matchingInvoices = await db.invoice.findMany({
      where: {
        id: { contains: query, mode: 'insensitive' },
        isDeleted: false
      },
      select: { phone: true }
    });
    const invoicePhones = matchingInvoices.map(i => i.phone).filter(Boolean);

    // Combine all phone candidates
    const candidatePhones = Array.from(new Set([...jobPhones, ...invoicePhones]));

    // 3. Query customers matching any of the fields or candidate phones
    return db.customer.findMany({
      where: {
        ...tenantFilter,
        isDeleted: false,
        OR: [
          { id: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query, mode: 'insensitive' } },
          { phone: { in: candidatePhones } },
          {
            vehicles: {
              some: {
                vehicleNo: { contains: uppercaseQuery },
                isDeleted: false
              }
            }
          }
        ]
      },
      include: {
        vehicles: {
          where: { isDeleted: false }
        }
      }
    });
  }
}
