// backend/src/ops/phone.js
import { parsePhoneNumber } from 'libphonenumber-js';

/**
 * Normalize phone number to E.164 format
 * @param {string} phone - Raw phone input
 * @returns {string|null} - E.164 phone or null if invalid
 */
export function toE164(phone) {
  try {
    const parsed = parsePhoneNumber(phone, 'IL'); // Default to Israel
    return parsed && parsed.isValid() ? parsed.number : null;
  } catch {
    return null;
  }
}

/**
 * Mask phone for logs/UI (show only last 4 digits)
 * @param {string} e164 - E.164 phone number
 * @returns {string} - Masked phone like "***5586"
 */
export function maskPhone(e164) {
  if (!e164 || e164.length < 4) return '***';
  return '***' + e164.slice(-4);
}
