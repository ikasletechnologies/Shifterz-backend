import type { Request, Response } from "express";
import { WarrantyService } from "../service/warranty.service.js";

const service = new WarrantyService();

export class WarrantyController {
  async getWarranties(req: Request, res: Response): Promise<void> {
    try {
      const customerId = req.query.customerId as string | undefined;
      const vehicleNo = req.query.vehicleNo as string | undefined;
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;

      const warranties = await service.getAllWarranties({
        customerId,
        vehicleNo,
        status,
        search,
      });

      res.json(warranties);
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message });
    }
  }

  async getWarrantyById(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const warranty = await service.getWarrantyById(id);
      res.json(warranty);
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message });
    }
  }

  async createWarranty(req: Request, res: Response): Promise<void> {
    try {
      const warranty = await service.createWarranty(req.body);
      res.status(201).json(warranty);
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message });
    }
  }

  async updateWarranty(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const updated = await service.updateWarranty(id, req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message });
    }
  }

  async addClaim(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const updated = await service.addClaim(id, req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message });
    }
  }

  async generateFromInvoice(req: Request, res: Response): Promise<void> {
    try {
      const invoiceId = req.params.invoiceId as string;
      const warranties = await service.generateFromInvoice(invoiceId);
      res.status(201).json(warranties);
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message });
    }
  }

  async deleteWarranty(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const result = await service.deleteWarranty(id);
      res.json(result);
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message });
    }
  }
}
