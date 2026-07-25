import { Router } from "express";
import { db } from "../lib/db.js";
import { authenticate as requireAuth, tenant as tenantScope } from "../middleware/auth.middleware.js";
export const dashboardRouter = Router();
// Apply auth and tenant scope to all dashboard routes
dashboardRouter.use(requireAuth);
dashboardRouter.use(tenantScope);
dashboardRouter.get("/", async (req, res) => {
    try {
        const tenantFilter = req.tenantFilter || {};
        const today = new Date();
        // Since dates in DB are seeded as YYYY-MM-DD
        const todayStr = today.toISOString().split("T")[0];
        const monthStr = todayStr.substring(0, 7); // YYYY-MM
        // 1. CRM Metrics
        const leadsToday = await db.lead.count({ where: { ...tenantFilter, date: { startsWith: todayStr } } });
        const customers = await db.customer.findMany({
            where: {
                ...tenantFilter,
                isDeleted: false
            }
        });
        const newCustomers = customers.filter(c => c.visits <= 1).length;
        const returningCustomers = customers.filter(c => c.visits > 1).length;
        // Sort by ID descending to put the most recently created customers first
        const sortedCustomers = [...customers].sort((a, b) => b.id.localeCompare(a.id));
        const newCustomersList = sortedCustomers.filter(c => c.visits <= 1).slice(0, 5);
        const appointmentsToday = await db.appointment.count({
            where: { ...tenantFilter, scheduledDate: { startsWith: todayStr } }
        });
        // 2. Workshop Metrics
        const carsReceivedToday = await db.carIn.count({
            where: { ...tenantFilter, inTime: { startsWith: todayStr } }
        });
        const jobs = await db.job.findMany({ where: tenantFilter });
        const vehiclesInProgress = jobs.filter(j => j.status === "In Progress" || j.status === "Assigned").length;
        const vehiclesReady = jobs.filter(j => j.status === "Completed").length;
        const pendingQC = jobs.filter(j => j.status === "QC" || j.status === "Quality Check").length;
        // 3. Financial Metrics
        const invoices = await db.invoice.findMany({ where: tenantFilter });
        const revenueToday = invoices
            .filter(i => i.status === "Paid" && i.date.toISOString().startsWith(todayStr))
            .reduce((sum, i) => sum + (i.amount + i.gst - i.discount), 0);
        const revenueThisMonth = invoices
            .filter(i => i.status === "Paid" && i.date.toISOString().startsWith(monthStr))
            .reduce((sum, i) => sum + (i.amount + i.gst - i.discount), 0);
        const outstandingPayments = invoices
            .filter(i => i.status === "Pending" || i.status === "Overdue" || i.status === "Approved")
            .reduce((sum, i) => sum + (i.amount + i.gst - i.discount), 0);
        const pendingInvoicesCount = invoices.filter(i => i.status === "Pending").length;
        // 4. HR Metrics
        const attendanceToday = await db.attendance.findMany({
            where: { ...tenantFilter, date: todayStr }
        });
        const presentToday = attendanceToday.filter(a => a.status === "Present").length;
        const absentToday = attendanceToday.filter(a => a.status === "Absent").length;
        const jobsAssigned = jobs.length;
        const jobsCompleted = vehiclesReady;
        const productivity = jobsAssigned > 0 ? Math.round((jobsCompleted / jobsAssigned) * 100) : 0;
        // 5. Inventory Metrics
        const inventory = await db.inventory.findMany({ where: tenantFilter });
        const availableStock = inventory.reduce((sum, item) => sum + item.stock, 0);
        const lowStockItems = inventory.filter(item => item.stock <= item.reorder).length;
        const pendingStockRequests = await db.inventoryRequest.count({
            where: { ...tenantFilter, status: "Pending" }
        });
        res.json({
            crm: {
                appointmentsToday,
                leadsToday,
                newCustomers,
                returningCustomers,
                newCustomersList
            },
            workshop: {
                carsReceivedToday,
                vehiclesInProgress,
                vehiclesReady,
                pendingQC
            },
            financial: {
                revenueToday,
                revenueThisMonth,
                outstandingPayments,
                pendingInvoicesCount
            },
            hr: {
                presentToday,
                absentToday,
                jobsAssigned,
                jobsCompleted,
                productivity
            },
            inventory: {
                availableStock,
                lowStockItems,
                pendingStockRequests
            }
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
//# sourceMappingURL=dashboard.js.map