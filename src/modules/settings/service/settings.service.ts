import { SettingsRepository } from '../repository/settings.repository.js';
import type { UpdateSettingDTO } from '../validation/settings.validation.js';

export class SettingsService {
  constructor(private readonly repository: SettingsRepository = new SettingsRepository()) {}

  async getSettings() {
    return this.repository.getSettings();
  }

  async updateSettings(data: UpdateSettingDTO) {
    // Ensures the "default" row exists (idempotent upsert) before updating it.
    await this.repository.getSettings();
    return this.repository.updateSettings(data);
  }
}
