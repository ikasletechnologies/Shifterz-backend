// WTY-01C (D-W1, locked) — pure resolution logic for defaulting an
// invoice's warranty from the Service Master's standard warranty when
// billing doesn't explicitly supply one. Kept separate from the DB lookup
// (building the name->warranty map) so the actual resolution decision is
// testable without a live database.
//
// Services are referenced throughout this codebase by name, not by a
// serviceId foreign key (Invoice.items/Job.services are both untyped JSON
// blobs keyed by name/desc, confirmed during the WTY-01 audit) — this is
// the same lookup convention already used everywhere else for this
// problem, not a new one invented for warranty.
export interface InvoiceLineItemLike {
  name?: string;
  desc?: string;
  warranty?: string | null;
  [key: string]: unknown;
}

function normalizeServiceName(name: string | undefined | null): string {
  return (name || '').trim().toLowerCase();
}

function hasExplicitWarranty(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

// A line item's own explicit warranty (if billing set one) always wins —
// this is what "preserve an explicit billing override" means. Only an
// empty/missing value is defaulted from the Service Master.
export function resolveLineItemWarranty(
  item: InvoiceLineItemLike,
  serviceWarrantyByName: Map<string, string>
): string | undefined {
  if (hasExplicitWarranty(item.warranty)) return item.warranty as string;
  const key = normalizeServiceName(item.name || item.desc);
  if (!key) return undefined;
  return serviceWarrantyByName.get(key);
}

export function resolveInvoiceLevelWarranty(
  explicitWarranty: string | null | undefined,
  serviceName: string | undefined,
  serviceWarrantyByName: Map<string, string>
): string | null | undefined {
  if (hasExplicitWarranty(explicitWarranty)) return explicitWarranty;
  const key = normalizeServiceName(serviceName);
  if (!key) return explicitWarranty;
  return serviceWarrantyByName.get(key) ?? explicitWarranty;
}

export interface ServiceWarrantyDefaultResult {
  items: InvoiceLineItemLike[] | undefined;
  warranty: string | null | undefined;
}

// Applies the Service Master default to every line item AND the
// invoice-level warranty field. Called once per invoice at creation; if no
// matching Service is found for a given name, the field is left exactly as
// it was (no invented value) — generateFromInvoice's own last-resort
// hardcoded fallback remains the safety net for that case, unchanged.
export function applyServiceWarrantyDefaults(
  items: InvoiceLineItemLike[] | undefined,
  invoiceService: string | undefined,
  invoiceWarranty: string | null | undefined,
  serviceWarrantyByName: Map<string, string>
): ServiceWarrantyDefaultResult {
  const resolvedItems = items?.map((item) => {
    const resolved = resolveLineItemWarranty(item, serviceWarrantyByName);
    return resolved !== undefined ? { ...item, warranty: resolved } : item;
  });

  const resolvedWarranty = resolveInvoiceLevelWarranty(invoiceWarranty, invoiceService, serviceWarrantyByName);

  return { items: resolvedItems, warranty: resolvedWarranty };
}
