/**
 * Tests for dismiss button utility functions
 * Tests localStorage-based dismissal logic
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  isAnomalyDismissed,
  dismissAnomaly,
  undismissAnomaly,
  getDismissedAnomalies,
  STORAGE_KEY,
  type DismissedAnomaly,
} from "./dismiss-button";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
});

describe("dismiss-button utilities", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe("getDismissedAnomalies", () => {
    it("returns empty array when no dismissals exist", () => {
      const dismissed = getDismissedAnomalies();
      expect(dismissed).toEqual([]);
    });

    it("returns stored dismissals", () => {
      const data: DismissedAnomaly[] = [
        { cinemaId: "bfi-southbank", countAtDismissal: 5, dismissedAt: "2025-01-04T12:00:00Z" },
      ];
      localStorageMock.setItem(STORAGE_KEY, JSON.stringify(data));

      const dismissed = getDismissedAnomalies();
      expect(dismissed).toEqual(data);
    });

    it("handles corrupted localStorage data", () => {
      localStorageMock.setItem(STORAGE_KEY, "not-valid-json");

      const dismissed = getDismissedAnomalies();
      expect(dismissed).toEqual([]);
    });
  });

  describe("dismissAnomaly", () => {
    it("adds new dismissal to empty list", () => {
      dismissAnomaly("bfi-southbank", 10);

      const dismissed = getDismissedAnomalies();
      expect(dismissed).toHaveLength(1);
      expect(dismissed[0].cinemaId).toBe("bfi-southbank");
      expect(dismissed[0].countAtDismissal).toBe(10);
    });

    it("updates existing dismissal for same cinema", () => {
      dismissAnomaly("bfi-southbank", 5);
      dismissAnomaly("bfi-southbank", 10);

      const dismissed = getDismissedAnomalies();
      expect(dismissed).toHaveLength(1);
      expect(dismissed[0].countAtDismissal).toBe(10);
    });

    it("adds multiple cinemas", () => {
      dismissAnomaly("bfi-southbank", 5);
      dismissAnomaly("prince-charles", 8);

      const dismissed = getDismissedAnomalies();
      expect(dismissed).toHaveLength(2);
    });
  });

  describe("undismissAnomaly", () => {
    it("removes dismissal from list", () => {
      dismissAnomaly("bfi-southbank", 5);
      dismissAnomaly("prince-charles", 8);

      undismissAnomaly("bfi-southbank");

      const dismissed = getDismissedAnomalies();
      expect(dismissed).toHaveLength(1);
      expect(dismissed[0].cinemaId).toBe("prince-charles");
    });

    it("handles removing non-existent dismissal gracefully", () => {
      dismissAnomaly("bfi-southbank", 5);

      undismissAnomaly("prince-charles");

      const dismissed = getDismissedAnomalies();
      expect(dismissed).toHaveLength(1);
    });
  });

  describe("isAnomalyDismissed", () => {
    it("returns true when cinema is dismissed with same count", () => {
      dismissAnomaly("bfi-southbank", 5);

      const result = isAnomalyDismissed("bfi-southbank", 5);
      expect(result).toBe(true);
    });

    it("returns false when cinema is dismissed with different count (re-scraped)", () => {
      dismissAnomaly("bfi-southbank", 5);

      // Count changed - indicates re-scrape happened
      const result = isAnomalyDismissed("bfi-southbank", 8);
      expect(result).toBe(false);
    });

    it("returns false when cinema is not dismissed", () => {
      const result = isAnomalyDismissed("bfi-southbank", 5);
      expect(result).toBe(false);
    });

    it("clears stale dismissal when count changes", () => {
      dismissAnomaly("bfi-southbank", 5);

      // Check with different count - should clear dismissal
      isAnomalyDismissed("bfi-southbank", 8);

      // Verify dismissal was cleared
      const dismissed = getDismissedAnomalies();
      expect(dismissed).toHaveLength(0);
    });
  });
});
