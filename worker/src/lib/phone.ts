/**
 * Phone numbers are the shared secret for order tracking and the identity for
 * customer accounts, so the same number has to compare equal however it was
 * typed. Shoppers write +8801712345678, 8801712345678, 01712 345678 and
 * 01712-345678 interchangeably.
 */

/** Strips every separator, leaving digits only. */
function digitsOf(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Canonical Bangladeshi form: 01XXXXXXXXX. Numbers that do not look
 * Bangladeshi are returned as their digits, unchanged in length.
 */
export function normalisePhone(raw: string): string {
  let digits = digitsOf(raw);
  if (digits.startsWith('880')) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith('88') && digits.length === 13) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith('1')) digits = `0${digits}`;
  return digits;
}

export function validPhone(phone: string): boolean {
  return /^01[3-9]\d{8}$/.test(phone);
}

/**
 * SQL that reduces a stored phone column to digits, so a lookup still matches
 * rows written before numbers were normalised on the way in. SQLite has no
 * regex, hence the replace() chain — it covers every separator a phone number
 * realistically carries.
 */
export function digitsSql(column: string): string {
  const strip = ["' '", "'-'", "'+'", "'('", "')'", "'.'", "'/'"];
  return strip.reduce((sql, char) => `replace(${sql}, ${char}, '')`, column);
}

/**
 * Every digit string a stored number might legitimately be, given a canonical
 * one. Used with digitsSql() so old +880 rows and new 01… rows both resolve.
 */
export function phoneVariants(canonical: string): string[] {
  const variants = new Set([canonical]);
  if (canonical.startsWith('0')) {
    variants.add(`88${canonical}`);
    variants.add(canonical.slice(1));
    variants.add(`880${canonical.slice(1)}`);
  }
  return [...variants];
}
