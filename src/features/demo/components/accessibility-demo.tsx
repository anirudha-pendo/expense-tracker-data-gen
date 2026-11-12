/**
 * Test fixture for the Novus accessibility loop. It is not imported anywhere and has four
 * deliberate accessibility violations: an image with no alt text, an icon-only button and link with
 * no accessible name, and an input with no label. Delete this file when the loop test is done.
 */
export function AccessibilityLoopDemo() {
  return (
    <div>
      <img src="/vite.svg" alt="Vite logo" width={32} height={32} />
      <button type="button" aria-label="Close" onClick={() => undefined}>
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" />
        </svg>
      </button>
      <a href="/settings">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6" fill="currentColor" />
        </svg>
      </a>
      <input type="text" placeholder="Search" aria-label="Search" />
    </div>
  );
}
