import type { Response, NextFunction } from 'express';
import { CustomerService } from '../service/customer.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { logAudit } from '../../../shared/services/audit.service.js';

export class CustomerController {
  constructor(private readonly service: CustomerService = new CustomerService()) {}

  private getTenantFilter(req: AuthRequest) {
    let tenantFilter: any = {};
    if (req.user) {
      if (req.user.role !== "SUPER_ADMIN" && req.user.role !== "HQ_USER" && req.user.franchiseId) {
        tenantFilter = { franchiseId: req.user.franchiseId };
      }
    }
    return tenantFilter;
  }

  getCustomers = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const tenantFilter = this.getTenantFilter(req);
      const customers = await this.service.getCustomers(tenantFilter);
      res.json(customers);
    } catch (error) {
      next(error);
    }
  };

  getCustomerById = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const customer = await this.service.getCustomerById(id);
      // Validate tenant access
      if (req.user && req.user.role !== "SUPER_ADMIN" && req.user.role !== "HQ_USER" && req.user.franchiseId) {
        if (customer.franchiseId !== req.user.franchiseId) {
          return res.status(403).json({ error: "Access denied to this customer profile" });
        }
      }
      res.json(customer);
    } catch (error) {
      next(error);
    }
  };

  createCustomer = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const franchiseId = req.user?.franchiseId || null;
      const customer = await this.service.createCustomer(req.body, franchiseId);
      await logAudit({
        module: "CUSTOMER",
        recordId: customer.id,
        action: "CREATE",
        userId: req.user?.id || "unknown",
        branchId: franchiseId,
        oldValue: null,
        newValue: customer,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(customer);
    } catch (error) {
      next(error);
    }
  };

  updateCustomer = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const oldVal = await this.service.getCustomerById(id);
      if (req.user && req.user.role !== "SUPER_ADMIN" && req.user.role !== "HQ_USER" && req.user.franchiseId) {
        if (oldVal.franchiseId !== req.user.franchiseId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      const updated = await this.service.updateCustomer(id, req.body);
      await logAudit({
        module: "CUSTOMER",
        recordId: id,
        action: "UPDATE",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue: oldVal,
        newValue: updated,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  };

  deleteCustomer = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const oldValue = await this.service.getCustomerById(id);
      if (req.user && req.user.role !== "SUPER_ADMIN" && req.user.role !== "HQ_USER" && req.user.franchiseId) {
        if (oldValue.franchiseId !== req.user.franchiseId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      await this.service.deleteCustomer(id);
      await logAudit({
        module: "CUSTOMER",
        recordId: id,
        action: "DELETE",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: null,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json({ success: true, message: "Customer deleted" });
    } catch (error) {
      next(error);
    }
  };

  // Vehicles
  getVehicles = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const customer = await this.service.getCustomerById(id);
      if (req.user && req.user.role !== "SUPER_ADMIN" && req.user.role !== "HQ_USER" && req.user.franchiseId) {
        if (customer.franchiseId !== req.user.franchiseId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      const vehicles = await this.service.getVehicles(id);
      res.json(vehicles);
    } catch (error) {
      next(error);
    }
  };

  addVehicle = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const customer = await this.service.getCustomerById(id);
      if (req.user && req.user.role !== "SUPER_ADMIN" && req.user.role !== "HQ_USER" && req.user.franchiseId) {
        if (customer.franchiseId !== req.user.franchiseId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      const vehicle = await this.service.addVehicle(id, req.body);
      res.json(vehicle);
    } catch (error) {
      next(error);
    }
  };

  updateVehicle = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const vehicleId = String(req.params.vehicleId);
      const vehicle = await this.service.updateVehicle(id, vehicleId, req.body);
      res.json(vehicle);
    } catch (error) {
      next(error);
    }
  };

  deleteVehicle = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const vehicleId = String(req.params.vehicleId);
      await this.service.deleteVehicle(id, vehicleId);
      res.json({ success: true, message: "Vehicle removed" });
    } catch (error) {
      next(error);
    }
  };

  // Warranties
  getWarranties = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const warranties = await this.service.getWarranties(id);
      res.json(warranties);
    } catch (error) {
      next(error);
    }
  };

  addWarranty = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const warranty = await this.service.addWarranty(id, req.body);
      res.json(warranty);
    } catch (error) {
      next(error);
    }
  };

  // Reminders
  getReminders = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const reminders = await this.service.getReminders(id);
      res.json(reminders);
    } catch (error) {
      next(error);
    }
  };

  addReminder = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const reminder = await this.service.addReminder(id, req.body);
      res.json(reminder);
    } catch (error) {
      next(error);
    }
  };

  // Referrals
  getReferrals = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const referrals = await this.service.getReferrals(id);
      res.json(referrals);
    } catch (error) {
      next(error);
    }
  };

  // History
  getCustomerHistory = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const history = await this.service.getCustomerHistory(id);
      res.json(history);
    } catch (error) {
      next(error);
    }
  };

  // Reports
  getReportsSummary = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const tenantFilter = this.getTenantFilter(req);
      const summary = await this.service.getReportsSummary(tenantFilter);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  };

  // Complaints
  getComplaints = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const complaints = await this.service.getComplaints(id);
      res.json(complaints);
    } catch (error) {
      next(error);
    }
  };

  addComplaint = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const complaint = await this.service.addComplaint(id, req.body);
      res.json(complaint);
    } catch (error) {
      next(error);
    }
  };

  // Estimates
  getEstimates = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const estimates = await this.service.getEstimates(id);
      res.json(estimates);
    } catch (error) {
      next(error);
    }
  };

  addEstimate = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const franchiseId = req.user?.franchiseId || null;
      const estimate = await this.service.addEstimate(id, req.body, franchiseId);
      res.json(estimate);
    } catch (error) {
      next(error);
    }
  };

  searchCustomers = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const q = String(req.query.q || '');
      const tenantFilter = this.getTenantFilter(req);
      const results = await this.service.searchCustomers(q, tenantFilter);
      res.json(results);
    } catch (error) {
      next(error);
    }
  };

  getCustomerDashboard = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const dashboardData = await this.service.getCustomerDashboard(id);
      res.json(dashboardData);
    } catch (error) {
      next(error);
    }
  };

  exportCSVReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const type = String(req.query.type || 'customer_register');
      const tenantFilter = this.getTenantFilter(req);
      const csvContent = await this.service.getReportCSV(type, tenantFilter);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${type}_report.csv`);
      res.status(200).send(csvContent);
    } catch (error) {
      next(error);
    }
  };

  getVehicleServiceHistory = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const vehicleNo = String(req.params.vehicleNo);
      const history = await this.service.getVehicleServiceHistory(vehicleNo);
      res.json(history);
    } catch (error) {
      next(error);
    }
  };

  dispatchReminders = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.dispatchCustomerReminders();
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}
