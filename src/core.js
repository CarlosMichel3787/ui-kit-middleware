/**
 * Core correlation-id logic, independent of any HTTP framework.
 *
 * Design decisions (stated plainly so the tests and README agree):
 *
 * 1. The correlation id is read from exactly one request header, configured via
 *    `headerName`. We do not fall back across multiple header names. Real-world
 *    systems that try several headers ("x-request-id", "x-correlation-id", ...)
 *    end up with two ids in flight when two of those headers are set by different
 *    upstream proxies. One header, one id. If you need to accept several, rename
 *    the header at your ingress and keep one canonical name inside the service.
 *
 * 2. An incoming header value is used as-is after trimming surrounding whitespace.
 *    We do NOT validate its format (UUID or otherwise). The brief says "reads an
 *    incoming correlation id header OR generates a new uuid" — it does not say
 *    "rejects malformed ids". Re-formatting or rejecting upstream ids breaks
 *    trace continuity with systems that use their own id scheme. If the value is
 *    empty after trimming, we generate a new one, because an empty id is not a
 *    usable correlation handle.
 *
 * 3. The per-request context is a plain object scoped to the middleware call.
 *    We deliberately avoid AsyncLocalStorage: it is a Node global-side-effect and
 *    makes the library harder to reason about and test. The context object is
 *    returned from the middleware and the caller is expected to thread it through
 *    to handlers that need the id. This is more explicit and works in any runtime.
 *
 * 4. UUID generation uses `crypto.randomUUID()` (Web Crypto, available in Node
 *    >= 14.17 and all evergreen browsers). No third-party uuid package.
 */

/**
 * @typedef {Object} CorrelationContext
 * @property {string} correlationId The id resolved for this request.
 */

/**
 * Trims and validates an incoming header value.
 *
 * Returns the cleaned value if it is a non-empty string after trimming,
 * otherwise null. We treat an empty/whitespace-only header as "no id provided"
 * rather than as an error, because proxies sometimes forward empty values.
 *
 * @param {string|undefined} value
 * @returns {string|null}
 */
export function normalizeIncomingId(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Generates a fresh v4 UUID using the platform's Web Crypto implementation.
 *
 * @returns {string}
 */
export function generateId() {
  return crypto.randomUUID();
}

/**
 * Resolves the correlation id for a request: use the incoming header if present
 * and non-empty, otherwise generate a new UUID.
 *
 * @param {string|undefined} headerValue
 * @returns {string}
 */
export function resolveId(headerValue) {
  return normalizeIncomingId(headerValue) ?? generateId();
}

/**
 * Creates a correlation context object for a single request.
 *
 * Kept as its own function so callers can build a context without going through
 * the HTTP middleware (e.g. in tests or in non-HTTP entry points).
 *
 * @param {string} correlationId
 * @returns {CorrelationContext}
 */
export function createContext(correlationId) {
  return Object.freeze({ correlationId });
}
