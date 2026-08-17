/**
 * Floating "chat on WhatsApp" button, visible on every storefront page.
 *
 * The number comes from store settings so it can be changed from the
 * dashboard without a redeploy.
 */

import { trackContact } from '../lib/analytics';

const DEFAULT_NUMBER = '01400-290828';

/**
 * wa.me needs digits only, in full international form. Local Bangladeshi
 * numbers are written 01XXXXXXXXX — drop the leading zero and prefix 880.
 */
export function waLink(raw: string): string {
  let digits = (raw || DEFAULT_NUMBER).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('880')) return `https://wa.me/${digits}`;
  if (digits.startsWith('0')) return `https://wa.me/880${digits.slice(1)}`;
  if (digits.length === 10) return `https://wa.me/880${digits}`;
  return `https://wa.me/${digits}`;
}

export function WhatsAppIcon({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16.05 3.2c-7.06 0-12.8 5.74-12.8 12.79 0 2.25.59 4.45 1.71 6.39L3.14 28.8l6.6-1.73a12.76 12.76 0 0 0 6.3 1.64h.01c7.05 0 12.79-5.74 12.79-12.79 0-3.42-1.33-6.63-3.75-9.05a12.7 12.7 0 0 0-9.04-3.67Zm0 23.15h-.01a10.6 10.6 0 0 1-5.4-1.48l-.39-.23-4.02 1.05 1.07-3.92-.25-.4a10.6 10.6 0 0 1-1.63-5.68c0-5.86 4.77-10.63 10.64-10.63a10.6 10.6 0 0 1 7.51 3.12 10.56 10.56 0 0 1 3.11 7.52c0 5.86-4.77 10.64-10.63 10.64Z"
      />
      <path
        fill="currentColor"
        d="M21.88 18.66c-.32-.16-1.89-.93-2.18-1.04-.29-.11-.5-.16-.71.16-.21.32-.82 1.03-1 1.24-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.89-1.78-2.21-.18-.32-.02-.5.14-.66.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.71-1.73-.98-2.36-.26-.62-.52-.54-.71-.55l-.61-.01c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.65s1.14 3.08 1.3 3.29c.16.21 2.24 3.42 5.43 4.8.76.33 1.35.52 1.81.67.76.24 1.45.21 2 .13.61-.09 1.89-.77 2.15-1.52.27-.75.27-1.38.19-1.52-.08-.13-.29-.21-.61-.37Z"
      />
    </svg>
  );
}

export function WhatsAppButton({ number, storeName }: { number?: string; storeName?: string }) {
  const href = waLink(number ?? DEFAULT_NUMBER);
  const label = `Chat with ${storeName ?? 'Arif Gadgets'} on WhatsApp`;

  return (
    <a
      className="wa-fab"
      href={href}
      onClick={() => trackContact('whatsapp_float')}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
    >
      <WhatsAppIcon />
      <span className="wa-fab-text">Chat with us</span>
    </a>
  );
}
