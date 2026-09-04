// Writes a persona's identity and full transaction history straight into
// IndexedDB (and the matching localStorage session) before any UI
// interaction happens, so a fresh headless browser comes up already signed
// in as a returning user instead of signing up a brand-new account. This is
// the single load-bearing trick that keeps the analytics agent from seeing
// every bot session as a new visitor with zero retention.
//
// `page.evaluate` callbacks run inside the browser, not Node — they cannot
// close over anything from this module's scope (imports, other functions,
// outer variables). Everything the callback needs is therefore passed in as
// one serialisable argument, and the callback re-implements the PBKDF2
// hashing (`src/lib/crypto.ts`) and the IndexedDB upgrade handler
// (`src/lib/db/client.ts`) inline. Keep both in lockstep with those files —
// see the constants and comments below for exactly what each mirrors.

import type { Page } from "playwright";
import { APP_URL, SEED_LANDMARK_TIMEOUT_MS } from "./config";
import { buildSeedData, type Persona, type SeedData } from "./personas";

// Mirrors src/lib/db/client.ts's DB_NAME / DB_VERSION exactly. Drifting from
// these means the app either fails to open the database this seeds, or opens
// a different, empty one.
const DB_NAME = "expense-tracker";
const DB_VERSION = 2;

// Mirrors the key in src/lib/session.ts exactly.
const SESSION_STORAGE_KEY = "expense_tracker_session";

/** Everything the in-browser evaluate callback needs, bundled into one structured-cloneable argument. */
interface SeedPayload {
  seed: SeedData;
  password: string;
  dbName: string;
  dbVersion: number;
  sessionStorageKey: string;
}

/**
 * Navigates to the app, writes `persona`'s full seed data (user, workspace,
 * categories, transactions, budgets, goals) into IndexedDB, hashes their
 * password with the app's own PBKDF2 parameters, writes the matching
 * localStorage session, then reloads and waits for the authenticated
 * dashboard to actually render.
 */
export async function seedPersona(page: Page, persona: Persona): Promise<void> {
  // Navigate first so IndexedDB/localStorage writes land on the app's own
  // origin — they're origin-scoped, and a page that has never navigated
  // anywhere has no meaningful origin to seed.
  await page.goto(APP_URL);

  const seed = buildSeedData(persona, new Date());

  const payload: SeedPayload = {
    seed,
    password: persona.password,
    dbName: DB_NAME,
    dbVersion: DB_VERSION,
    sessionStorageKey: SESSION_STORAGE_KEY,
  };

  await page.evaluate(async (arg: SeedPayload) => {
    const { seed, password, dbName, dbVersion, sessionStorageKey } = arg;

    // `tsx` (this repo's TS runner — see bot/package.json) transpiles via
    // esbuild with `keepNames` forced on, which wraps every named function
    // declaration/const-bound function with a call to a `__name` helper
    // defined once at module scope. `page.evaluate` serialises this whole
    // callback via `.toString()` and runs it standalone in the browser, so
    // that helper is never included — a named function anywhere in this
    // callback throws `ReferenceError: __name is not defined` at runtime.
    // Object-literal methods and property-assigned anonymous functions are
    // NOT wrapped, so `hex.encode` below (not a standalone `function
    // bufferToHex(...)`) and the `request.onXyz = () => {...}` assignments
    // further down are deliberate, verified-safe shapes — don't "clean
    // these up" into named helper functions.
    const hex = {
      encode(buffer: ArrayBuffer): string {
        return Array.from(new Uint8Array(buffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      },
    };

    // --- PBKDF2 hashing — mirrors src/lib/crypto.ts's hashPassword exactly:
    // SHA-256, 100,000 iterations, 256 derived bits, a 16-byte salt, hex
    // encoding of both hash and salt. ------------------------------------
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const passwordKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const derivedBits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: saltBytes.buffer, iterations: 100000, hash: "SHA-256" },
      passwordKey,
      256,
    );
    seed.user.passwordHash = hex.encode(derivedBits);
    seed.user.salt = hex.encode(saltBytes.buffer);

    // --- IndexedDB — mirrors src/lib/db/client.ts's upgrade handler
    // exactly: same stores, same keyPaths, same indexes (including the
    // unique constraints). The `objectStoreNames.contains` guards make this
    // idempotent if the bot ever re-seeds into a database it already
    // created, without changing the resulting schema. --------------------
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(dbName, dbVersion);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains("users")) {
          const userStore = db.createObjectStore("users", { keyPath: "id" });
          userStore.createIndex("by-username", "username", { unique: true });
        }
        if (!db.objectStoreNames.contains("workspaces")) {
          const workspaceStore = db.createObjectStore("workspaces", { keyPath: "id" });
          workspaceStore.createIndex("by-userId", "userId");
        }
        if (!db.objectStoreNames.contains("transactions")) {
          const transactionStore = db.createObjectStore("transactions", { keyPath: "id" });
          transactionStore.createIndex("by-workspaceId", "workspaceId");
          transactionStore.createIndex("by-date", "date");
        }
        if (!db.objectStoreNames.contains("categories")) {
          const categoryStore = db.createObjectStore("categories", { keyPath: "id" });
          categoryStore.createIndex("by-workspaceId", "workspaceId");
        }
        if (!db.objectStoreNames.contains("goals")) {
          const goalStore = db.createObjectStore("goals", { keyPath: "id" });
          goalStore.createIndex("by-workspaceId", "workspaceId");
        }
        if (!db.objectStoreNames.contains("budgets")) {
          const budgetStore = db.createObjectStore("budgets", { keyPath: "id" });
          budgetStore.createIndex("by-workspaceId", "workspaceId");
          budgetStore.createIndex("by-categoryId", "categoryId", { unique: true });
        }
        // Not populated here (SeedData carries no attachments — Blob fields
        // are never seeded), but the store must still exist: the real app
        // opens this same database at the same version and would otherwise
        // hit a missing object store the first time it touches attachments.
        if (!db.objectStoreNames.contains("attachments")) {
          const attachmentStore = db.createObjectStore("attachments", { keyPath: "id" });
          attachmentStore.createIndex("by-workspaceId", "workspaceId");
          attachmentStore.createIndex("by-transactionId", "transactionId");
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(
          ["users", "workspaces", "categories", "transactions", "budgets", "goals"],
          "readwrite",
        );

        tx.objectStore("users").put(seed.user);
        tx.objectStore("workspaces").put(seed.workspace);
        for (const category of seed.categories) tx.objectStore("categories").put(category);
        for (const transaction of seed.transactions) tx.objectStore("transactions").put(transaction);
        for (const budget of seed.budgets) tx.objectStore("budgets").put(budget);
        for (const goal of seed.goals) tx.objectStore("goals").put(goal);

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };

      request.onerror = () => reject(request.error);
    });

    localStorage.setItem(
      sessionStorageKey,
      JSON.stringify({ userId: seed.user.id, workspaceId: seed.workspace.id }),
    );
  }, payload);

  // The app renders /sign-in first and only redirects to the dashboard once
  // its session bootstrap (localStorage -> IndexedDB) resolves; its route
  // guards render nothing while loading. Waiting on the reload's navigation
  // response would race that redirect, so wait for the authenticated
  // dashboard's own landmarks to appear instead: the page heading, and the
  // "Income" summary-card label that only renders once dashboard data has
  // actually loaded from IndexedDB.
  await page.reload();
  await page.getByRole("heading", { name: "Dashboard", level: 1 }).waitFor({ timeout: SEED_LANDMARK_TIMEOUT_MS });
  await page.getByText("Income", { exact: true }).first().waitFor({ timeout: SEED_LANDMARK_TIMEOUT_MS });
}

/**
 * Deletes the app's IndexedDB database and clears localStorage, so the next
 * navigation lands on a genuinely empty, signed-out app — the new-visitor
 * path.
 */
export async function clearBrowserState(page: Page): Promise<void> {
  await page.goto(APP_URL);

  // Not `indexedDB.deleteDatabase()` from inside the page: the app's own
  // `getDB()` (src/lib/db/client.ts) caches a single connection in a
  // module-level variable, but nothing stops its several data-fetching
  // hooks from all calling `getDB()` concurrently on first mount before
  // that variable is set — each such race opens its own independent
  // IDBDatabase connection, and only the last one survives in the cache.
  // The app's `blocking()` handler closes whichever connection is
  // currently cached, but any earlier, now-unreferenced connection from
  // that race is never told to close, and a `deleteDatabase()` call waits
  // indefinitely (spec behaviour, not a failure) for every open connection
  // to close — verified live: it hangs forever in exactly this app.
  // Clearing storage through the DevTools protocol instead acts below the
  // page's JS entirely, so it isn't affected by that connection leak.
  const cdpSession = await page.context().newCDPSession(page);
  await cdpSession.send("Storage.clearDataForOrigin", {
    origin: new URL(APP_URL).origin,
    storageTypes: "indexeddb,local_storage",
  });
}
