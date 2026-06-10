import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const returning = vi.fn();
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));
  const where = vi.fn();
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  const captureServerEvent = vi.fn();
  const setServerUserProperties = vi.fn();

  return {
    returning,
    onConflictDoNothing,
    values,
    insert,
    where,
    set,
    update,
    captureServerEvent,
    setServerUserProperties,
  };
});

vi.mock("@/db", () => ({
  db: {
    insert: mocks.insert,
    update: mocks.update,
  },
}));

vi.mock("@/lib/posthog-server", () => ({
  captureServerEvent: mocks.captureServerEvent,
  setServerUserProperties: mocks.setServerUserProperties,
}));

import { ensureUserRecord } from "./user-record";

describe("ensureUserRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the FK parent row with a conflict-safe insert", async () => {
    mocks.returning.mockResolvedValueOnce([{ id: "user_1" }]);

    await expect(ensureUserRecord("user_1")).resolves.toBe(true);

    expect(mocks.values).toHaveBeenCalledWith({
      id: "user_1",
      email: null,
      displayName: null,
    });
    expect(mocks.onConflictDoNothing).toHaveBeenCalledOnce();
    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      "user_1",
      "user_created",
      expect.objectContaining({ source: "user_write" })
    );
  });

  it("does not overwrite an existing user on an ordinary write", async () => {
    mocks.returning.mockResolvedValueOnce([]);

    await expect(ensureUserRecord("user_1")).resolves.toBe(false);

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.captureServerEvent).not.toHaveBeenCalled();
  });

  it("enriches an existing row when Clerk metadata is supplied", async () => {
    mocks.returning.mockResolvedValueOnce([]);

    await ensureUserRecord("user_1", {
      email: "user@example.com",
      displayName: "Example User",
      source: "sync",
    });

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        displayName: "Example User",
      })
    );
    expect(mocks.where).toHaveBeenCalledOnce();
  });
});
