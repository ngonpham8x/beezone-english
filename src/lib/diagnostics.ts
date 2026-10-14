/** Stable event codes are safe to log; raw exceptions may contain tokens or imported records. */
export function reportError(event: string, error: unknown): void {
  if (import.meta.env.DEV) console.error(`[BeeZone:${event}]`, error);
  else console.error(`[BeeZone:${event}]`);
}
