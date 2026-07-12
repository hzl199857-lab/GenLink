import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module: NodeModule, filename: string) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      strict: true,
    },
    fileName: filename,
  });

  (module as NodeModule & { _compile(code: string, filename: string): void })._compile(
    output.outputText,
    filename,
  );
};

const {
  migrateLegacyStorageValue,
  userStorageKey,
} = require("./browser-user-storage.ts") as typeof import("./browser-user-storage");

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

class FailingStorage extends MemoryStorage {
  readonly writes: string[] = [];
  private failures = new Map<string, number>();

  failNextWrite(key: string) {
    this.failures.set(key, (this.failures.get(key) ?? 0) + 1);
  }

  override setItem(key: string, value: string) {
    this.writes.push(key);
    const remaining = this.failures.get(key) ?? 0;
    if (remaining > 0) {
      this.failures.set(key, remaining - 1);
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    }
    super.setItem(key, value);
  }
}

test("builds encoded user-scoped storage keys", () => {
  assert.equal(
    userStorageKey("user/name@example.com", "canvas.provider"),
    "genlink.user.user%2Fname%40example.com.canvas.provider",
  );
  assert.throws(() => userStorageKey("  ", "canvas.provider"), /userId/);
});

test("lets only the first user claim a legacy storage value", () => {
  const storage = new MemoryStorage();
  storage.setItem("canvas.provider", "legacy-provider");

  assert.equal(
    migrateLegacyStorageValue("user-a", "canvas.provider", storage),
    "legacy-provider",
  );
  assert.equal(
    storage.getItem(userStorageKey("user-a", "canvas.provider")),
    "legacy-provider",
  );
  assert.equal(
    storage.getItem("genlink.legacy-claimed.v1.canvas.provider"),
    "user-a",
  );

  assert.equal(migrateLegacyStorageValue("user-b", "canvas.provider", storage), null);
  assert.equal(storage.getItem(userStorageKey("user-b", "canvas.provider")), null);
});

test("never overwrites an existing scoped value", () => {
  const storage = new MemoryStorage();
  storage.setItem("canvas.provider", "legacy-provider");
  storage.setItem(userStorageKey("user-a", "canvas.provider"), "current-provider");

  assert.equal(
    migrateLegacyStorageValue("user-a", "canvas.provider", storage),
    "current-provider",
  );
  assert.equal(
    storage.getItem(userStorageKey("user-a", "canvas.provider")),
    "current-provider",
  );
  assert.equal(
    storage.getItem("genlink.legacy-claimed.v1.canvas.provider"),
    "user-a",
  );
  assert.equal(migrateLegacyStorageValue("user-b", "canvas.provider", storage), null);
  assert.equal(storage.getItem(userStorageKey("user-b", "canvas.provider")), null);
});

test("claims legacy storage even when there is no legacy value to migrate", () => {
  const storage = new MemoryStorage();

  assert.equal(migrateLegacyStorageValue("user-a", "canvas.provider", storage), null);
  assert.equal(
    storage.getItem("genlink.legacy-claimed.v1.canvas.provider"),
    "user-a",
  );

  storage.setItem("canvas.provider", "late-legacy-provider");
  assert.equal(migrateLegacyStorageValue("user-b", "canvas.provider", storage), null);
  assert.equal(storage.getItem(userStorageKey("user-b", "canvas.provider")), null);
});

test("does not claim legacy storage when writing the scoped value fails", () => {
  const storage = new FailingStorage();
  const scopedKey = userStorageKey("user-a", "canvas.provider");
  const claimKey = "genlink.legacy-claimed.v1.canvas.provider";
  storage.setItem("canvas.provider", "legacy-provider");
  storage.failNextWrite(scopedKey);

  assert.throws(
    () => migrateLegacyStorageValue("user-a", "canvas.provider", storage),
    (error) => error instanceof DOMException && error.name === "QuotaExceededError",
  );
  assert.equal(storage.getItem(scopedKey), null);
  assert.equal(storage.getItem(claimKey), null);
  assert.equal(storage.getItem("canvas.provider"), "legacy-provider");

  assert.equal(migrateLegacyStorageValue("user-a", "canvas.provider", storage), "legacy-provider");
  assert.equal(storage.getItem(scopedKey), "legacy-provider");
  assert.equal(storage.getItem(claimKey), "user-a");
});

test("rolls back a newly scoped value when committing the claim marker fails", () => {
  const storage = new FailingStorage();
  const scopedKey = userStorageKey("user-a", "canvas.provider");
  const claimKey = "genlink.legacy-claimed.v1.canvas.provider";
  storage.setItem("canvas.provider", "legacy-provider");
  storage.failNextWrite(claimKey);
  const writeStart = storage.writes.length;

  assert.throws(
    () => migrateLegacyStorageValue("user-a", "canvas.provider", storage),
    (error) => error instanceof DOMException && error.name === "QuotaExceededError",
  );
  assert.deepEqual(storage.writes.slice(writeStart), [scopedKey, claimKey]);
  assert.equal(storage.getItem(scopedKey), null);
  assert.equal(storage.getItem(claimKey), null);
  assert.equal(storage.getItem("canvas.provider"), "legacy-provider");

  assert.equal(migrateLegacyStorageValue("user-a", "canvas.provider", storage), "legacy-provider");
  assert.equal(storage.getItem(scopedKey), "legacy-provider");
  assert.equal(storage.getItem(claimKey), "user-a");
});

test("preserves an existing scoped value when the claim marker write fails", () => {
  const storage = new FailingStorage();
  const scopedKey = userStorageKey("user-a", "canvas.provider");
  const claimKey = "genlink.legacy-claimed.v1.canvas.provider";
  storage.setItem("canvas.provider", "legacy-provider");
  storage.setItem(scopedKey, "current-provider");
  storage.failNextWrite(claimKey);

  assert.throws(
    () => migrateLegacyStorageValue("user-a", "canvas.provider", storage),
    (error) => error instanceof DOMException && error.name === "QuotaExceededError",
  );
  assert.equal(storage.getItem(scopedKey), "current-provider");
  assert.equal(storage.getItem(claimKey), null);

  assert.equal(migrateLegacyStorageValue("user-a", "canvas.provider", storage), "current-provider");
  assert.equal(storage.getItem(claimKey), "user-a");
});

test("is a no-op without browser storage", () => {
  assert.equal(migrateLegacyStorageValue("user-a", "canvas.provider"), null);
});
