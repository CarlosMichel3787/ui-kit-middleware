import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCorrelationMiddleware,
  normalizeIncomingId,
  resolveId,
  createContext,
} from '../src/index.js';

describe('normalizeIncomingId', () => {
  test('returns a trimmed non-empty string unchanged', () => {
    assert.equal(normalizeIncomingId('abc-123'), 'abc-123');
  });

  test('trims surrounding whitespace', () => {
    assert.equal(normalizeIncomingId('  abc-123  '), 'abc-123');
  });

  test('returns null for an empty string', () => {
    assert.equal(normalizeIncomingId(''), null);
  });

  test('returns null for a whitespace-only string', () => {
    assert.equal(normalizeIncomingId('   '), null);
  });

  test('returns null for undefined', () => {
    assert.equal(normalizeIncomingId(undefined), null);
  });

  test('returns null for non-string types (e.g. array headers)', () => {
    assert.equal(normalizeIncomingId(['a', 'b']), null);
    assert.equal(normalizeIncomingId(42), null);
    assert.equal(normalizeIncomingId(null), null);
  });
});

describe('resolveId', () => {
  test('uses the incoming id when present', () => {
    assert.equal(resolveId('incoming-1'), 'incoming-1');
  });

  test('generates an id when the header is missing', () => {
    const id = resolveId(undefined);
    assert.equal(typeof id, 'string');
    assert.ok(id.length > 0, 'generated id should be non-empty');
    // crypto.randomUUID() returns a 36-char v4 UUID. We assert the shape we
    // actually produce rather than a looser "is a string" check.
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  test('generates an id when the header is empty after trim', () => {
    const id = resolveId('   ');
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});

describe('createContext', () => {
  test('exposes the correlation id and is frozen', () => {
    const ctx = createContext('id-7');
    assert.equal(ctx.correlationId, 'id-7');
    assert.ok(Object.isFrozen(ctx));
  });
});

function makeReqRes(headerValue) {
  const headers = {};
  if (headerValue !== undefined) headers['x-correlation-id'] = headerValue;
  const setHeaders = {};
  const req = { headers };
  const res = {
    setHeader(name, value) { setHeaders[name] = value; },
    _setHeaders: setHeaders,
  };
  return { req, res, setHeaders };
}

describe('createCorrelationMiddleware', () => {
  test('uses the incoming header value and echoes it on the response', () => {
    const middleware = createCorrelationMiddleware();
    const { req, res, setHeaders } = makeReqRes('upstream-9');
    const id = middleware(req, res);
    assert.equal(id, 'upstream-9');
    assert.equal(req.correlation.correlationId, 'upstream-9');
    assert.equal(setHeaders['x-correlation-id'], 'upstream-9');
  });

  test('trims the incoming header value', () => {
    const middleware = createCorrelationMiddleware();
    const { req, res, setHeaders } = makeReqRes('  upstream-9  ');
    const id = middleware(req, res);
    assert.equal(id, 'upstream-9');
    assert.equal(setHeaders['x-correlation-id'], 'upstream-9');
  });

  test('generates a new id when the header is absent', () => {
    const middleware = createCorrelationMiddleware({ generate: () => 'fixed-gen-id' });
    const { req, res, setHeaders } = makeReqRes(undefined);
    const id = middleware(req, res);
    assert.equal(id, 'fixed-gen-id');
    assert.equal(req.correlation.correlationId, 'fixed-gen-id');
    assert.equal(setHeaders['x-correlation-id'], 'fixed-gen-id');
  });

  test('generates a new id when the header is empty', () => {
    const middleware = createCorrelationMiddleware({ generate: () => 'fixed-gen-id' });
    const { req, res, setHeaders } = makeReqRes('');
    const id = middleware(req, res);
    assert.equal(id, 'fixed-gen-id');
    assert.equal(setHeaders['x-correlation-id'], 'fixed-gen-id');
  });

  test('generates a new id when the header is whitespace-only', () => {
    const middleware = createCorrelationMiddleware({ generate: () => 'fixed-gen-id' });
    const { req, res } = makeReqRes('\t \n');
    const id = middleware(req, res);
    assert.equal(id, 'fixed-gen-id');
  });

  test('respects a custom headerName for both read and write', () => {
    const middleware = createCorrelationMiddleware({
      headerName: 'x-request-id',
      generate: () => 'gen-2',
    });
    const req = { headers: { 'x-request-id': 'client-3' } };
    const setHeaders = {};
    const res = { setHeader: (n, v) => { setHeaders[n] = v; } };
    const id = middleware(req, res);
    assert.equal(id, 'client-3');
    assert.equal(setHeaders['x-request-id'], 'client-3');
    // The default header is not touched.
    assert.equal(setHeaders['x-correlation-id'], undefined);
  });

  test('does not read the default header when a custom name is set', () => {
    const middleware = createCorrelationMiddleware({
      headerName: 'x-request-id',
      generate: () => 'gen-2',
    });
    const req = { headers: { 'x-correlation-id': 'should-be-ignored' } };
    const res = { setHeader: () => {} };
    const id = middleware(req, res);
    assert.equal(id, 'gen-2');
  });

  test('the generate option is used verbatim and not called when a header is present', () => {
    let calls = 0;
    const middleware = createCorrelationMiddleware({ generate: () => { calls++; return 'g'; } });
    const { req, res } = makeReqRes('present');
    middleware(req, res);
    assert.equal(calls, 0, 'generate must not be called when an incoming id is used');
  });

  test('throws when headerName is empty', () => {
    assert.throws(() => createCorrelationMiddleware({ headerName: '' }), TypeError);
  });

  test('throws when headerName is not a string', () => {
    assert.throws(() => createCorrelationMiddleware({ headerName: 42 }), TypeError);
  });

  test('throws when generate is not a function', () => {
    assert.throws(() => createCorrelationMiddleware({ generate: 'no' }), TypeError);
  });

  test('throws when req is not an object', () => {
    const middleware = createCorrelationMiddleware();
    assert.throws(() => middleware(null, { setHeader: () => {} }), TypeError);
  });

  test('throws when res lacks setHeader', () => {
    const middleware = createCorrelationMiddleware();
    assert.throws(() => middleware({ headers: {} }, {}), TypeError);
  });

  test('handles a request whose headers object is missing', () => {
    const middleware = createCorrelationMiddleware({ generate: () => 'fallback' });
    const req = {};
    const setHeaders = {};
    const res = { setHeader: (n, v) => { setHeaders[n] = v; } };
    const id = middleware(req, res);
    assert.equal(id, 'fallback');
    assert.equal(setHeaders['x-correlation-id'], 'fallback');
  });
});
