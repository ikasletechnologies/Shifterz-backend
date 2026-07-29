import { VehicleRepository } from '../repository/vehicle.repository.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';

export class VehicleService {
  constructor(private readonly repository: VehicleRepository = new VehicleRepository()) {}

  async lookupVehicle(vehicleNo: string) {
    const customer = await this.repository.findCustomerByVehicle(vehicleNo);
    if (customer) {
      return { 
        found: true,
        name: customer.name, 
        phone: customer.phone, 
        email: customer.email, 
        model: customer.model 
      };
    }

    const carIn = await this.repository.findCarInByVehicle(vehicleNo);
    if (carIn) {
      return { 
        found: true,
        name: carIn.customer, 
        phone: carIn.phone, 
        model: carIn.model 
      };
    }

    const lead = await this.repository.findLeadByVehicle(vehicleNo);
    if (lead) {
      return { 
        found: true,
        name: lead.name, 
        phone: lead.phone 
      };
    }

    return {
      found: false,
      name: null,
      phone: null,
      model: null
    };
  }
}
