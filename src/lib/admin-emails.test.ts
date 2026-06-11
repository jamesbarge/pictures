import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getAdminEmailAllowlist,
  getVerifiedEmailAddresses,
  isAdminEmail,
} from "./admin-emails";

const ENV_KEY = "ADMIN_EMAILS";

describe("getAdminEmailAllowlist", () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = savedEnv;
    }
  });

  it("returns an empty allowlist when ADMIN_EMAILS is unset (fail-closed)", () => {
    expect(getAdminEmailAllowlist()).toEqual([]);
  });

  it("returns an empty allowlist when ADMIN_EMAILS is an empty string (fail-closed)", () => {
    process.env[ENV_KEY] = "";
    expect(getAdminEmailAllowlist()).toEqual([]);
  });

  it("returns an empty allowlist when ADMIN_EMAILS contains only commas/whitespace", () => {
    // All entries get .trim()ed to empty and filtered out, so the env value
    // collapses to an empty list and the allowlist stays empty (fail-closed).
    process.env[ENV_KEY] = " , ,  ";
    expect(getAdminEmailAllowlist()).toEqual([]);
  });

  it("parses a single email from the env var", () => {
    process.env[ENV_KEY] = "alice@example.com";
    expect(getAdminEmailAllowlist()).toEqual(["alice@example.com"]);
  });

  it("parses multiple comma-separated emails", () => {
    process.env[ENV_KEY] = "alice@example.com,bob@example.com";
    expect(getAdminEmailAllowlist()).toEqual([
      "alice@example.com",
      "bob@example.com",
    ]);
  });

  it("normalises emails to lowercase", () => {
    process.env[ENV_KEY] = "Alice@EXAMPLE.com";
    expect(getAdminEmailAllowlist()).toEqual(["alice@example.com"]);
  });

  it("trims surrounding whitespace per entry", () => {
    process.env[ENV_KEY] = " alice@example.com , bob@example.com ";
    expect(getAdminEmailAllowlist()).toEqual([
      "alice@example.com",
      "bob@example.com",
    ]);
  });

  it("de-duplicates entries (case-insensitive via the normalize pass)", () => {
    process.env[ENV_KEY] = "alice@example.com,ALICE@example.com,alice@example.com";
    expect(getAdminEmailAllowlist()).toEqual(["alice@example.com"]);
  });

  it("stays empty when env var produces zero entries after filtering", () => {
    // Env yielding zero entries is equivalent to being unset: the allowlist is
    // empty and no email is admin. Pinning the fail-closed contract.
    process.env[ENV_KEY] = " ,,, ";
    expect(getAdminEmailAllowlist()).toEqual([]);
  });
});

describe("isAdminEmail", () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = savedEnv;
    }
  });

  it("returns false for null input", () => {
    expect(isAdminEmail(null)).toBe(false);
  });

  it("returns false for undefined input", () => {
    expect(isAdminEmail(undefined)).toBe(false);
  });

  it("returns false for an empty string", () => {
    // Falsy short-circuit guard at the top.
    expect(isAdminEmail("")).toBe(false);
  });

  it("returns false for any email when ADMIN_EMAILS is unset (fail-closed)", () => {
    expect(isAdminEmail("jdwbarge@gmail.com")).toBe(false);
  });

  it("returns true for an allowlisted email", () => {
    process.env[ENV_KEY] = "alice@example.com";
    expect(isAdminEmail("alice@example.com")).toBe(true);
  });

  it("is case-insensitive", () => {
    process.env[ENV_KEY] = "alice@example.com";
    expect(isAdminEmail("ALICE@example.com")).toBe(true);
    expect(isAdminEmail("Alice@Example.com")).toBe(true);
  });

  it("trims input before checking", () => {
    process.env[ENV_KEY] = "alice@example.com";
    expect(isAdminEmail("  alice@example.com  ")).toBe(true);
  });

  it("returns false for non-admin emails", () => {
    process.env[ENV_KEY] = "alice@example.com";
    expect(isAdminEmail("attacker@evil.com")).toBe(false);
  });

  it("admits only the configured emails, rejecting all others", () => {
    process.env[ENV_KEY] = "alice@example.com";
    expect(isAdminEmail("alice@example.com")).toBe(true);
    // Anything not in ADMIN_EMAILS is rejected — the allowlist is exhaustive.
    expect(isAdminEmail("jdwbarge@gmail.com")).toBe(false);
  });

  it("does not treat substrings as matches", () => {
    // "admin@example.com" should not match "secretadmin@example.com" or
    // "admin@example.com.attacker" etc. This pins the .includes() contract
    // against array elements (NOT substring of the joined string).
    process.env[ENV_KEY] = "admin@example.com";
    expect(isAdminEmail("admin@example.com")).toBe(true);
    expect(isAdminEmail("secretadmin@example.com")).toBe(false);
    expect(isAdminEmail("admin@example.com.attacker")).toBe(false);
  });
});

describe("getVerifiedEmailAddresses", () => {
  it("returns only verified normalized email addresses", () => {
    expect(
      getVerifiedEmailAddresses([
        {
          emailAddress: " Admin@Example.com ",
          verification: { status: "verified" },
        },
        {
          emailAddress: "unverified@example.com",
          verification: { status: "unverified" },
        },
        {
          emailAddress: "pending@example.com",
          verification: { status: "pending" },
        },
      ])
    ).toEqual(["admin@example.com"]);
  });

  it("rejects allowlisted-looking addresses without verified ownership", () => {
    expect(
      getVerifiedEmailAddresses([
        {
          emailAddress: "jdwbarge@gmail.com",
          verification: null,
        },
        {
          emailAddress: "jdwbarge@gmail.com",
        },
      ])
    ).toEqual([]);
  });

  it("returns an empty list for absent or empty inputs", () => {
    expect(getVerifiedEmailAddresses(undefined)).toEqual([]);
    expect(getVerifiedEmailAddresses(null)).toEqual([]);
    expect(getVerifiedEmailAddresses([])).toEqual([]);
  });
});
