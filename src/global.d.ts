interface PendoVisitor {
  id: string;
  full_name?: string;
  [key: string]: string | number | boolean | undefined;
}

interface PendoOptions {
  visitor: PendoVisitor;
  account?: { id: string; [key: string]: string | number | boolean | undefined };
  location?: { transforms: unknown[] };
}

interface PendoSDK {
  initialize(options: PendoOptions): void;
  identify(options: PendoOptions): void;
  updateOptions(options: PendoOptions): void;
  clearSession(): void;
  track(eventName: string, properties?: Record<string, unknown>): void;
  pageLoad(): void;
}

declare const pendo: PendoSDK;
