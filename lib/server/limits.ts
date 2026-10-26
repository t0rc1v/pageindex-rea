import "server-only";

/**
 * Limits for the endpoints that cost real money upstream.
 *
 * Overridable by environment so an operator can raise a plan's ceiling — and so
 * the test suite can run repeatedly against a development database without
 * tripping the production defaults. Anything non-positive or unparsable falls
 * back to the default rather than disabling the limit.
 */
function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const RATE_LIMITS = {
  /** Streaming completions per user. */
  chatPerMinute: positiveInt(process.env.RATE_LIMIT_CHAT_PER_MINUTE, 30),
  /** Uploads per user — each one indexes a document upstream. */
  uploadsPerHour: positiveInt(process.env.RATE_LIMIT_UPLOADS_PER_HOUR, 20),
  /** Conversation writes (save/rename/delete). */
  chatWritesPerMinute: positiveInt(process.env.RATE_LIMIT_CHAT_WRITES_PER_MINUTE, 240),
  /** Destructive "clear all conversations". */
  chatClearsPerHour: positiveInt(process.env.RATE_LIMIT_CHAT_CLEARS_PER_HOUR, 10),
};
