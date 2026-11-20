/**
 * Test fixture for the Novus accessibility loop. It is not imported anywhere. It has deliberate
 * violations: an image and an svg with role="img" and no accessible name, an icon-only button and
 * link with no accessible name, and a textarea, a checkbox and a text input with no label. It also
 * has controls that are fine (a wrapped label, a button with text, an image with empty alt text for
 * decoration), which the scan should leave alone. Delete this file when the loop test is done.
 */
export function BillingAccessibilityDemo() {
  return (
    <div>
      <img src="/favicon.svg" width={24} height={24} />
      <img src="/icons.svg" alt="" width={24} height={24} />
      <svg role="img" width="20" height="20" viewBox="0 0 20 20">
        <rect x="2" y="4" width="16" height="12" rx="2" fill="currentColor" />
      </svg>

      <button type="button" onClick={() => undefined}>
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path d="M3 4h10M6 4V2h4v2M5 4v9h6V4" stroke="currentColor" fill="none" />
        </svg>
      </button>
      <button type="button" onClick={() => undefined}>
        Pay invoice
      </button>

      <a href="/billing/invoices/42">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path d="M6 3l5 5-5 5" stroke="currentColor" fill="none" />
        </svg>
      </a>

      <textarea placeholder="Note for the invoice" rows={3} />
      <label>
        <input type="checkbox" defaultChecked />
        Email me a receipt
      </label>
      <input type="text" placeholder="Card holder name" autoComplete="cc-name" />
      <label>
        Billing email
        <input type="email" />
      </label>
    </div>
  );
}
