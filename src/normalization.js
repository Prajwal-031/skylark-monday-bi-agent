export const emptyToNull = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
};

export function parseAmount(value) {
  const text = emptyToNull(value);
  if (!text) return null;
  const normalized = text.replace(/[,\s]/g, '').replace(/^[₹$€£]/, '').replace(/[^0-9.+-]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function parseDate(value) {
  const text = emptyToNull(value);
  if (!text) return null;
  // ISO is unambiguous. For slash dates, only accept an unambiguous day/month format.
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const date = new Date(`${text.slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(date.valueOf()) ? null : date;
  }
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const [day, month, year] = dmy.slice(1).map(Number);
    if (day > 12 && month <= 12) return new Date(Date.UTC(year, month - 1, day));
    if (month > 12 && day <= 12) return new Date(Date.UTC(year, day - 1, month));
    return null; // e.g. 09/10/2026 is ambiguous; preserve as invalid for auditability
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

export function canonicalLabel(value) {
  const text = emptyToNull(value);
  if (!text) return null;
  return text.toLowerCase().replace(/\s+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export const normalizeKey = (value) => (emptyToNull(value) || '').toLowerCase().replace(/[^a-z0-9]/g, '');
