// D-20 — executable verification for requireSystemCredential(). The audit
// logger is injected, so this exercises the real branching logic with zero
// DB dependency, same principle as scripts/test-require-action-middleware.ts.
// env.ts validates process.env at import time (ESM import hoisting means a
// same-file assignment before the import would not reliably run first), so
// SCHEDULER_SECRET is set on the command line instead:
// Run with: SCHEDULER_SECRET=test-secret-value-123 npx tsx scripts/test-system-credential-middleware.ts
import type { SystemRequest } from '../src/middleware/system-auth.middleware.js';
import { requireSystemCredential } from '../src/middleware/system-auth.middleware.js';

let pass = 0;
let fail = 0;

function assertEqual(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    console.log(`FAIL: ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function fakeRes() {
  const res: any = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function fakeReq(headers: Record<string, string> = {}): SystemRequest {
  return { headers, ip: '127.0.0.1' } as unknown as SystemRequest;
}

async function run(endpointName: string, headers: Record<string, string> = {}) {
  const req = fakeReq(headers);
  const res = fakeRes();
  let nextCalled = false;
  const next = () => { nextCalled = true; };
  let auditCalled: any = null;
  const fakeAudit = async (opts: any) => { auditCalled = opts; };

  await requireSystemCredential(endpointName, fakeAudit)(req, res, next);

  return { nextCalled, statusCode: res.statusCode, systemCaller: req.systemCaller, auditCalled };
}

async function main() {
  // No header at all -> 401, next not called, no systemCaller attached.
  {
    const result = await run('scheduler:callbacks:dispatch', {});
    assertEqual('no credential header -> 401', { nextCalled: result.nextCalled, statusCode: result.statusCode, systemCaller: result.systemCaller }, { nextCalled: false, statusCode: 401, systemCaller: undefined });
  }

  // Wrong credential -> 401.
  {
    const result = await run('scheduler:callbacks:dispatch', { 'x-scheduler-secret': 'wrong-value' });
    assertEqual('wrong credential -> 401', { nextCalled: result.nextCalled, statusCode: result.statusCode }, { nextCalled: false, statusCode: 401 });
  }

  // A valid human-style bearer token in the wrong header does nothing — this
  // middleware never looks at Authorization at all.
  {
    const req = fakeReq({ authorization: 'Bearer some.valid.jwt' });
    const res = fakeRes();
    let nextCalled = false;
    await requireSystemCredential('scheduler:callbacks:dispatch', async () => {})(req, res, () => { nextCalled = true; });
    assertEqual('human Authorization header is ignored entirely -> 401', { nextCalled, statusCode: res.statusCode }, { nextCalled: false, statusCode: 401 });
  }

  // Correct credential -> next() called, systemCaller attached, audit fired
  // with the SYSTEM_SCHEDULER identity (never a human employee id).
  {
    const result = await run('scheduler:callbacks:dispatch', { 'x-scheduler-secret': 'test-secret-value-123' });
    assertEqual('correct credential -> next called', result.nextCalled, true);
    assertEqual('correct credential -> no error response written', result.statusCode, undefined);
    assertEqual('systemCaller attached with the right endpoint', result.systemCaller, { type: 'SYSTEM_SCHEDULER', endpoint: 'scheduler:callbacks:dispatch' });
    assertEqual('audit identifies SYSTEM_SCHEDULER, not a human actor', result.auditCalled?.userId, 'SYSTEM_SCHEDULER');
    assertEqual('audit action matches the endpoint name', result.auditCalled?.action, 'scheduler:callbacks:dispatch');
  }

  // Each named endpoint gets its own action string in the audit trail.
  {
    const result = await run('scheduler:workshop:run', { 'x-scheduler-secret': 'test-secret-value-123' });
    assertEqual('a different endpoint name flows through to the audit action', result.auditCalled?.action, 'scheduler:workshop:run');
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
