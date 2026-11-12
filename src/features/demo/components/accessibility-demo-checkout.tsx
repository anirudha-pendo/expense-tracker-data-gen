/**
 * Test fixture for the Novus accessibility loop. It is not imported anywhere and has six
 * deliberate accessibility violations: two images with no alt text, two icon-only buttons and one
 * icon-only link with no accessible name, and an input with no label. Delete this file when the
 * loop test is done.
 */
export function CheckoutAccessibilityDemo() {
  return (
    <section>
      <img src="/vite.svg" width={32} height={32} alt="Vite logo" />
      <img src="/vite.svg" width={64} height={64} alt="" />
      <button type="button" aria-label="Add" onClick={() => undefined}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 2v12M2 8h12" stroke="currentColor" />
        </svg>
      </button>
      <button type="button" aria-label="Close" onClick={() => undefined}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" />
        </svg>
      </button>
      <a href="/receipts" aria-label="Receipts">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3" y="2" width="10" height="12" fill="currentColor" />
        </svg>
      </a>
      <input type="number" placeholder="Amount" aria-label="Amount" />
    </section>
  );
}
