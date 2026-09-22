import { db } from '../../../lib/db.js';
import type { UpdateSettingDTO } from '../validation/settings.validation.js';

const DEFAULT_SETTINGS_DATA = {
  companyName: "",
  address: "",
  phone: "",
  email: "",
  gstin: "",
  gstPct: 18,
  currency: "INR",
  agents: [],
  categories: [],
  securityGuards: [],
  leadSources: [
    "Website",
    "Walk-In",
    "Phone Call",
    "WhatsApp",
    "Google Business Profile",
    "Facebook",
    "Instagram",
    "Justdial",
    "Referral",
    "Existing Customer",
    "Corporate",
    "Exhibition / Event",
    "Manual Entry",
    "Other"
  ],
  leadStatuses: [
    "New",
    "Assigned",
    "Contacted",
    "Follow-up Required",
    "Quotation Sent",
    "Negotiation",
    "Converted",
    "Lost",
    "Closed"
  ],
  lostReasons: [
    "Price",
    "Competitor Chosen",
    "No Response",
    "Postponed",
    "Budget Constraints",
    "Duplicate Enquiry",
    "Other"
  ],
  referralProgram: {},
  loyaltyProgram: {},
  workingHours: {},
  notificationTemplates: {},
  numberingSeries: {}
};

export class SettingsRepository {
  // Atomic — avoids the read-then-create race where two concurrent GETs
  // both see no "default" row and both attempt to create it, the loser
  // failing with a P2002 unique-constraint error on a plain read.
  async getSettings() {
    return db.setting.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default", ...DEFAULT_SETTINGS_DATA }
    });
  }

  async updateSettings(data: UpdateSettingDTO) {
    return db.setting.update({
      where: { id: "default" },
      data
    });
  }
}
