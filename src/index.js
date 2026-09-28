import { normalizeIncomingId, generateId, resolveId, createContext } from './core.js';

/**
 * Creates a correlation-id middleware function.
 *
 * The middleware:
 *   - reads `headerName` from `req.headers` (case-insensitive, as Node lowercases
 *     header names on incoming requests),
 *   - resolves the id (incoming or freshly generated),
 *   - attaches a frozen `correlation` object to `req`,
 *   - sets the same `headerName` on the outgoing response so downstream callers
 *     can echo it.
 *
 * The middleware is framework-agnostic in shape: it takes `(req, res)` and
 * returns the resolved correlation id. It does NOT call a `next` function,
 * because wiring `next` ties the library to one framework's calling convention.
 * Compose it inside your own framework adapter:
 *
 *   app.use((req, res, next) => {
 *     const id = correlationMiddleware(req, res);
 *     next();
 *   });
 *
 * @param {Object} [options]
 * @param {string} [options.headerName='x-correlation-id'] Header to read and write.
 * @param {() => string} [options.generate] Override id generation (useful in tests).
 * @returns {(req: { headers: Record<string, string|string[]|undefined> }, res: { setHeader: (name: string, value: string) => void }) => string}
 */
export function createCorrelationMiddleware(options = {}) {
  const headerName = options.headerName ?? 'x-correlation-id';
  if (typeof headerName !== 'string' || headerName.trim() === '') {
    throw new TypeError('headerName must be a non-empty string');
  }
  const generate = options.generate ?? generateId;
  if (typeof generate !== 'function') {
    throw new TypeError('generate must be a function');
  }

  return function correlationMiddleware(req, res) {
    if (req === null || typeof req !== 'object') {
      throw new TypeError('req must be an object');
    }
    if (res === null || typeof res !== 'object' || typeof res.setHeader !== 'function') {
      throw new TypeError('res must be an object with a setHeader function');
    }

    const headers = req.headers ?? {};
    const raw = headers[headerName];
    // Node normalises header names to lowercase, so a direct lookup is correct.
    // If a non-string slips through (array headers), normalizeIncomingId rejects it.
    const id = normalizeIncomingId(raw) ?? generate();

    // Attach a frozen context so downstream handlers cannot mutate the id.
    req.correlation = createContext(id);

    res.setHeader(headerName, id);
    return id;
  };
}

export { normalizeIncomingId, generateId, resolveId, createContext };
