interface Pendo {
  track(event: string, properties?: Record<string, unknown>): void;
}

declare const pendo: Pendo | undefined;
