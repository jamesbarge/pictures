/**
 * Travel Time Utilities Tests
 *
 * Tests for screening filtering and sorting by travel time
 */

import { describe, it, expect } from "vitest";
import {
  getReachableScreenings,
  groupByUrgency,
  formatLeaveBy,
  type Screening,
} from "./travel-time";

// =============================================================================
// Test Data
// =============================================================================

const createScreening = (
  id: string,
  cinemaId: string,
  datetime: Date,
  runtime: number | null = 120
): Screening => ({
  id,
  datetime: datetime.toISOString(),
  format: null,
  bookingUrl: `https://example.com/book/${id}`,
  cinema: { id: cinemaId, name: `Cinema ${cinemaId}`, shortName: cinemaId },
  film: {
    id: `film-${id}`,
    title: `Film ${id}`,
    year: 2024,
    runtime,
    posterUrl: null,
  },
});

// =============================================================================
// getReachableScreenings Tests
// =============================================================================

describe("getReachableScreenings", () => {
  describe("sorting by travel time", () => {
    it("should sort screenings by shortest travel time first", () => {
      const now = new Date("2025-01-06T14:00:00Z");
      const deadline = new Date("2025-01-06T23:00:00Z");

      // Create screenings at different cinemas, all starting at 16:00
      const screenings: Screening[] = [
        createScreening("a", "far-cinema", new Date("2025-01-06T16:00:00Z")),
        createScreening("b", "close-cinema", new Date("2025-01-06T16:00:00Z")),
        createScreening("c", "medium-cinema", new Date("2025-01-06T16:00:00Z")),
      ];

      // Travel times: far=45min, close=10min, medium=25min
      const travelTimes = {
        "far-cinema": { minutes: 45, mode: "transit" },
        "close-cinema": { minutes: 10, mode: "transit" },
        "medium-cinema": { minutes: 25, mode: "transit" },
      };

      const result = getReachableScreenings(screenings, travelTimes, deadline, now);

      // Should be sorted by travel time: close (10) → medium (25) → far (45)
      expect(result).toHaveLength(3);
      expect(result[0].cinema.id).toBe("close-cinema");
      expect(result[0].travelMinutes).toBe(10);
      expect(result[1].cinema.id).toBe("medium-cinema");
      expect(result[1].travelMinutes).toBe(25);
      expect(result[2].cinema.id).toBe("far-cinema");
      expect(result[2].travelMinutes).toBe(45);
    });

    it("should maintain travel time sort order regardless of screening times", () => {
      const now = new Date("2025-01-06T14:00:00Z");
      const deadline = new Date("2025-01-06T23:00:00Z");

      // Different screening times, but should still sort by travel time
      const screenings: Screening[] = [
        createScreening("a", "far-cinema", new Date("2025-01-06T15:00:00Z")), // Earlier
        createScreening("b", "close-cinema", new Date("2025-01-06T17:00:00Z")), // Later
        createScreening("c", "medium-cinema", new Date("2025-01-06T16:00:00Z")), // Middle
      ];

      const travelTimes = {
        "far-cinema": { minutes: 45, mode: "transit" },
        "close-cinema": { minutes: 10, mode: "transit" },
        "medium-cinema": { minutes: 25, mode: "transit" },
      };

      const result = getReachableScreenings(screenings, travelTimes, deadline, now);

      // Still sorted by travel time, not by screening time
      expect(result[0].cinema.id).toBe("close-cinema");
      expect(result[1].cinema.id).toBe("medium-cinema");
      expect(result[2].cinema.id).toBe("far-cinema");
    });
  });

  describe("filtering logic", () => {
    it("should exclude screenings without travel time data", () => {
      const now = new Date("2025-01-06T14:00:00Z");
      const deadline = new Date("2025-01-06T23:00:00Z");

      const screenings: Screening[] = [
        createScreening("a", "known-cinema", new Date("2025-01-06T16:00:00Z")),
        createScreening("b", "unknown-cinema", new Date("2025-01-06T16:00:00Z")),
      ];

      // Only one cinema has travel time
      const travelTimes = {
        "known-cinema": { minutes: 20, mode: "transit" },
      };

      const result = getReachableScreenings(screenings, travelTimes, deadline, now);

      expect(result).toHaveLength(1);
      expect(result[0].cinema.id).toBe("known-cinema");
    });

    it("should exclude screenings that finish after deadline", () => {
      const now = new Date("2025-01-06T14:00:00Z");
      const deadline = new Date("2025-01-06T18:00:00Z"); // 6pm deadline

      const screenings: Screening[] = [
        // 16:00 + 90min runtime = finishes 17:30 (before deadline)
        createScreening("a", "cinema-a", new Date("2025-01-06T16:00:00Z"), 90),
        // 16:00 + 150min runtime = finishes 18:30 (after deadline)
        createScreening("b", "cinema-b", new Date("2025-01-06T16:00:00Z"), 150),
      ];

      const travelTimes = {
        "cinema-a": { minutes: 20, mode: "transit" },
        "cinema-b": { minutes: 20, mode: "transit" },
      };

      const result = getReachableScreenings(screenings, travelTimes, deadline, now);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("a");
    });

    it("should exclude screenings user cannot reach in time", () => {
      const now = new Date("2025-01-06T15:30:00Z"); // 3:30pm
      const deadline = new Date("2025-01-06T23:00:00Z");

      const screenings: Screening[] = [
        // Starts at 16:00, 20min travel = need to leave by 15:40 (still possible)
        createScreening("a", "close-cinema", new Date("2025-01-06T16:00:00Z")),
        // Starts at 16:00, 45min travel = need to leave by 15:15 (too late!)
        createScreening("b", "far-cinema", new Date("2025-01-06T16:00:00Z")),
      ];

      const travelTimes = {
        "close-cinema": { minutes: 20, mode: "transit" },
        "far-cinema": { minutes: 45, mode: "transit" },
      };

      const result = getReachableScreenings(screenings, travelTimes, deadline, now);

      expect(result).toHaveLength(1);
      expect(result[0].cinema.id).toBe("close-cinema");
    });

    it("should use default 120min runtime when film runtime is null", () => {
      const now = new Date("2025-01-06T14:00:00Z");
      const deadline = new Date("2025-01-06T18:00:00Z"); // 6pm deadline

      const screenings: Screening[] = [
        // 15:00 + 120min default = finishes 17:00 (before deadline)
        createScreening("a", "cinema-a", new Date("2025-01-06T15:00:00Z"), null),
        // 16:30 + 120min default = finishes 18:30 (after deadline)
        createScreening("b", "cinema-b", new Date("2025-01-06T16:30:00Z"), null),
      ];

      const travelTimes = {
        "cinema-a": { minutes: 20, mode: "transit" },
        "cinema-b": { minutes: 20, mode: "transit" },
      };

      const result = getReachableScreenings(screenings, travelTimes, deadline, now);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("a");
    });
  });

  describe("enriched screening data", () => {
    it("should calculate correct leaveBy time and minutesUntilLeave", () => {
      const now = new Date("2025-01-06T14:00:00Z");
      const deadline = new Date("2025-01-06T23:00:00Z");

      const screenings: Screening[] = [
        createScreening("a", "cinema-a", new Date("2025-01-06T16:00:00Z")),
      ];

      const travelTimes = {
        "cinema-a": { minutes: 30, mode: "transit" },
      };

      const result = getReachableScreenings(screenings, travelTimes, deadline, now);

      expect(result).toHaveLength(1);
      // Screening at 16:00, 30min travel = leave by 15:30
      expect(result[0].leaveBy).toEqual(new Date("2025-01-06T15:30:00Z"));
      // From 14:00 to 15:30 = 90 minutes
      expect(result[0].minutesUntilLeave).toBe(90);
      expect(result[0].travelMinutes).toBe(30);
      expect(result[0].travelMode).toBe("transit");
    });
  });
});

// =============================================================================
// groupByUrgency Tests
// =============================================================================

describe("groupByUrgency", () => {
  it("should group screenings by minutes until leave", () => {
    const now = new Date("2025-01-06T14:00:00Z");

    // Create mock ReachableScreening objects with different minutesUntilLeave
    const screenings = [
      { minutesUntilLeave: 15, cinema: { id: "a" } }, // leave_soon
      { minutesUntilLeave: 45, cinema: { id: "b" } }, // leave_within_hour
      { minutesUntilLeave: 90, cinema: { id: "c" } }, // later
      { minutesUntilLeave: 25, cinema: { id: "d" } }, // leave_soon
      { minutesUntilLeave: 55, cinema: { id: "e" } }, // leave_within_hour
    ] as any;

    const groups = groupByUrgency(screenings);

    expect(groups.leave_soon).toHaveLength(2);
    expect(groups.leave_soon.map((s: any) => s.cinema.id)).toEqual(["a", "d"]);

    expect(groups.leave_within_hour).toHaveLength(2);
    expect(groups.leave_within_hour.map((s: any) => s.cinema.id)).toEqual(["b", "e"]);

    expect(groups.later).toHaveLength(1);
    expect(groups.later[0].cinema.id).toBe("c");
  });

  it("should handle boundary cases correctly", () => {
    const screenings = [
      { minutesUntilLeave: 30, cinema: { id: "a" } }, // exactly 30 = leave_soon
      { minutesUntilLeave: 31, cinema: { id: "b" } }, // 31 = leave_within_hour
      { minutesUntilLeave: 60, cinema: { id: "c" } }, // exactly 60 = leave_within_hour
      { minutesUntilLeave: 61, cinema: { id: "d" } }, // 61 = later
    ] as any;

    const groups = groupByUrgency(screenings);

    expect(groups.leave_soon).toHaveLength(1);
    expect(groups.leave_soon[0].cinema.id).toBe("a");

    expect(groups.leave_within_hour).toHaveLength(2);
    expect(groups.leave_within_hour.map((s: any) => s.cinema.id)).toEqual(["b", "c"]);

    expect(groups.later).toHaveLength(1);
    expect(groups.later[0].cinema.id).toBe("d");
  });

  it("should return empty arrays when no screenings in a group", () => {
    const screenings = [
      { minutesUntilLeave: 90, cinema: { id: "a" } }, // only later
    ] as any;

    const groups = groupByUrgency(screenings);

    expect(groups.leave_soon).toHaveLength(0);
    expect(groups.leave_within_hour).toHaveLength(0);
    expect(groups.later).toHaveLength(1);
  });
});

// =============================================================================
// formatLeaveBy Tests
// =============================================================================

describe("formatLeaveBy", () => {
  it('should return "Leave now!" for 5 minutes or less', () => {
    const leaveBy = new Date("2025-01-06T14:05:00Z");
    expect(formatLeaveBy(leaveBy, 5)).toBe("Leave now!");
    expect(formatLeaveBy(leaveBy, 3)).toBe("Leave now!");
    expect(formatLeaveBy(leaveBy, 1)).toBe("Leave now!");
  });

  it('should return "Leave in X min" for 6-30 minutes', () => {
    const leaveBy = new Date("2025-01-06T14:20:00Z");
    expect(formatLeaveBy(leaveBy, 6)).toBe("Leave in 6 min");
    expect(formatLeaveBy(leaveBy, 15)).toBe("Leave in 15 min");
    expect(formatLeaveBy(leaveBy, 30)).toBe("Leave in 30 min");
  });

  it('should return "Leave by X:XX" for more than 30 minutes', () => {
    const leaveBy = new Date("2025-01-06T15:30:00Z");
    const result = formatLeaveBy(leaveBy, 45);
    // Format varies by locale, but should contain time
    expect(result).toMatch(/Leave by/);
  });
});
