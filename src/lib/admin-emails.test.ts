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

  it("returns the built-in default when ADMIN_EMAILS is unset", () => {
    expect(getAdminEmailAllowlist()).toEqual(["jdwbarge@gmail.com"]);
  });

  it("returns the built-in default when ADMIN_EMAILS is an empty string", () => {
    process.env[ENV_KEY] = "";
    expect(getAdminEmailAllowlist()).toEqual(["jdwbarge@gmail.com"]);
  });

  it("returns the built-in default when ADMIN_EMAILS contains only commas/whitespace", () => {
    // All entries get .trim()ed to empty and filtered out, so the env value
    // collapses to an empty list and the function falls back to the default.
    process.env[ENV_KEY] = " , ,  ";
    expect(getAdminEmailAllowlist()).toEqual(["jdwbarge@gmail.com"]);
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

  it("does NOT override the default when env var produces zero entries after filtering", () => {
    // Mixing defaults with env is intentionally avoided — env replaces default
    // entirely, but only when env yields ≥1 entry. Pinning the contract.
    process.env[ENV_KEY] = " ,,, ";
    expect(getAdminEmailAllowlist()).toEqual(["jdwbarge@gmail.com"]);
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

  it("returns true for the default admin email", () => {
    expect(isAdminEmail("jdwbarge@gmail.com")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isAdminEmail("JDWBARGE@gmail.com")).toBe(true);
    expect(isAdminEmail("JDWBarge@Gmail.com")).toBe(true);
  });

  it("trims input before checking", () => {
    expect(isAdminEmail("  jdwbarge@gmail.com  ")).toBe(true);
  });

  it("returns false for non-admin emails", () => {
    expect(isAdminEmail("attacker@evil.com")).toBe(false);
  });

  it("honours the env-var override", () => {
    process.env[ENV_KEY] = "alice@example.com";
    expect(isAdminEmail("alice@example.com")).toBe(true);
    // Default admin should now be REJECTED — env replaces default entirely.
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
