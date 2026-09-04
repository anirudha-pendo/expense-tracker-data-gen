import type React from "react";

export class AbortError extends Error {
  constructor() {
    super("Bot aborted");
    this.name = "AbortError";
  }
}

export function sleep(ms: number, abortRef?: React.MutableRefObject<boolean>): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (abortRef) {
      const interval = setInterval(() => {
        if (abortRef.current) {
          clearTimeout(timer);
          clearInterval(interval);
          reject(new AbortError());
        }
      }, 50);
      setTimeout(() => clearInterval(interval), ms + 100);
    }
  });
}

export function checkAbort(abortRef: React.MutableRefObject<boolean>) {
  if (abortRef.current) throw new AbortError();
}

export function waitFor(
  selector: string,
  doc: Document,
  timeout = 6000
): Promise<Element> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    const interval = setInterval(() => {
      const el = doc.querySelector(selector);
      if (el) {
        clearInterval(interval);
        resolve(el);
      } else if (Date.now() > deadline) {
        clearInterval(interval);
        reject(new Error(`waitFor timeout: "${selector}"`));
      }
    }, 100);
  });
}

export function waitForText(
  text: string,
  doc: Document,
  timeout = 6000
): Promise<Element> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    const interval = setInterval(() => {
      const all = doc.querySelectorAll("button, a, h1, h2, label, span, p");
      for (const el of all) {
        if (el.textContent?.trim().includes(text)) {
          clearInterval(interval);
          resolve(el);
          return;
        }
      }
      if (Date.now() > deadline) {
        clearInterval(interval);
        reject(new Error(`waitForText timeout: "${text}"`));
      }
    }, 100);
  });
}

// Simulate typing into a React-controlled input
export function setReactInput(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  win: Window
): void {
  const proto = el instanceof (win as Window & { HTMLTextAreaElement: typeof HTMLTextAreaElement }).HTMLTextAreaElement
    ? (win as Window & { HTMLTextAreaElement: typeof HTMLTextAreaElement }).HTMLTextAreaElement.prototype
    : (win as Window & { HTMLInputElement: typeof HTMLInputElement }).HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }
  const EventCtor = (win as Window & { Event: typeof Event }).Event;
  el.dispatchEvent(new EventCtor("input", { bubbles: true }));
  el.dispatchEvent(new EventCtor("change", { bubbles: true }));
}

// Click a Radix UI Select: open it, then pick an item by its text content
export async function clickRadixSelect(
  triggerId: string,
  itemText: string,
  doc: Document
): Promise<void> {
  const trigger = doc.querySelector(`#${triggerId}, button[id="${triggerId}"]`) as HTMLElement | null;
  if (!trigger) throw new Error(`Radix trigger not found: #${triggerId}`);
  trigger.click();

  // Items are rendered in a portal at document body level
  const item = await waitForText(itemText, doc, 4000);
  (item as HTMLElement).click();
}

// Click a Radix Select by its trigger element (when we have the element not id)
export async function clickRadixSelectByTrigger(
  trigger: HTMLElement,
  itemText: string,
  doc: Document
): Promise<void> {
  trigger.click();
  await sleep(200);
  // Items land in a portal; search whole doc
  const item = await waitForText(itemText, doc, 4000);
  (item as HTMLElement).click();
}

// Find and click a button whose visible text matches
export function clickButtonByText(text: string, doc: Document): boolean {
  const buttons = doc.querySelectorAll("button");
  for (const btn of buttons) {
    if (btn.textContent?.trim().includes(text) && !(btn as HTMLButtonElement).disabled) {
      (btn as HTMLButtonElement).click();
      return true;
    }
  }
  return false;
}

// Navigate via a real <a> link click so analytics fires
export function clickNavLink(href: string, doc: Document): boolean {
  const link = doc.querySelector(`a[href="${href}"]`) as HTMLElement | null;
  if (link) {
    link.click();
    return true;
  }
  return false;
}

// Pick a random item from an array
export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}
