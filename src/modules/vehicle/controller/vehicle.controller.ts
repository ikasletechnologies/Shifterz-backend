import type { Request, Response, NextFunction } from 'express';
import { VehicleService } from '../service/vehicle.service.js';

export class VehicleController {
  constructor(private readonly service: VehicleService = new VehicleService()) {}

  lookupVehicle = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const vehicleNo = String(req.params.vehicleNo || "").trim().toUpperCase();
      const result = await this.service.lookupVehicle(vehicleNo);
      res.json(result);
    } catch (error: any) {
      next(error);
    }
  };
}
