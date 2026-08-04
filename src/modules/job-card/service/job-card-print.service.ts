import PDFDocument from 'pdfkit';
import { db } from '../../../lib/db.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import type { Response } from 'express';


export class JobCardPrintService {
  async generatePdf(jobId: string, copyType: 'workshop' | 'customer', res: Response): Promise<void> {
    const job = await db.job.findFirst({
      where: { id: jobId, isDeleted: false },
    });

    if (!job) {
      throw new NotFoundError(`Job card with ID '${jobId}' not found.`);
    }

    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    // Stream the PDF directly to Express response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="JobCard_${jobId}_${copyType}.pdf"`);
    doc.pipe(res);

    // Decorative Header Band
    doc.rect(0, 0, 595.28, 80).fill('#1E293B');

    // Title
    doc.fillColor('#FFFFFF')
       .font('Helvetica-Bold')
       .fontSize(22)
       .text('SHIFTERZ AUTO SERVICES', 40, 20);

    doc.fontSize(12)
       .font('Helvetica')
       .text(`JOB CARD - ${copyType.toUpperCase()} COPY`, 40, 48);

    // Job ID / Date info on the top right
    doc.fillColor('#FFFFFF')
       .fontSize(10)
       .text(`Job Card No: ${job.id}`, 400, 22, { align: 'right', width: 155 })
       .text(`Date: ${new Date(job.createdAt).toLocaleDateString()}`, 400, 38, { align: 'right', width: 155 });

    // Reset layout color and position
    doc.fillColor('#000000');
    let y = 100;

    // --- Section 1: Customer & Vehicle Details ---
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1E293B').text('1. Vehicle & Customer Details', 40, y);
    doc.strokeColor('#CBD5E1').lineWidth(1).moveTo(40, y + 15).lineTo(555, y + 15).stroke();
    y += 25;

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000');
    doc.text('Customer Name:', 40, y);
    doc.font('Helvetica').text(job.customer || 'N/A', 140, y);

    doc.font('Helvetica-Bold').text('Vehicle Number:', 300, y);
    doc.font('Helvetica').text(job.vehicle || 'N/A', 400, y);
    y += 18;

    // Add status and priority details
    doc.font('Helvetica-Bold').text('Job Status:', 40, y);
    doc.font('Helvetica').text(job.status || 'N/A', 140, y);

    doc.font('Helvetica-Bold').text('Priority:', 300, y);
    doc.font('Helvetica').text(job.priority || 'Medium', 400, y);
    y += 28;

    // --- Section 2: Services / Line Items ---
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1E293B').text('2. Approved Services & Labor', 40, y);
    doc.strokeColor('#CBD5E1').lineWidth(1).moveTo(40, y + 15).lineTo(555, y + 15).stroke();
    y += 25;

    // Table Headers
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#475569');
    doc.text('Service Item / Description', 45, y);
    doc.text('Qty', 350, y, { width: 30, align: 'center' });
    doc.text('Unit Price', 400, y, { width: 70, align: 'right' });
    doc.text('Amount', 480, y, { width: 70, align: 'right' });
    y += 15;

    let totalPrice = 0;
    const services = Array.isArray(job.services) ? (job.services as any[]) : [];
    
    doc.font('Helvetica').fillColor('#000000');
    if (services.length === 0) {
      doc.text('No specific services assigned.', 45, y);
      y += 18;
    } else {
      for (const item of services) {
        const name = item.name || 'Service Item';
        const qty = item.qty || 1;
        const price = item.price || 0;
        const amount = qty * price;
        totalPrice += amount;

        doc.text(name, 45, y, { width: 290 });
        doc.text(qty.toString(), 350, y, { width: 30, align: 'center' });
        doc.text(`INR ${price.toFixed(2)}`, 400, y, { width: 70, align: 'right' });
        doc.text(`INR ${amount.toFixed(2)}`, 480, y, { width: 70, align: 'right' });
        y += 18;
      }
    }

    // Totals Line
    doc.strokeColor('#E2E8F0').lineWidth(1).moveTo(40, y).lineTo(555, y).stroke();
    y += 8;
    doc.fontSize(10).font('Helvetica-Bold').text('Total Services Value:', 350, y);
    doc.text(`INR ${totalPrice.toFixed(2)}`, 480, y, { width: 70, align: 'right' });
    y += 28;

    // --- Section 3: Conditional Details (Workshop vs. Customer Copy) ---
    if (copyType === 'workshop') {
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#1E293B').text('3. Technical & Internal Notes', 40, y);
      doc.strokeColor('#CBD5E1').lineWidth(1).moveTo(40, y + 15).lineTo(555, y + 15).stroke();
      y += 25;

      // Primary Assigned Employee
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text('Assigned Technician:', 40, y);
      doc.font('Helvetica').text(job.technician || 'Unassigned', 160, y);
      y += 18;

      // Technician Instructions
      doc.font('Helvetica-Bold').text('Technician Instructions:', 40, y);
      doc.font('Helvetica').text(job.technicianInstructions || 'No specific instructions entered.', 40, y + 14, { width: 515 });
      y += doc.heightOfString(job.technicianInstructions || 'No specific instructions entered.', { width: 515 }) + 25;

      // Internal Remarks
      doc.font('Helvetica-Bold').text('Internal Remarks (Staff Only):', 40, y);
      doc.font('Helvetica').text(job.internalRemarks || 'No internal remarks entered.', 40, y + 14, { width: 515 });
      y += doc.heightOfString(job.internalRemarks || 'No internal remarks entered.', { width: 515 }) + 30;

    } else {
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#1E293B').text('3. Terms & Delivery Information', 40, y);
      doc.strokeColor('#CBD5E1').lineWidth(1).moveTo(40, y + 15).lineTo(555, y + 15).stroke();
      y += 25;

      // Delivery estimate
      const estDeliveryStr = job.estCompletion ? new Date(job.estCompletion).toLocaleString() : 'Not Set';
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text('Estimated Delivery:', 40, y);
      doc.font('Helvetica').text(estDeliveryStr, 150, y);
      y += 25;

      // General Customer Terms
      doc.font('Helvetica-Bold').text('Terms & Conditions:', 40, y);
      const terms = '1. All repairs carry standard warranties as per product/service Master terms.\n' +
                    '2. Vehicles parked at owners risk. Company is not liable for loss due to fire or natural calamities.\n' +
                    '3. Payment is due in full upon vehicle delivery unless approved credit arrangement exists.';
      doc.fontSize(9).font('Helvetica').text(terms, 40, y + 14, { width: 515, lineGap: 3 });
      y += 60;

      // Customer Acknowledgement / Sign-off Block
      doc.fontSize(10).font('Helvetica-Bold').text('Customer Acknowledgement:', 40, y);
      doc.fontSize(9).font('Helvetica').text('I hereby authorize the above service/labor work details to be performed on my vehicle.', 40, y + 14, { width: 300 });
      
      doc.strokeColor('#94A3B8').lineWidth(1).dash(3, { space: 3 }).moveTo(400, y + 40).lineTo(540, y + 40).stroke().undash();
      doc.fontSize(8).font('Helvetica-Oblique').text('Authorized Signature', 400, y + 45, { width: 140, align: 'center' });
    }

    doc.end();
  }
}
