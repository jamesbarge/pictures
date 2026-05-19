import { describe, expect, it } from "vitest";
import { cn } from "./cn";

// `cn` is the Tailwind class-merger used by 65+ frontend imports. It composes
// clsx (for conditional flattening) and tailwind-merge (for Tailwind-aware
// last-wins resolution of conflicting utility classes). These tests pin the
// composition behaviour — *not* the implementation details of clsx/tailwind-merge,
// which have their own test suites.

describe("cn", () => {
  it("returns the same class when given a single string", () => {
    expect(cn("p-4")).toBe("p-4");
  });

  it("joins multiple class strings with spaces", () => {
    expect(cn("p-4", "text-lg")).toBe("p-4 text-lg");
  });

  it("flattens arrays via clsx", () => {
    expect(cn(["p-4", "text-lg"])).toBe("p-4 text-lg");
  });

  it("filters out falsy values (false, null, undefined, empty string, 0)", () => {
    expect(cn("p-4", false && "hidden", null, undefined, "", 0, "text-lg")).toBe(
      "p-4 text-lg",
    );
  });

  it("includes truthy conditional classes", () => {
    const isActive = true;
    expect(cn("p-4", isActive && "bg-accent-gold")).toBe("p-4 bg-accent-gold");
  });

  it("supports clsx object syntax", () => {
    expect(cn({ "p-4": true, "p-8": false, "text-lg": true })).toBe(
      "p-4 text-lg",
    );
  });

  it("uses tailwind-merge to resolve conflicting utility classes (last wins)", () => {
    // p-4 and p-8 are conflicting padding utilities. Tailwind-merge keeps p-8.
    expect(cn("p-4", "p-8")).toBe("p-8");
  });

  it("resolves conflicting utilities across separator categories", () => {
    // px-4 (horizontal padding) and px-8 (horizontal padding) → px-8 wins.
    expect(cn("px-4 py-2", "px-8")).toBe("py-2 px-8");
  });

  it("does NOT collapse non-conflicting utilities", () => {
    // p-4 and text-lg target different properties; both kept.
    expect(cn("p-4", "text-lg")).toBe("p-4 text-lg");
  });

  it("returns an empty string for no arguments / empty array", () => {
    expect(cn()).toBe("");
    expect(cn([])).toBe("");
  });

  it("handles nested arrays (clsx flattens recursively)", () => {
    expect(cn(["p-4", ["text-lg", ["font-bold"]]])).toBe(
      "p-4 text-lg font-bold",
    );
  });

  it("survives the common React 'className' append pattern", () => {
    // Common pattern: cn("base classes", className) where className is
    // user-supplied. Falsy fall-through is critical.
    const userClassName: string | undefined = undefined;
    expect(cn("p-4 text-base", userClassName)).toBe("p-4 text-base");

    const userOverride = "p-8";
    // User override wins via tailwind-merge.
    expect(cn("p-4 text-base", userOverride)).toBe("text-base p-8");
  });
});
