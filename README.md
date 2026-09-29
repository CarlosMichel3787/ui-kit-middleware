# correlation-id-middleware

Reads an incoming correlation id from a request header (or generates a new UUID) and attaches it to a per-request context plus the response header.

## Usage

```js
import { createCorrelationMiddleware } from 'correlation-id-middleware';

const middleware = createCorrelationMiddleware({
  headerName: 'x-correlation-id', // default
  generate: () => crypto.randomUUID(), // default
});

// Inside your framework adapter:
function handle(req, res, next) {
  const id = middleware(req, res);
  // req.correlation.correlationId is now set
  // res has the x-correlation-id header set
  next();
}
```

The middleware returns the resolved id string. `req.correlation` is a frozen object with a `correlationId` field.

## Why

Distributed services need a single id threaded through every hop so logs and traces line up. The two reasonable places to get it are an inbound header or a fresh UUID. This library does exactly that and nothing else: one header name, one id, written back on the response so the next hop can echo it.

The deliberate trade-off: we read exactly one header name and do not fall back across `x-request-id`, `x-correlation-id`, `trace-id`, etc. Systems that try several headers end up with two ids in flight when two of those headers are set by different upstream proxies. If you need to accept several, rename at your ingress and keep one canonical name inside the service.

## Edge cases

- An incoming header that is empty or whitespace-only is treated as "no id provided" and a new UUID is generated. Proxies sometimes forward empty values.
- The incoming value is trimmed but otherwise used verbatim. We do not validate that it is a UUID, because reformatting or rejecting upstream ids breaks trace continuity with systems that use their own id scheme.
- `req.correlation` is frozen. Downstream handlers cannot mutate the id by accident.
- The middleware does not call a `next` function. Wrap it in your framework's own adapter so the library stays framework-agnostic.

## Exports

- `createCorrelationMiddleware(options?)` — returns `(req, res) => string`.
- `normalizeIncomingId(value)` — returns a trimmed string or `null`.
- `resolveId(headerValue)` — returns the incoming id or a freshly generated UUID.
- `createContext(correlationId)` — returns a frozen `{ correlationId }` object.
- `generateId()` — returns `crypto.randomUUID()`.

## Tests

```
node --test
```
