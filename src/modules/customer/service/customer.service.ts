import { CustomerRepository } from '../repository/customer.repository.js';
import type { 
  CreateCustomerDTO, 
  UpdateCustomerDTO, 
  CreateVehicleDTO, 
  UpdateVehicleDTO,
  CreateWarrantyDTO,
  CreateReminderDTO,
  CreateComplaintDTO,
  CreateEstimateDTO
} from '../validation/customer.validation.js';
import { generateUid } from '../../../shared/utils/idGenerator.js';
import { db } from '../../../lib/db.js';
import { sendEmail, sendWhatsApp, notifyManagers, sendNotification } from '../../../shared/services/notification.service.js';

export class CustomerService {
  constructor(private readonly repository: CustomerRepository = new CustomerRepository()) {}

  async getCustomers(tenantFilter: any) {
    return this.repository.findAll(tenantFilter);
  }

  async getCustomerById(id: string) {
    const customer = await this.repository.findById(id);
    if (!customer) {
      throw new Error(`Customer with ID ${id} not found`);
    }
    return customer;
  }

  async createCustomer(data: CreateCustomerDTO, franchiseId: string | null) {
    const custId = generateUid("CUST");
    return this.repository.create(custId, data, franchiseId);
  }

  async updateCustomer(id: string, data: UpdateCustomerDTO) {
    await this.getCustomerById(id); // checks existence
    return this.repository.update(id, data);
  }

  async deleteCustomer(id: string) {
    await this.getCustomerById(id); // checks existence
    return this.repository.softDelete(id);
  }

  // Vehicle Management
  async getVehicles(customerId: string) {
    await this.getCustomerById(customerId);
    return this.repository.getVehicles(customerId);
  }

  async addVehicle(customerId: string, data: CreateVehicleDTO) {
    await this.getCustomerById(customerId);
    // check if vehicle already exists (active)
    const existing = await this.repository.findVehicleByNo(data.vehicleNo);
    if (existing && !existing.isDeleted) {
      throw new Error(`Vehicle ${data.vehicleNo} is already registered under another profile`);
    }
    return this.repository.addVehicle(customerId, data);
  }

  async updateVehicle(customerId: string, vehicleId: string, data: UpdateVehicleDTO) {
    await this.getCustomerById(customerId);
    const vehicle = await this.repository.findVehicleById(vehicleId);
    if (!vehicle || vehicle.customerId !== customerId) {
      throw new Error(`Vehicle not found for this customer`);
    }
    return this.repository.updateVehicle(vehicleId, data);
  }

  async deleteVehicle(customerId: string, vehicleId: string) {
    await this.getCustomerById(customerId);
    const vehicle = await this.repository.findVehicleById(vehicleId);
    if (!vehicle || vehicle.customerId !== customerId) {
      throw new Error(`Vehicle not found for this customer`);
    }
    return this.repository.deleteVehicle(vehicleId);
  }

  // Warranty Management
  async getWarranties(customerId: string) {
    await this.getCustomerById(customerId);
    return this.repository.getWarranties(customerId);
  }

  async addWarranty(customerId: string, data: CreateWarrantyDTO) {
    await this.getCustomerById(customerId);
    return this.repository.addWarranty(customerId, data);
  }

  // Service Reminders
  async getReminders(customerId: string) {
    await this.getCustomerById(customerId);
    return this.repository.getReminders(customerId);
  }

  async addReminder(customerId: string, data: CreateReminderDTO) {
    await this.getCustomerById(customerId);
    return this.repository.addReminder(customerId, data);
  }

  // Referrals
  async getReferrals(customerId: string) {
    await this.getCustomerById(customerId);
    return this.repository.getReferrals(customerId);
  }

  // Consolidated Customer History
  async getCustomerHistory(customerId: string) {
    const customer = await this.getCustomerById(customerId);

    // Fetch related records from different tables
    const [
      jobs,
      invoices,
      payments,
      followUps,
      callbacks,
      referrals,
      appointments,
      carIns,
      warranties,
      reminders,
      complaints,
      estimates,
      leadRecord
    ] = await Promise.all([
      db.job.findMany({
        where: { phone: customer.phone, isDeleted: false },
        orderBy: { createdAt: 'desc' }
      }),
      db.invoice.findMany({
        where: { phone: customer.phone, isDeleted: false },
        orderBy: { date: 'desc' }
      }),
      db.payment.findMany({
        where: { client: customer.name, isDeleted: false },
        orderBy: { date: 'desc' }
      }),
      customer.convertedLeadId ? db.leadFollowUp.findMany({
        where: { leadId: customer.convertedLeadId },
        orderBy: { followUpDate: 'desc' }
      }) : [],
      db.callback.findMany({
        where: {
          OR: [
            { customerId },
            { leadId: customer.convertedLeadId || undefined }
          ],
          isDeleted: false
        },
        orderBy: { scheduledAt: 'desc' }
      }),
      db.referral.findMany({
        where: {
          OR: [
            { referringCustomerId: customerId },
            { referredCustomerId: customerId }
          ],
          isDeleted: false
        },
        orderBy: { referralDate: 'desc' }
      }),
      db.appointment.findMany({
        where: { customerId: customer.id, isDeleted: false },
        orderBy: { scheduledDate: 'desc' }
      }),
      db.carIn.findMany({
        where: { phone: customer.phone, isDeleted: false },
        orderBy: { inTime: 'desc' }
      }),
      db.warranty.findMany({
        where: { customerId: customer.id, isDeleted: false },
        orderBy: { startDate: 'desc' }
      }),
      db.serviceReminder.findMany({
        where: { customerId: customer.id, isDeleted: false },
        orderBy: { scheduledDate: 'desc' }
      }),
      db.customerComplaint.findMany({
        where: { customerId: customer.id },
        orderBy: { createdAt: 'desc' }
      }),
      db.estimate.findMany({
        where: { customerId: customer.id, isDeleted: false },
        orderBy: { date: 'desc' }
      }),
      customer.convertedLeadId ? db.lead.findUnique({
        where: { id: customer.convertedLeadId }
      }) : null
    ]);

    // Format all into a unified timeline of events
    const timeline: any[] = [];

    // Lead Created
    if (leadRecord) {
      timeline.push({
        type: 'LEAD_CREATED',
        date: leadRecord.date,
        title: 'Lead Created',
        description: `Lead registered for service: ${leadRecord.service} (Lead ID: ${leadRecord.id})`,
        metadata: leadRecord
      });
    }

    // Lead Converted
    if (customer.convertedAt) {
      timeline.push({
        type: 'LEAD_CONVERTED',
        date: customer.convertedAt,
        title: 'Lead Converted',
        description: `Lead converted to customer profile (Customer ID: ${customer.id})`,
        metadata: { convertedAt: customer.convertedAt, customerId: customer.id }
      });
    }

    jobs.forEach(j => {
      timeline.push({
        type: 'JOB',
        date: j.createdAt,
        title: `Job Card: ${j.id}`,
        description: `Service: ${j.service} | Status: ${j.status} | Tech: ${j.technician || 'Not assigned'}`,
        metadata: j
      });
    });

    invoices.forEach(i => {
      timeline.push({
        type: 'INVOICE',
        date: i.date,
        title: `Invoice: ${i.id}`,
        description: `Amount: ${i.amount} INR | GST: ${i.gst} INR | Status: ${i.status}`,
        metadata: i
      });
    });

    payments.forEach(p => {
      timeline.push({
        type: 'PAYMENT',
        date: p.date,
        title: `Payment: ${p.id}`,
        description: `Received: ${p.amount} INR via ${p.mode} (Ref: ${p.ref})`,
        metadata: p
      });
    });

    followUps.forEach(f => {
      timeline.push({
        type: 'FOLLOW_UP',
        date: f.followUpDate,
        title: `Follow Up`,
        description: `Mode: ${f.mode} | Performed by: ${f.performedBy} | Notes: ${f.notes}`,
        metadata: f
      });
    });

    callbacks.forEach(c => {
      timeline.push({
        type: 'CALLBACK',
        date: c.scheduledAt,
        title: `Callback: ${c.status}`,
        description: `Scheduled at: ${c.scheduledAt} | Agent: ${c.assignedTo} | Notes: ${c.reminderNotes}`,
        metadata: c
      });
    });

    referrals.forEach(r => {
      const role = r.referringCustomerId === customerId ? 'Referrer' : 'Referee';
      timeline.push({
        type: 'REFERRAL',
        date: r.referralDate,
        title: `Referral (${role})`,
        description: `${role === 'Referrer' ? 'Referred: ' + r.referredName : 'Referred by: ' + r.referringCustomer} | Status: ${r.status}`,
        metadata: r
      });
    });

    appointments.forEach(a => {
      timeline.push({
        type: 'APPOINTMENT',
        date: a.scheduledDate,
        title: `Appointment: ${a.status}`,
        description: `Scheduled Date: ${new Date(a.scheduledDate).toLocaleString()} | Service: ${a.service}`,
        metadata: a
      });
    });

    carIns.forEach(c => {
      timeline.push({
        type: 'VEHICLE_CHECK_IN',
        date: c.inTime,
        title: `Vehicle Check-In`,
        description: `Vehicle: ${c.vehicle} (${c.model}) | Odometer: ${c.odometer} | Status: ${c.status}`,
        metadata: c
      });
    });

    warranties.forEach(w => {
      timeline.push({
        type: 'WARRANTY_ISSUED',
        date: w.startDate,
        title: `Warranty Issued`,
        description: `Item: ${w.itemName} | Expiry Date: ${new Date(w.expiryDate).toLocaleDateString()} | Status: ${w.status}`,
        metadata: w
      });
    });

    reminders.forEach(sr => {
      timeline.push({
        type: 'SERVICE_REMINDER',
        date: sr.scheduledDate,
        title: `Service Reminder: ${sr.status}`,
        description: `Type: ${sr.reminderType} | Date: ${new Date(sr.scheduledDate).toLocaleDateString()}`,
        metadata: sr
      });
    });

    complaints.forEach(co => {
      timeline.push({
        type: 'COMPLAINT',
        date: co.createdAt,
        title: `Complaint: ${co.status}`,
        description: `Title: ${co.title} | Severity: ${co.severity} | Description: ${co.description}`,
        metadata: co
      });
    });

    estimates.forEach(e => {
      timeline.push({
        type: 'ESTIMATE',
        date: e.date,
        title: `Estimate/Quotation: ${e.status}`,
        description: `Amount: ${e.amount} INR | Vehicle: ${e.vehicle} (${e.model})`,
        metadata: e
      });
    });

    // Sort timeline by date descending
    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      customer,
      timeline
    };
  }

  // Complaints
  async getComplaints(customerId: string) {
    await this.getCustomerById(customerId);
    return this.repository.getComplaints(customerId);
  }

  async addComplaint(customerId: string, data: CreateComplaintDTO) {
    await this.getCustomerById(customerId);
    return this.repository.addComplaint(customerId, data);
  }

  // Estimates
  async getEstimates(customerId: string) {
    await this.getCustomerById(customerId);
    return this.repository.getEstimates(customerId);
  }

  async addEstimate(customerId: string, data: CreateEstimateDTO, franchiseId: string | null) {
    await this.getCustomerById(customerId);
    return this.repository.addEstimate(customerId, data, franchiseId);
  }

  // Reports
  async getReportsSummary(tenantFilter: any) {
    const customers = await db.customer.findMany({
      where: {
        ...tenantFilter,
        isDeleted: false
      },
      include: {
        vehicles: {
          where: { isDeleted: false }
        }
      }
    });

    const totalCustomers = customers.length;
    const totalSpend = customers.reduce((sum, c) => sum + (c.totalSpend || 0), 0);
    const totalVisits = customers.reduce((sum, c) => sum + (c.visits || 0), 0);
    const avgSpendPerCustomer = totalCustomers > 0 ? (totalSpend / totalCustomers) : 0;
    const avgVisitsPerCustomer = totalCustomers > 0 ? (totalVisits / totalCustomers) : 0;

    return {
      totalCustomers,
      totalSpend,
      totalVisits,
      avgSpendPerCustomer,
      avgVisitsPerCustomer,
      customers: customers.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        vehicleCount: c.vehicles.length,
        visits: c.visits,
        totalSpend: c.totalSpend,
        lastVisit: c.lastVisit
      }))
    };
  }

  // Cross-franchise vehicle service history
  async getVehicleServiceHistory(vehicleNo: string) {
    const uppercaseVehicleNo = vehicleNo.toUpperCase();

    // Query jobs, invoices, warranties across all franchises (no tenant filter)
    const [jobs, invoices, warranties] = await Promise.all([
      db.job.findMany({
        where: {
          vehicle: {
            equals: uppercaseVehicleNo,
            mode: 'insensitive'
          },
          isDeleted: false
        },
        orderBy: { startDate: 'desc' }
      }),
      db.invoice.findMany({
        where: {
          vehicle: {
            equals: uppercaseVehicleNo,
            mode: 'insensitive'
          },
          type: 'Invoice',
          isDeleted: false
        },
        orderBy: { date: 'desc' }
      }),
      db.warranty.findMany({
        where: {
          vehicleNo: {
            equals: uppercaseVehicleNo,
            mode: 'insensitive'
          },
          isDeleted: false
        },
        orderBy: { startDate: 'desc' }
      })
    ]);

    // Map jobs to the required service history format
    const serviceHistory = jobs.map(job => {
      // Find matching invoice
      // If we don't have a direct link, match by date proximity or service matching
      const matchedInvoice = invoices.find(inv => 
        inv.service.toLowerCase().includes(job.service.toLowerCase()) || 
        Math.abs(new Date(inv.date).getTime() - new Date(job.createdAt).getTime()) < 24 * 60 * 60 * 1000
      );

      // Find matching warranties for this service/job
      const matchedWarranties = warranties.filter(w => 
        w.jobId === job.id || 
        w.itemName.toLowerCase().includes(job.service.toLowerCase())
      );

      return {
        serviceDate: job.startDate,
        jobCardNumber: job.id,
        servicesPerformed: job.service,
        assignedEmployee: job.technician || 'Unassigned',
        invoiceNumber: matchedInvoice ? matchedInvoice.id : 'N/A',
        paymentStatus: matchedInvoice ? matchedInvoice.status : 'N/A',
        warrantyDetails: matchedWarranties.map(w => ({
          id: w.id,
          itemName: w.itemName,
          startDate: w.startDate,
          expiryDate: w.expiryDate,
          status: w.status
        }))
      };
    });

    return {
      vehicleNo: uppercaseVehicleNo,
      history: serviceHistory
    };
  }

  // Search customers
  async searchCustomers(query: string, tenantFilter: any) {
    if (!query) return [];
    return this.repository.search(query, tenantFilter);
  }

  // Customer Dashboard
  async getCustomerDashboard(id: string) {
    const customer = await this.getCustomerById(id);

    const [vehicles, activeWarrantiesCount, pendingRemindersCount, referralsCount, latestJob, latestInvoice, latestPayment, latestFollowUp] = await Promise.all([
      db.customerVehicle.findMany({ where: { customerId: id, isDeleted: false } }),
      db.warranty.count({
        where: {
          customerId: id,
          status: "Active",
          expiryDate: { gte: new Date() },
          isDeleted: false
        }
      }),
      db.serviceReminder.count({
        where: {
          customerId: id,
          status: "Pending",
          isDeleted: false
        }
      }),
      db.referral.count({
        where: { referringCustomerId: id, isDeleted: false }
      }),
      db.job.findFirst({
        where: { phone: customer.phone, isDeleted: false },
        orderBy: { createdAt: 'desc' }
      }),
      db.invoice.findFirst({
        where: { phone: customer.phone, isDeleted: false },
        orderBy: { date: 'desc' }
      }),
      db.payment.findFirst({
        where: { client: customer.name, isDeleted: false },
        orderBy: { date: 'desc' }
      }),
      customer.convertedLeadId ? db.leadFollowUp.findFirst({
        where: { leadId: customer.convertedLeadId },
        orderBy: { followUpDate: 'desc' }
      }) : null
    ]);

    return {
      summary: {
        customerSince: customer.createdAt,
        totalVehicles: vehicles.length,
        totalVisits: customer.visits,
        totalRevenue: customer.totalSpend,
        activeWarranties: activeWarrantiesCount,
        pendingServiceDue: pendingRemindersCount,
        referralCount: referralsCount
      },
      recentActivities: {
        latestJobCard: latestJob || null,
        latestInvoice: latestInvoice || null,
        latestPayment: latestPayment || null,
        latestFollowUp: latestFollowUp || null
      }
    };
  }

  // CSV Report Generator
  async getReportCSV(type: string, tenantFilter: any): Promise<string> {
    const helperToCSV = (data: any[], headers: string[]): string => {
      const csvRows = [];
      csvRows.push(headers.join(','));
      for (const row of data) {
        const values = headers.map(header => {
          const val = row[header] === null || row[header] === undefined ? '' : row[header];
          const escaped = ('' + val).replace(/"/g, '""');
          return `"${escaped}"`;
        });
        csvRows.push(values.join(','));
      }
      return csvRows.join('\n');
    };

    switch (type) {
      case 'customer_register': {
        const list = await db.customer.findMany({ where: { ...tenantFilter, isDeleted: false } });
        const data = list.map(c => ({
          'Customer ID': c.id,
          'Name': c.name,
          'Phone': c.phone,
          'Email': c.email,
          'Alt Phone': c.alternateNumber || '',
          'GST Number': c.gstNumber || '',
          'Address': c.address || '',
          'City': c.city || '',
          'State': c.state || '',
          'Pin Code': c.pinCode || '',
          'Status': c.status,
          'Total Spend': c.totalSpend,
          'Visits': c.visits
        }));
        return helperToCSV(data, ['Customer ID', 'Name', 'Phone', 'Email', 'Alt Phone', 'GST Number', 'Address', 'City', 'State', 'Pin Code', 'Status', 'Total Spend', 'Visits']);
      }
      case 'new_customer': {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const list = await db.customer.findMany({
          where: {
            ...tenantFilter,
            isDeleted: false,
            createdAt: { gte: thirtyDaysAgo }
          }
        });
        const data = list.map(c => ({
          'Customer ID': c.id,
          'Name': c.name,
          'Phone': c.phone,
          'Email': c.email,
          'Created At': c.createdAt.toISOString(),
          'Status': c.status
        }));
        return helperToCSV(data, ['Customer ID', 'Name', 'Phone', 'Email', 'Created At', 'Status']);
      }
      case 'vehicle_register': {
        const list = await db.customerVehicle.findMany({
          where: {
            isDeleted: false,
            customer: { ...tenantFilter, isDeleted: false }
          },
          include: { customer: true }
        });
        const data = list.map(v => ({
          'Vehicle ID': v.id,
          'Customer Name': v.customer.name,
          'Vehicle No': v.vehicleNo,
          'Make': v.make,
          'Model': v.model,
          'Variant': v.variant || '',
          'Year': v.year || '',
          'Fuel Type': v.fuelType || '',
          'Color': v.color || '',
          'Chassis No': v.chassisNo || '',
          'Engine No': v.engineNo || '',
          'Odometer': v.odometer || ''
        }));
        return helperToCSV(data, ['Vehicle ID', 'Customer Name', 'Vehicle No', 'Make', 'Model', 'Variant', 'Year', 'Fuel Type', 'Color', 'Chassis No', 'Engine No', 'Odometer']);
      }
      case 'customer_visit': {
        const list = await db.job.findMany({
          where: { isDeleted: false },
          orderBy: { createdAt: 'desc' }
        });
        const carIns = await db.carIn.findMany({
          where: { isDeleted: false },
          select: { jobCardId: true, phone: true }
        });
        const carInMap = new Map(carIns.map(c => [c.jobCardId, c.phone]));

        const data = list.map(j => ({
          'Job ID': j.id,
          'Customer Phone': carInMap.get(j.id) || '',
          'Vehicle': j.vehicle || '',
          'Service': j.service,
          'Technician': j.technician || '',
          'Status': j.status,
          'Date': j.createdAt.toISOString()
        }));
        return helperToCSV(data, ['Job ID', 'Customer Phone', 'Vehicle', 'Service', 'Technician', 'Status', 'Date']);
      }
      case 'service_history': {
        const list = await db.job.findMany({
          where: { isDeleted: false }
        });
        const invoices = await db.invoice.findMany({
          where: { type: 'Invoice', isDeleted: false }
        });

        const data = list.map(j => {
          const matchedInvoice = invoices.find(inv => 
            inv.vehicle.toUpperCase() === j.vehicle?.toUpperCase() &&
            Math.abs(new Date(inv.date).getTime() - new Date(j.createdAt).getTime()) < 48 * 60 * 60 * 1000
          );
          return {
            'Job ID': j.id,
            'Vehicle': j.vehicle || '',
            'Service': j.service,
            'Technician': j.technician || '',
            'Invoice ID': matchedInvoice ? matchedInvoice.id : 'N/A',
            'Payment Status': matchedInvoice ? matchedInvoice.status : 'N/A',
            'Date': j.startDate ? j.startDate.toISOString() : j.createdAt.toISOString()
          };
        });
        return helperToCSV(data, ['Job ID', 'Vehicle', 'Service', 'Technician', 'Invoice ID', 'Payment Status', 'Date']);
      }
      case 'warranty_report': {
        const list = await db.warranty.findMany({
          where: { isDeleted: false },
          include: { customer: true }
        });
        const data = list.map(w => ({
          'Warranty ID': w.id,
          'Customer Name': w.customer.name,
          'Vehicle No': w.vehicleNo,
          'Item Name': w.itemName,
          'Start Date': w.startDate.toISOString(),
          'Expiry Date': w.expiryDate.toISOString(),
          'Status': w.status,
          'Duration (Days)': w.durationDays
        }));
        return helperToCSV(data, ['Warranty ID', 'Customer Name', 'Vehicle No', 'Item Name', 'Start Date', 'Expiry Date', 'Status', 'Duration (Days)']);
      }
      case 'service_due': {
        const list = await db.serviceReminder.findMany({
          where: { isDeleted: false },
          include: { customer: true }
        });
        const data = list.map(sr => ({
          'Reminder ID': sr.id,
          'Customer Name': sr.customer.name,
          'Vehicle No': sr.vehicleNo,
          'Reminder Type': sr.reminderType,
          'Scheduled Date': sr.scheduledDate.toISOString(),
          'Status': sr.status,
          'Notes': sr.notes || ''
        }));
        return helperToCSV(data, ['Reminder ID', 'Customer Name', 'Vehicle No', 'Reminder Type', 'Scheduled Date', 'Status', 'Notes']);
      }
      case 'referral_report': {
        const list = await db.referral.findMany({
          where: { isDeleted: false }
        });
        const data = list.map(r => ({
          'Referral ID': r.id,
          'Referring Customer': r.referringCustomer,
          'Referred Name': r.referredName,
          'Referral Date': r.referralDate.toISOString(),
          'Status': r.status,
          'Reward Points': r.rewardPointsApplied
        }));
        return helperToCSV(data, ['Referral ID', 'Referring Customer', 'Referred Name', 'Referral Date', 'Status', 'Reward Points']);
      }
      default:
        throw new Error(`Invalid report type: ${type}`);
    }
  }

  async dispatchCustomerReminders() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    // 1. Service Due Reminders
    const dueReminders = await db.serviceReminder.findMany({
      where: {
        status: "Pending",
        scheduledDate: {
          lt: tomorrow
        },
        isDeleted: false
      },
      include: { customer: true }
    });

    const reminderPromises = dueReminders.map(async (sr) => {
      // Update status
      await db.serviceReminder.update({
        where: { id: sr.id },
        data: { status: "Sent" }
      });

      // Send to customer
      if (sr.customer.email) {
        await sendEmail(sr.customer.email, "Service Due Reminder", `Dear ${sr.customer.name}, your vehicle ${sr.vehicleNo} is due for ${sr.reminderType} service.`);
      }
      if (sr.customer.phone) {
        await sendWhatsApp(sr.customer.phone, `Dear ${sr.customer.name}, your vehicle ${sr.vehicleNo} is due for ${sr.reminderType} service.`);
      }

      // Notify managers
      await notifyManagers(sr.customer.franchiseId, "Service Due Reminder", `Vehicle ${sr.vehicleNo} (Customer: ${sr.customer.name}) is due for ${sr.reminderType} service.`);
    });

    // 2. Warranty Expiry Reminders (expiring in the next 30 days)
    const thirtyDaysAhead = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiringWarranties = await db.warranty.findMany({
      where: {
        status: "Active",
        expiryDate: {
          gte: today,
          lte: thirtyDaysAhead
        },
        isDeleted: false
      },
      include: { customer: true }
    });

    const warrantyPromises = expiringWarranties.map(async (w) => {
      if (w.customer.email) {
        await sendEmail(w.customer.email, "Warranty Expiry Reminder", `Dear ${w.customer.name}, the warranty for ${w.itemName} on vehicle ${w.vehicleNo} expires on ${w.expiryDate.toLocaleDateString()}.`);
      }
      if (w.customer.phone) {
        await sendWhatsApp(w.customer.phone, `Dear ${w.customer.name}, the warranty for ${w.itemName} on vehicle ${w.vehicleNo} expires on ${w.expiryDate.toLocaleDateString()}.`);
      }
    });

    // 3. Birthday Wishes (optional)
    const activeCustomers = await db.customer.findMany({
      where: { isDeleted: false, status: "Active" }
    });

    const wishPromises = activeCustomers.map(async (c) => {
      if (c.dob) {
        const dob = new Date(c.dob);
        if (dob.getDate() === today.getDate() && dob.getMonth() === today.getMonth()) {
          if (c.email) await sendEmail(c.email, "Happy Birthday!", `Dear ${c.name}, wishing you a very happy birthday from Shifterz!`);
          if (c.phone) await sendWhatsApp(c.phone, `Happy Birthday ${c.name}! Wishing you a great year ahead - Team Shifterz.`);
        }
      }
      if (c.anniversary) {
        const ann = new Date(c.anniversary);
        if (ann.getDate() === today.getDate() && ann.getMonth() === today.getMonth()) {
          if (c.email) await sendEmail(c.email, "Happy Anniversary!", `Dear ${c.name}, wishing you a very happy anniversary from Shifterz!`);
          if (c.phone) await sendWhatsApp(c.phone, `Happy Anniversary ${c.name}! Wishing you love and happiness - Team Shifterz.`);
        }
      }
    });

    await Promise.all([...reminderPromises, ...warrantyPromises, ...wishPromises]);
    return { success: true, processedReminders: dueReminders.length, processedWarranties: expiringWarranties.length };
  }
}

