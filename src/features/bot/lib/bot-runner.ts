import type React from "react";
import {
  AbortError,
  sleep,
  checkAbort,
  waitFor,
  setReactInput,
  clickRadixSelectByTrigger,
  clickButtonByText,
  clickNavLink,
  pick,
  randInt,
  rand,
} from "./dom-helpers";

// ── types ────────────────────────────────────────────────────────────────────

export interface BotConfig {
  totalActions: number;
}

export interface BotProgress {
  type: "info" | "action" | "success" | "error" | "done";
  message: string;
}

export type LogFn = (p: BotProgress) => void;

interface BotState {
  isLoggedIn: boolean;
  hasWorkspace: boolean;
  users: Array<{ username: string; password: string }>;
}

interface BotAction {
  name: string;
  weight: (state: BotState) => number;
  canRun: (state: BotState) => boolean;
  run: (
    iframe: HTMLIFrameElement,
    state: BotState,
    log: LogFn,
    abortRef: React.MutableRefObject<boolean>
  ) => Promise<void>;
}

// ── data pools ───────────────────────────────────────────────────────────────

const FIRST_NAMES = ["Alex","Jordan","Casey","Morgan","Riley","Taylor","Drew","Quinn","Avery","Blake","Charlie","Dana","Emery","Finley","Harper","Indigo","Jesse","Kai","Lane","Marlowe","Noel","Parker","Reese","Sage","Tatum","Val","Wren","Skyler","Robin","Cameron"];
const LAST_NAMES = ["Smith","Chen","Garcia","Kim","Patel","Johnson","Williams","Brown","Jones","Davis","Miller","Wilson","Moore","Anderson","Thomas","Jackson","White","Harris","Martin","Thompson","Young","Robinson","Lewis","Walker","Hall","Allen","Wright","Scott","Green"];
const WORKSPACE_NAMES = ["Personal Finance","My Budget","Monthly Expenses","Home Budget","Family Finances","Daily Tracker","Savings Plan","Expense Log","Money Matters","Cash Flow"];
const CURRENCIES = ["US Dollar (USD)","Euro (EUR)","British Pound (GBP)","Indian Rupee (INR)","Japanese Yen (JPY)","Canadian Dollar (CAD)","Australian Dollar (AUD)","Swiss Franc (CHF)","Chinese Yuan (CNY)"];
const LOCALES = ["English (US)","English (UK)","English (India)","German (Germany)","French (France)","Japanese (Japan)","Chinese (China)"];
const TX_DESCRIPTIONS = ["Coffee","Grocery run","Rent","Gas station","Restaurant","Online order","Gym","Pharmacy","Salary","Freelance payment","Utility bill","Movie tickets","Bus pass","Book store","Lunch","Haircut","Subscription","Donation","Clothes shopping","Doctor visit"];
const DISPLAY_NAMES_EXTRA = ["Sam Rivers","Lou Grant","Pat Kelly","Chris Vega","Jamie Stone","Devon Lee","Skyler Fox","Rowan Hunt","Blair West","Quinn Nash"];

// ── helpers ──────────────────────────────────────────────────────────────────

function weightedPick<T extends { weight: (s: BotState) => number }>(
  items: T[],
  state: BotState
): T {
  const weights = items.map((i) => i.weight(state));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function iframeDoc(iframe: HTMLIFrameElement): Document {
  const doc = iframe.contentDocument;
  if (!doc) throw new Error("iframe document not accessible");
  return doc;
}

function iframeWin(iframe: HTMLIFrameElement): Window {
  const win = iframe.contentWindow;
  if (!win) throw new Error("iframe window not accessible");
  return win;
}

function currentPath(iframe: HTMLIFrameElement): string {
  return iframeWin(iframe).location.pathname;
}

async function navigateTo(
  iframe: HTMLIFrameElement,
  href: string,
  landmarkSelector: string,
  abortRef: React.MutableRefObject<boolean>
): Promise<void> {
  const path = currentPath(iframe);
  if (path !== href) {
    // prefer real link click for analytics
    const clicked = clickNavLink(href, iframeDoc(iframe));
    if (!clicked) {
      // fallback: programmatic navigation
      iframeWin(iframe).history.pushState({}, "", href);
      iframeWin(iframe).dispatchEvent(new (iframeWin(iframe) as Window & { PopStateEvent: typeof PopStateEvent }).PopStateEvent("popstate", {}));
    }
    checkAbort(abortRef);
    await waitFor(landmarkSelector, iframeDoc(iframe), 6000);
  }
}

function randomDate(): string {
  const now = new Date();
  const past = new Date(now.getFullYear(), now.getMonth() - randInt(0, 5), randInt(1, 28));
  return past.toISOString().split("T")[0];
}

// ── action pool ───────────────────────────────────────────────────────────────

const ACTIONS: BotAction[] = [
  // ── signUp ──────────────────────────────────────────────────────────────
  {
    name: "signUp",
    weight: (s) => (s.users.length >= 2 ? 2 : 10),
    canRun: () => true,
    async run(iframe, state, log, abortRef) {
      log({ type: "action", message: "→ Sign up new user" });
      const win = iframeWin(iframe);
      const doc = iframeDoc(iframe);

      // navigate to sign-up
      const clicked = clickNavLink("/sign-up", doc) || clickButtonByText("Create account", doc);
      if (!clicked) {
        win.history.pushState({}, "", "/sign-up");
        win.dispatchEvent(new (win as Window & { PopStateEvent: typeof PopStateEvent }).PopStateEvent("popstate", {}));
      }
      checkAbort(abortRef);

      await waitFor("#displayName", doc, 6000);

      const firstName = pick(FIRST_NAMES);
      const lastName = pick(LAST_NAMES);
      const displayName = `${firstName} ${lastName}`;
      const username = `${firstName.toLowerCase()}${lastName.toLowerCase()}${randInt(10, 999)}`;
      const password = "BotPass@1";

      const displayNameEl = doc.querySelector("#displayName") as HTMLInputElement;
      const usernameEl = doc.querySelector("#username") as HTMLInputElement;
      const passwordEl = doc.querySelector("#password") as HTMLInputElement;
      const confirmEl = doc.querySelector("#confirmPassword") as HTMLInputElement;

      if (!displayNameEl || !usernameEl || !passwordEl || !confirmEl) throw new Error("Sign-up form fields not found");

      setReactInput(displayNameEl, displayName, win);
      await sleep(150, abortRef);
      setReactInput(usernameEl, username, win);
      await sleep(150, abortRef);
      setReactInput(passwordEl, password, win);
      await sleep(150, abortRef);
      setReactInput(confirmEl, password, win);
      await sleep(200, abortRef);

      clickButtonByText("Create account", doc);

      // wait for redirect to workspace setup or dashboard
      await waitFor("#workspace-name, [href='/transactions']", doc, 8000);

      state.users.push({ username, password });
      state.isLoggedIn = true;
      state.hasWorkspace = false;

      log({ type: "success", message: `✓ Signed up as ${username}` });
    },
  },

  // ── signIn ───────────────────────────────────────────────────────────────
  {
    name: "signIn",
    weight: () => 8,
    canRun: (s) => !s.isLoggedIn && s.users.length > 0,
    async run(iframe, state, log, abortRef) {
      log({ type: "action", message: "→ Sign in" });
      const win = iframeWin(iframe);
      const doc = iframeDoc(iframe);

      win.history.pushState({}, "", "/sign-in");
      win.dispatchEvent(new (win as Window & { PopStateEvent: typeof PopStateEvent }).PopStateEvent("popstate", {}));
      checkAbort(abortRef);

      await waitFor("#username", doc, 6000);

      const user = pick(state.users);
      const usernameEl = doc.querySelector("#username") as HTMLInputElement;
      const passwordEl = doc.querySelector("#password") as HTMLInputElement;
      if (!usernameEl || !passwordEl) throw new Error("Sign-in fields not found");

      setReactInput(usernameEl, user.username, win);
      await sleep(150, abortRef);
      setReactInput(passwordEl, user.password, win);
      await sleep(200, abortRef);

      clickButtonByText("Sign in", doc);
      await waitFor("[href='/transactions'], #workspace-name", doc, 8000);

      state.isLoggedIn = true;
      // check if workspace exists
      state.hasWorkspace = currentPath(iframe) !== "/setup-workspace";

      log({ type: "success", message: `✓ Signed in as ${user.username}` });
    },
  },

  // ── setupWorkspace ────────────────────────────────────────────────────────
  {
    name: "setupWorkspace",
    weight: () => 20,
    canRun: (s) => s.isLoggedIn && !s.hasWorkspace,
    async run(iframe, state, log, abortRef) {
      log({ type: "action", message: "→ Setup workspace" });
      const win = iframeWin(iframe);
      const doc = iframeDoc(iframe);

      await waitFor("#workspace-name", doc, 6000);

      const nameEl = doc.querySelector("#workspace-name") as HTMLInputElement;
      if (!nameEl) throw new Error("Workspace name field not found");

      setReactInput(nameEl, pick(WORKSPACE_NAMES), win);
      await sleep(200, abortRef);

      // currency select
      const currencyTrigger = doc.querySelector("#currency") as HTMLElement | null;
      if (currencyTrigger) {
        await clickRadixSelectByTrigger(currencyTrigger, pick(CURRENCIES), doc);
        await sleep(300, abortRef);
      }

      // locale select
      const localeTrigger = doc.querySelector("#locale") as HTMLElement | null;
      if (localeTrigger) {
        await clickRadixSelectByTrigger(localeTrigger, pick(LOCALES), doc);
        await sleep(300, abortRef);
      }

      clickButtonByText("Create Workspace", doc);
      await waitFor("[href='/transactions']", doc, 8000);

      state.hasWorkspace = true;
      log({ type: "success", message: "✓ Workspace created" });
    },
  },

  // ── navigateDashboard ─────────────────────────────────────────────────────
  {
    name: "navigateDashboard",
    weight: () => 5,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Navigate to Dashboard" });
      await navigateTo(iframe, "/", "h1", abortRef);
      await sleep(randInt(400, 800), abortRef);
      log({ type: "success", message: "✓ Viewing Dashboard" });
    },
  },

  // ── navigateTransactions ──────────────────────────────────────────────────
  {
    name: "navigateTransactions",
    weight: () => 5,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Navigate to Transactions" });
      await navigateTo(iframe, "/transactions", "h1", abortRef);
      await sleep(randInt(400, 800), abortRef);
      log({ type: "success", message: "✓ Viewing Transactions" });
    },
  },

  // ── navigateSettings ──────────────────────────────────────────────────────
  {
    name: "navigateSettings",
    weight: () => 4,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Navigate to Settings" });
      await navigateTo(iframe, "/settings", "h1", abortRef);
      await sleep(randInt(400, 800), abortRef);
      log({ type: "success", message: "✓ Viewing Settings" });
    },
  },

  // ── addTransaction ────────────────────────────────────────────────────────
  {
    name: "addTransaction",
    weight: () => 12,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Add transaction" });
      const doc = iframeDoc(iframe);
      const win = iframeWin(iframe);

      await navigateTo(iframe, "/transactions", "h1", abortRef);
      await sleep(300, abortRef);

      // click Add Transaction button
      clickButtonByText("Add Transaction", doc);
      await waitFor("#description", doc, 5000);
      await sleep(200, abortRef);

      // pick type tab randomly
      const type = Math.random() > 0.4 ? "Expense" : "Income";
      const tabs = doc.querySelectorAll('button[role="tab"]');
      for (const tab of tabs) {
        if (tab.textContent?.trim() === type) {
          (tab as HTMLElement).click();
          break;
        }
      }
      await sleep(200, abortRef);

      // description
      const descEl = doc.querySelector("#description") as HTMLInputElement | null;
      if (descEl) {
        setReactInput(descEl, pick(TX_DESCRIPTIONS), win);
        await sleep(150, abortRef);
      }

      // amount
      const amountEl = doc.querySelector("#amount") as HTMLInputElement | null;
      if (amountEl) {
        const amount = Math.round(rand(5, 500) * 100) / 100;
        setReactInput(amountEl, String(amount), win);
        await sleep(150, abortRef);
      }

      // date
      const dateEl = doc.querySelector("#date") as HTMLInputElement | null;
      if (dateEl) {
        setReactInput(dateEl, randomDate(), win);
        await sleep(150, abortRef);
      }

      // category — open the select and pick a visible item
      const categoryTrigger = doc.querySelector("#category") as HTMLElement | null;
      if (categoryTrigger) {
        categoryTrigger.click();
        await sleep(400, abortRef);
        // grab all visible dropdown items and pick one randomly
        const items = Array.from(doc.querySelectorAll("[data-radix-select-item], [role='option']")) as HTMLElement[];
        if (items.length > 0) {
          pick(items).click();
          await sleep(200, abortRef);
        } else {
          // close without picking
          doc.body.click();
        }
      }

      await sleep(200, abortRef);

      // submit
      const submitted = clickButtonByText("Add transaction", doc);
      if (!submitted) clickButtonByText("Save", doc);

      await sleep(800, abortRef);
      log({ type: "success", message: `✓ Added ${type.toLowerCase()} transaction` });
    },
  },

  // ── editTransaction ───────────────────────────────────────────────────────
  {
    name: "editTransaction",
    weight: () => 6,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Edit transaction" });
      const doc = iframeDoc(iframe);
      const win = iframeWin(iframe);

      await navigateTo(iframe, "/transactions", "h1", abortRef);
      await sleep(300, abortRef);

      // find action menu buttons (MoreHorizontal)
      const menuBtns = doc.querySelectorAll("table button[aria-haspopup], table button");
      const actionBtns = Array.from(menuBtns).filter(
        (b) => b.querySelector("svg") && b.textContent?.trim() === ""
      ) as HTMLElement[];

      if (actionBtns.length === 0) {
        log({ type: "info", message: "  No transactions to edit yet" });
        return;
      }

      pick(actionBtns).click();
      await sleep(300, abortRef);

      // click Edit in the dropdown
      const clicked = clickButtonByText("Edit", doc);
      if (!clicked) {
        doc.body.click();
        return;
      }

      await waitFor("#description", doc, 4000);
      await sleep(200, abortRef);

      // change description
      const descEl = doc.querySelector("#description") as HTMLInputElement | null;
      if (descEl) {
        setReactInput(descEl, pick(TX_DESCRIPTIONS) + " (edited)", win);
        await sleep(150, abortRef);
      }

      clickButtonByText("Save changes", doc);
      await sleep(600, abortRef);
      log({ type: "success", message: "✓ Edited transaction" });
    },
  },

  // ── deleteTransaction ─────────────────────────────────────────────────────
  {
    name: "deleteTransaction",
    weight: () => 4,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Delete transaction" });
      const doc = iframeDoc(iframe);

      await navigateTo(iframe, "/transactions", "h1", abortRef);
      await sleep(300, abortRef);

      const menuBtns = Array.from(
        doc.querySelectorAll("table button")
      ).filter((b) => b.querySelector("svg") && b.textContent?.trim() === "") as HTMLElement[];

      if (menuBtns.length === 0) {
        log({ type: "info", message: "  No transactions to delete yet" });
        return;
      }

      pick(menuBtns).click();
      await sleep(300, abortRef);

      const clicked = clickButtonByText("Delete", doc);
      if (!clicked) {
        doc.body.click();
        return;
      }

      // confirm dialog
      await sleep(400, abortRef);
      // AlertDialogAction has "Delete" text
      const allBtns = Array.from(doc.querySelectorAll("button")) as HTMLButtonElement[];
      const confirmBtn = allBtns.find(
        (b) => b.textContent?.trim() === "Delete" && !b.disabled
      );
      if (confirmBtn) confirmBtn.click();

      await sleep(600, abortRef);
      log({ type: "success", message: "✓ Deleted transaction" });
    },
  },

  // ── filterTransactions ────────────────────────────────────────────────────
  {
    name: "filterTransactions",
    weight: () => 7,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Filter transactions" });
      const doc = iframeDoc(iframe);
      const win = iframeWin(iframe);

      await navigateTo(iframe, "/transactions", "h1", abortRef);
      await sleep(300, abortRef);

      const searchEl = doc.querySelector('input[placeholder="Search transactions..."]') as HTMLInputElement | null;
      if (searchEl) {
        const term = pick(TX_DESCRIPTIONS).split(" ")[0];
        setReactInput(searchEl, term, win);
        await sleep(600, abortRef);
        log({ type: "success", message: `✓ Searched for "${term}"` });
      }
    },
  },

  // ── clearFilters ──────────────────────────────────────────────────────────
  {
    name: "clearFilters",
    weight: () => 3,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Clear filters" });
      const doc = iframeDoc(iframe);

      await navigateTo(iframe, "/transactions", "h1", abortRef);
      await sleep(300, abortRef);

      const clearBtn = doc.querySelector('button[aria-label="Clear filters"]') as HTMLElement | null;
      if (clearBtn) {
        clearBtn.click();
        await sleep(300, abortRef);
        log({ type: "success", message: "✓ Cleared filters" });
      } else {
        log({ type: "info", message: "  No filters to clear" });
      }
    },
  },

  // ── updateProfile ─────────────────────────────────────────────────────────
  {
    name: "updateProfile",
    weight: () => 3,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Update profile" });
      const doc = iframeDoc(iframe);
      const win = iframeWin(iframe);

      await navigateTo(iframe, "/settings", "h1", abortRef);
      await sleep(400, abortRef);

      const displayNameEl = doc.querySelector("#displayName") as HTMLInputElement | null;
      if (!displayNameEl) return;

      setReactInput(displayNameEl, pick(DISPLAY_NAMES_EXTRA), win);
      await sleep(200, abortRef);

      clickButtonByText("Save changes", doc);
      await sleep(600, abortRef);
      log({ type: "success", message: "✓ Profile updated" });
    },
  },

  // ── updateWorkspace ───────────────────────────────────────────────────────
  {
    name: "updateWorkspace",
    weight: () => 3,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Update workspace settings" });
      const doc = iframeDoc(iframe);
      const win = iframeWin(iframe);

      await navigateTo(iframe, "/settings", "h1", abortRef);
      await sleep(400, abortRef);

      const wsNameEl = doc.querySelector("#workspace-name") as HTMLInputElement | null;
      if (!wsNameEl) return;

      setReactInput(wsNameEl, pick(WORKSPACE_NAMES), win);
      await sleep(200, abortRef);

      // find all "Save changes" buttons — second one belongs to workspace form
      const saveBtns = Array.from(doc.querySelectorAll("button")).filter(
        (b) => b.textContent?.trim() === "Save changes" && !(b as HTMLButtonElement).disabled
      ) as HTMLButtonElement[];
      if (saveBtns.length >= 2) saveBtns[1].click();
      else if (saveBtns.length === 1) saveBtns[0].click();

      await sleep(600, abortRef);
      log({ type: "success", message: "✓ Workspace settings updated" });
    },
  },

  // ── signOut ───────────────────────────────────────────────────────────────
  {
    name: "signOut",
    weight: () => 2,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, state, log, abortRef) {
      log({ type: "action", message: "→ Sign out" });
      const doc = iframeDoc(iframe);

      const signOutBtn = doc.querySelector('button[aria-label="Sign out"]') as HTMLElement | null;
      if (signOutBtn) {
        signOutBtn.click();
        await sleep(800, abortRef);
        state.isLoggedIn = false;
        state.hasWorkspace = false;
        log({ type: "success", message: "✓ Signed out" });
      }
    },
  },
];

// ── main entry point ──────────────────────────────────────────────────────────

export async function runBot(
  iframe: HTMLIFrameElement,
  config: BotConfig,
  log: LogFn,
  abortRef: React.MutableRefObject<boolean>
): Promise<void> {
  const state: BotState = {
    isLoggedIn: false,
    hasWorkspace: false,
    users: [],
  };

  // reset iframe to start
  iframe.src = "/";
  await new Promise<void>((resolve) => {
    const onLoad = () => { iframe.removeEventListener("load", onLoad); resolve(); };
    iframe.addEventListener("load", onLoad);
    setTimeout(resolve, 3000);
  });

  log({ type: "info", message: `Starting bot — ${config.totalActions} actions` });

  for (let i = 0; i < config.totalActions; i++) {
    checkAbort(abortRef);

    // if we just signed up, workspace setup is mandatory next
    const forcedSetup = state.isLoggedIn && !state.hasWorkspace;
    const available = ACTIONS.filter((a) => {
      if (!a.canRun(state)) return false;
      if (forcedSetup && a.name !== "setupWorkspace") return false;
      return true;
    });

    if (available.length === 0) break;

    const action = weightedPick(available, state);

    try {
      await action.run(iframe, state, log, abortRef);
    } catch (err) {
      if (err instanceof AbortError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      log({ type: "error", message: `✗ ${action.name} failed: ${msg}` });
    }

    checkAbort(abortRef);
    await sleep(randInt(400, 900), abortRef);
  }

  log({ type: "done", message: `★ Bot finished — ${config.totalActions} actions, ${state.users.length} user(s) created` });
}
