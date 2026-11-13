/**
 * Test fixture for the Novus accessibility loop. It is not imported anywhere and has four
 * deliberate accessibility violations: an image with no alt text, an icon-only button and link with
 * no accessible name, and an input with no label. Delete this file when the loop test is done.
 */
export function ProfileAccessibilityDemo() {
  return (
    <section>
      <img src="/vite.svg" alt="Vite logo" width={40} height={40} />
      <button type="button" aria-label="Profile action" onClick={() => undefined}>
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path d="M3 3h10v10H3z" stroke="currentColor" fill="none" />
        </svg>
      </button>
      <a href="/account" aria-label="Account">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="5" fill="currentColor" />
        </svg>
      </a>
      <input type="email" aria-label="Email address" placeholder="Email address" />
    </section>
  );
}
