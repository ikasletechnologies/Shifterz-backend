import { db } from '../../../lib/db.js';
import { env } from '../../../config/env.js';
import { ApiError } from '../../../shared/errors/ApiError.js';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const GSTVERIFY_BASE_URL = 'https://gstverify.co.in/api/v1/verify';

export interface GstinDetails {
  gstin: string;
  legalName: string;
  tradeName: string;
  status: string;
  constitution: string;
  taxpayerType: string;
  registrationDate: string;
  pan: string;
  address: string;
  state: string;
  // GstVerify only returns one combined address string, no structured
  // city/pinCode — derived from it on read so we don't need to store them.
  city: string;
  pinCode: string;
  natureOfBusiness: string[];
}

type CachedRow = {
  gstin: string;
  legalName: string | null;
  tradeName: string | null;
  status: string | null;
  constitution: string | null;
  taxpayerType: string | null;
  registrationDate: string | null;
  pan: string | null;
  address: string | null;
  state: string | null;
  natureOfBusiness: string[];
};

function isValidGstin(gstin: string): boolean {
  return GSTIN_REGEX.test(gstin);
}

// GSTN addresses are free-text and messy, so this is a best-effort parse:
// pincode is the trailing 6-digit number; city is the last comma-separated
// segment left after stripping the pincode and the state name.
function deriveLocation(address: string, state: string): { city: string; pinCode: string } {
  if (!address) return { city: '', pinCode: '' };

  const pinMatches = address.match(/\d{6}(?!\d)/g);
  const pinCode = (pinMatches?.length ? pinMatches[pinMatches.length - 1] : '') || '';

  const withoutPin = address.replace(/[\s,\-–—]\d{6}\s*$/, '').trim();
  const segments = withoutPin
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !/^\d+$/.test(s) && s.toLowerCase() !== state.trim().toLowerCase());

  const city = (segments.length ? segments[segments.length - 1] : '') || '';
  return { city, pinCode };
}

function toDetails(row: CachedRow): GstinDetails {
  const address = row.address || '';
  const state = row.state || '';
  return {
    gstin: row.gstin,
    legalName: row.legalName || 'Unknown Business',
    tradeName: row.tradeName || row.legalName || '',
    status: row.status || 'UNKNOWN',
    constitution: row.constitution || '',
    taxpayerType: row.taxpayerType || 'Regular',
    registrationDate: row.registrationDate || '',
    pan: row.pan || '',
    address,
    state,
    ...deriveLocation(address, state),
    natureOfBusiness: Array.isArray(row.natureOfBusiness) ? row.natureOfBusiness : [],
  };
}

// Server-side GSTIN lookup for the setup wizard's "fetch details" auto-fill.
// GstVerify itself also caches, but our own row means a repeat lookup (any
// user, any franchise) never spends another upstream credit.
export class GstinLookupService {
  static async verify(gstinRaw: string, forceRefresh = false): Promise<{ details: GstinDetails; cached: boolean }> {
    const gstin = gstinRaw.trim().toUpperCase();
    if (!isValidGstin(gstin)) {
      throw new ApiError(400, 'Invalid GSTIN format. Must be a 15-character alphanumeric code.');
    }

    if (!forceRefresh) {
      const cached = await db.gstinCache.findUnique({ where: { gstin } });
      if (cached) {
        return { details: toDetails(cached), cached: true };
      }
    }

    const apiKey = env.GSTVERIFY_API_KEY;
    if (!apiKey) {
      throw new ApiError(500, 'GSTVERIFY_API_KEY is not configured on the server.');
    }

    const response = await fetch(`${GSTVERIFY_BASE_URL}/${gstin}`, {
      headers: { 'X-API-Key': apiKey },
    });

    const body = await response.json().catch(() => ({} as any));

    if (response.status !== 200 || !body?.success) {
      const message = body?.error || `GSTVerify lookup failed (${response.status})`;
      // 429 (rate limit) is worth surfacing as-is; everything else (bad/expired
      // key, no credits, upstream GST outage) is a server-side problem, not
      // the caller's, so it comes back as a generic upstream failure.
      throw new ApiError(response.status === 429 ? 429 : 502, message);
    }

    const raw = body.data || {};
    const address = raw.address || '';
    const state = raw.state || '';
    const details: GstinDetails = {
      gstin: raw.gstin || gstin,
      legalName: raw.legal_name || raw.trade_name || 'Unknown Business',
      tradeName: raw.trade_name || raw.legal_name || '',
      status: raw.status || 'UNKNOWN',
      constitution: raw.constitution || '',
      taxpayerType: raw.taxpayer_type || 'Regular',
      registrationDate: raw.registration_date || '',
      pan: raw.pan || '',
      address,
      state,
      ...deriveLocation(address, state),
      natureOfBusiness: Array.isArray(raw.nature_of_business) ? raw.nature_of_business : [],
    };

    // city/pinCode are derived, not persisted — only store what GstVerify actually returned.
    await db.gstinCache.upsert({
      where: { gstin },
      create: {
        gstin,
        legalName: details.legalName,
        tradeName: details.tradeName,
        status: details.status,
        constitution: details.constitution,
        taxpayerType: details.taxpayerType,
        registrationDate: details.registrationDate,
        pan: details.pan,
        address: details.address,
        state: details.state,
        natureOfBusiness: details.natureOfBusiness,
        raw,
      },
      update: {
        legalName: details.legalName,
        tradeName: details.tradeName,
        status: details.status,
        constitution: details.constitution,
        taxpayerType: details.taxpayerType,
        registrationDate: details.registrationDate,
        pan: details.pan,
        address: details.address,
        state: details.state,
        natureOfBusiness: details.natureOfBusiness,
        raw,
      },
    });

    return { details, cached: false };
  }
}
