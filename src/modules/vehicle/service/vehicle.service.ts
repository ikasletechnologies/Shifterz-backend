import { VehicleRepository } from '../repository/vehicle.repository.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';

export class VehicleService {
  constructor(private readonly repository: VehicleRepository = new VehicleRepository()) {}

  async lookupVehicle(vehicleNo: string) {
    const [job, customer, carIn, lead] = await Promise.all([
      this.repository.findJobByVehicle(vehicleNo),
      this.repository.findCustomerByVehicle(vehicleNo),
      this.repository.findCarInByVehicle(vehicleNo),
      this.repository.findLeadByVehicle(vehicleNo),
    ]);

    if (job || customer || carIn || lead) {
      return { 
        found: true,
        name: customer?.name || carIn?.customer || job?.customer || lead?.name || null,
        phone: customer?.phone || carIn?.phone || lead?.phone || null,
        email: customer?.email || null,
        model: customer?.model || carIn?.model || null,
        jobId: job?.id || null,
        service: job?.service || null,
        services: job?.services || null,
        serviceAdvisor: job?.serviceAdvisor || null,
        technician: job?.technician || null,
        materials: job?.materialConsumptions || [],
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
