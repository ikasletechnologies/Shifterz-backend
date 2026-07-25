export declare class VehicleRepository {
    findCustomerByVehicle(vehicleNo: string): Promise<{
        id: string;
        name: string;
        phone: string;
        email: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        vehicle: string;
        model: string;
        visits: number;
        totalSpend: number;
        lastVisit: Date;
    } | null>;
    findCarInByVehicle(vehicleNo: string): Promise<{
        id: string;
        phone: string;
        status: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        service: string;
        customer: string;
        vehicle: string;
        notes: string;
        model: string;
        technicianIn: string;
        inTime: Date;
        odometer: string;
        outTime: Date | null;
        jobCardId: string;
    } | null>;
    findLeadByVehicle(vehicleNo: string): Promise<{
        id: string;
        name: string;
        phone: string;
        status: string;
        email: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        service: string;
        vehicle: string;
        date: Date;
        notes: string;
        source: string;
        assignedTo: string;
        budget: string;
    } | null>;
}
//# sourceMappingURL=vehicle.repository.d.ts.map