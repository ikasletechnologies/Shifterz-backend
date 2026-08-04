import { db } from '../../../lib/db.js';
import type { UpdateSettingDTO } from '../validation/settings.validation.js';

export class SettingsRepository {
  async getSettings() {
    return db.setting.findUnique({
      where: { id: "default" }
    });
  }

  async initDefaultSettings() {
    return db.setting.create({
      data: {
        id: "default",
        companyName: "ERP Shifterz",
        address: "123 Main St",
        phone: "1234567890",
        email: "contact@shifterz.com",
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
      }
    });
  }

  async updateSettings(data: UpdateSettingDTO) {
    return db.setting.update({
      where: { id: "default" },
      data
    });
  }
}
