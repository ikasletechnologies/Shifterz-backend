import { Router } from "express";
import { WarrantyController } from "../controller/warranty.controller.js";
import { authenticate } from "../../../middleware/auth.middleware.js";

export const warrantyRouter = Router();
const controller = new WarrantyController();

warrantyRouter.use(authenticate);

// GET /api/warranties - List all warranties (filter by customerId, vehicleNo, status, search)
warrantyRouter.get("/", controller.getWarranties);

// GET /api/warranties/:id - Get single warranty by ID
warrantyRouter.get("/:id", controller.getWarrantyById);

// POST /api/warranties - Create a warranty manually
warrantyRouter.post("/", controller.createWarranty);

// POST /api/warranties/generate-from-invoice/:invoiceId - Generate warranty(s) from a completed invoice
warrantyRouter.post("/generate-from-invoice/:invoiceId", controller.generateFromInvoice);

// PUT /api/warranties/:id - Update warranty (PRD rule: Expired warranties are read-only)
warrantyRouter.put("/:id", controller.updateWarranty);

// POST /api/warranties/:id/claim - Submit a claim against an active warranty
warrantyRouter.post("/:id/claim", controller.addClaim);

// DELETE /api/warranties/:id - Soft-delete a warranty
warrantyRouter.delete("/:id", controller.deleteWarranty);
