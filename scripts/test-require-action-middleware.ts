// RBAC-03 — executable verification for requireAction(). The resolver is
// injected (see auth.middleware.ts), so this exercises the middleware's real
// branching logic with zero DB dependency — same principle as
// scripts/test-action-permission-resolver.ts for resolveActionPermissionsPure().
// Run with: npx tsx scripts/test-require-action-middleware.ts
import { requireAction, type AuthRequest } from '../src/middleware/auth.middleware.js';
import { ALL_ACTIONS } from '../src/lib/auth.js';

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

function fakeReq(user?: AuthRequest['user']): AuthRequest {
  return { user } as AuthRequest;
}

async function run(
  actionName: string,
  resolver: (userId: string, role: string) => Promise<string[]>,
  user?: AuthRequest['user']
) {
  const req = fakeReq(user);
  const res = fakeRes();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await requireAction(actionName, resolver)(req, res, next);

  return { nextCalled, statusCode: res.statusCode, body: res.body };
}

async function main() {
  // No req.user at all -> 401, next() never called (mirrors requireRole/requirePermission).
  {
    const result = await run('jobs:assign', async () => ['jobs:assign'], undefined);
    assertEqual('no req.user -> 401, next not called', { nextCalled: result.nextCalled, statusCode: result.statusCode }, { nextCalled: false, statusCode: 401 });
  }

  // Resolver returns no grants at all -> 403, next() never called.
  {
    const result = await run('jobs:assign', async () => [], { id: 'e1', role: 'TECHNICIAN' });
    assertEqual('empty action list -> 403, next not called', { nextCalled: result.nextCalled, statusCode: result.statusCode }, { nextCalled: false, statusCode: 403 });
  }

  // Resolver returns other actions, but not the one required -> 403.
  {
    const result = await run('jobs:assign', async () => ['jobs:view', 'billing:view'], { id: 'e1', role: 'BRANCH_MANAGER' });
    assertEqual('non-matching action list -> 403, next not called', { nextCalled: result.nextCalled, statusCode: result.statusCode }, { nextCalled: false, statusCode: 403 });
  }

  // Resolver returns exactly the required action -> next() called, no status set.
  {
    const result = await run('jobs:assign', async () => ['jobs:assign'], { id: 'e1', role: 'FRANCHISE_ADMIN' });
    assertEqual('matching action -> next called, no response written', { nextCalled: result.nextCalled, statusCode: result.statusCode }, { nextCalled: true, statusCode: undefined });
  }

  // Resolver returns the required action among several others -> next() called.
  {
    const result = await run('outpass:approve', async () => ['jobs:assign', 'outpass:approve', 'billing:cancel'], { id: 'e1', role: 'FRANCHISE_ADMIN' });
    assertEqual('matching action among several -> next called', result.nextCalled, true);
  }

  // ALL_ACTIONS sentinel bypasses the specific-action check entirely (SUPER_ADMIN shape).
  {
    const result = await run('anything:at_all', async () => [ALL_ACTIONS], { id: 'e1', role: 'SUPER_ADMIN' });
    assertEqual('ALL_ACTIONS sentinel -> next called regardless of requested action', result.nextCalled, true);
  }

  // The resolver is called with the actor's actual id/role from req.user, not hardcoded.
  {
    let seenUserId: string | undefined;
    let seenRole: string | undefined;
    await run('jobs:assign', async (userId, role) => {
      seenUserId = userId;
      seenRole = role;
      return [];
    }, { id: 'emp-42', role: 'BRANCH_MANAGER' });
    assertEqual('resolver invoked with the actual req.user id/role', { seenUserId, seenRole }, { seenUserId: 'emp-42', seenRole: 'BRANCH_MANAGER' });
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
