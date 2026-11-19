/**
 * Test fixture for the Novus accessibility loop. It is not imported anywhere. It has deliberate
 * violations: an image with no alt text, an icon-only button, an icon-only role="button" element and
 * an icon-only link with no accessible name, and a select and a date input with no label. It also
 * has controls that are fine (an image with alt text, a labelled search input, a button and a link
 * with a name), which the scan should leave alone, and a heading that skips a level, which is below
 * the default minimum impact. Delete this file when the loop test is done.
 */
export function ReportsAccessibilityDemo() {
  return (
    <section>
      <h2>Reports</h2>
      <h4>Totals</h4>

      <img src="/icons.svg" width={96} height={64} />
      <img src="/favicon.svg" alt="Spending by category chart" width={96} height={64} />

      <button type="button" aria-label="Download" onClick={() => undefined}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 2v8M4 7l4 4 4-4M3 13h10" stroke="currentColor" fill="none" />
        </svg>
      </button>
      <div role="button" tabIndex={0} aria-label="Reload" onClick={() => undefined}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2 8a6 6 0 1 1 2 4.5" stroke="currentColor" fill="none" />
        </svg>
      </div>
      <button type="button" aria-label="Refresh" onClick={() => undefined}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M14 8a6 6 0 1 1-2-4.5" stroke="currentColor" fill="none" />
        </svg>
      </button>

      <a href="/reports/export">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path d="M3 13V3h7l3 3v7z" stroke="currentColor" fill="none" />
        </svg>
      </a>
      <a href="/reports/archive">Archive</a>

      <select defaultValue="monthly">
        <option value="monthly">Monthly</option>
        <option value="weekly">Weekly</option>
      </select>
      <input type="date" />
      <label htmlFor="reports-search">Search reports</label>
      <input id="reports-search" type="search" />
    </section>
  );
}
