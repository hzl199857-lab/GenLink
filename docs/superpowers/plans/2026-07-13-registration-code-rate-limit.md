# Registration Code Rate Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limit registration-code email requests to one per minute and five per hour for each normalized email address.

**Architecture:** Prisma stores timestamped `RegistrationCodeRequest` rows keyed by normalized email. The registration-code route checks the most recent row and the rolling one-hour count before it creates or emails a new code, then removes expired rate-limit rows.

**Tech Stack:** Next.js App Router, TypeScript, Prisma 6, SQLite, Node test runner.

---

### Task 1: Persist Rate-Limit Requests

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260713090000_add_registration_code_rate_limit/migration.sql`
- Test: `scripts/registration-code-rate-limit-migration.test.py`

- [ ] **Step 1: Write a migration test that asserts the table and index exist**

```py
columns = {row[1] for row in db.execute('PRAGMA table_info("RegistrationCodeRequest")')}
assert {'id', 'email', 'createdAt'} <= columns
```

- [ ] **Step 2: Run the migration test and confirm it fails because the table is absent**

Run: `python -m unittest scripts/registration-code-rate-limit-migration.test.py`

Expected: FAIL with `no such table: RegistrationCodeRequest`.

- [ ] **Step 3: Add the Prisma model and migration**

```prisma
model RegistrationCodeRequest {
  id        String   @id
  email     String
  createdAt DateTime @default(now())

  @@index([email, createdAt])
}
```

```sql
CREATE TABLE "RegistrationCodeRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RegistrationCodeRequest_email_createdAt_idx"
ON "RegistrationCodeRequest"("email", "createdAt");
```

- [ ] **Step 4: Run the migration test and Prisma validation**

Run: `python -m unittest scripts/registration-code-rate-limit-migration.test.py && npx prisma validate`

Expected: PASS and `The schema ... is valid`.

### Task 2: Enforce The Send Policy

**Files:**
- Modify: `src/app/api/auth/send-register-code/route.ts`
- Create: `src/lib/registration-code-rate-limit.ts`
- Test: `src/lib/registration-code-rate-limit.test.ts`

- [ ] **Step 1: Write failing pure-policy tests**

```ts
assert.equal(getRegistrationCodeRateLimit({ recentCount: 0, latestRequestAt: null, now }), null);
assert.equal(getRegistrationCodeRateLimit({ recentCount: 1, latestRequestAt: now, now })?.reason, 'cooldown');
assert.equal(getRegistrationCodeRateLimit({ recentCount: 5, latestRequestAt: null, now })?.reason, 'hourly-limit');
```

- [ ] **Step 2: Run the policy test and confirm it fails because the helper is missing**

Run: `npx tsx --test src/lib/registration-code-rate-limit.test.ts`

Expected: FAIL with `Cannot find module './registration-code-rate-limit.ts'`.

- [ ] **Step 3: Implement the pure policy and call it before creating a verification code**

```ts
const limit = getRegistrationCodeRateLimit({ recentCount, latestRequestAt, now });
if (limit) {
  return NextResponse.json({ ok: false, error: '请稍后再试' }, { status: 429 });
}
```

The route must create a `RegistrationCodeRequest` row only after passing both checks, and prune rows older than one hour in the same Prisma transaction.

- [ ] **Step 4: Run the focused test, type check, lint, and build**

Run: `npx tsx --test src/lib/registration-code-rate-limit.test.ts && npx tsc --noEmit && npm run lint && npm run build`

Expected: all commands exit 0; lint may report the repository's pre-existing warnings only.

- [ ] **Step 5: Commit the migration, policy, route, and tests**

```bash
git add prisma src/app/api/auth/send-register-code/route.ts src/lib/registration-code-rate-limit.ts src/lib/registration-code-rate-limit.test.ts scripts/registration-code-rate-limit-migration.test.py
git commit -m "fix: rate limit registration code requests"
```
