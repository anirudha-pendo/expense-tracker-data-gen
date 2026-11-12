/**
 * Test fixture for the Novus accessibility loop. It is not imported anywhere and has five
 * deliberate accessibility violations: an image with no alt text, two icon-only buttons and one
 * icon-only link with no accessible name, and an input with no label. Delete this file when the
 * loop test is done.
 */
export function SettingsAccessibilityDemo() {
  return (
    <section>
      <img src="/vite.svg" width={48} height={48} />
      <button type="button" aria-label="Status" onClick={() => undefined}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6" fill="currentColor" />
        </svg>
      </button>
      <button type="button" aria-label="Add" onClick={() => undefined}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 8h10M8 3v10" stroke="currentColor" />
        </svg>
      </button>
      <a href="/profile">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <rect x="2" y="2" width="12" height="12" fill="currentColor" />
        </svg>
      </a>
      <input type="text" aria-label="Display name" placeholder="Display name" />
    </section>
  );
}
