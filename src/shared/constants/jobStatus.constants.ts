export const COMPLETED_JOB_STATUSES = [
  "Completed", "QC Pending", "QC Passed", "Ready For Billing", "Work Completed", "Delivered", "Out"
];

// Job statuses eligible for invoicing (13.3/13.15.1: invoice only after QC passed).
// Same set already used to scope billing-role users' job list in job-card.controller.ts.
export const BILLING_ELIGIBLE_JOB_STATUSES = ["Ready For Billing", "QC Passed", "Delivered", "Out"];
