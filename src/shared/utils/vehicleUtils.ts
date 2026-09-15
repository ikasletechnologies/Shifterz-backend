/**
 * Vehicle Registration Normalization Utility
 * Normalizes vehicle registration numbers for consistent comparison and storage.
 * e.g. "tn 01 ab 1234", "TN-01-AB-1234" -> "TN01AB1234"
 */
export function normalizeVehicleNo(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
