/**
 * Filters Store Tests
 * Tests for filter state management and helper functions
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  useFilters,
  getTimeOfDayFromHour,
  formatHour,
  formatTimeRange,
  matchesTimePreset,
  isIndependentCinema,
  getTimeOfDayLabel,
  getProgrammingTypeLabel,
  getVenueTypeLabel,
  TIME_PRESETS,
} from "./filters";

// Initial state values for resetting between tests
const initialStateValues = {
  filmSearch: "",
  cinemaIds: [] as string[],
  dateFrom: null as Date | null,
  dateTo: null as Date | null,
  timeFrom: null as number | null,
  timeTo: null as number | null,
  formats: [] as string[],
  programmingTypes: [] as ("repertory" | "new_release" | "special_event" | "preview")[],
  decades: [] as string[],
  genres: [] as string[],
  timesOfDay: [] as ("morning" | "afternoon" | "evening" | "late_night")[],
  festivalSlug: null as string | null,
  festivalOnly: false,
  venueType: "all" as const,
  hideSeen: false,
  hideNotInterested: true,
  onlySingleShowings: false,
  updatedAt: new Date().toISOString(),
};

describe("useFilters store", () => {
  beforeEach(() => {
    // Reset store state values (not actions) before each test
    // Use partial update (not replace) to preserve action functions
    useFilters.setState(initialStateValues);
  });

  describe("toggleCinema", () => {
    it("should add cinema to empty list", () => {
      useFilters.getState().toggleCinema("bfi-southbank");
      expect(useFilters.getState().cinemaIds).toContain("bfi-southbank");
      expect(useFilters.getState().cinemaIds).toHaveLength(1);
    });

    it("should add cinema to existing list", () => {
      useFilters.setState({ cinemaIds: ["prince-charles-cinema"] });
      useFilters.getState().toggleCinema("bfi-southbank");
      expect(useFilters.getState().cinemaIds).toContain("bfi-southbank");
      expect(useFilters.getState().cinemaIds).toContain("prince-charles-cinema");
      expect(useFilters.getState().cinemaIds).toHaveLength(2);
    });

    it("should remove cinema if already present", () => {
      useFilters.setState({ cinemaIds: ["bfi-southbank", "curzon-soho"] });
      useFilters.getState().toggleCinema("bfi-southbank");
      expect(useFilters.getState().cinemaIds).not.toContain("bfi-southbank");
      expect(useFilters.getState().cinemaIds).toContain("curzon-soho");
      expect(useFilters.getState().cinemaIds).toHaveLength(1);
    });

    it("should update updatedAt timestamp", () => {
      const before = useFilters.getState().updatedAt;
      useFilters.getState().toggleCinema("bfi-southbank");
      const after = useFilters.getState().updatedAt;
      expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    });
  });

  describe("setCinemas", () => {
    it("should replace all cinemas", () => {
      useFilters.setState({ cinemaIds: ["old-cinema"] });
      useFilters.getState().setCinemas(["new-1", "new-2"]);
      expect(useFilters.getState().cinemaIds).toEqual(["new-1", "new-2"]);
    });

    it("should allow setting empty list", () => {
      useFilters.setState({ cinemaIds: ["some-cinema"] });
      useFilters.getState().setCinemas([]);
      expect(useFilters.getState().cinemaIds).toEqual([]);
    });
  });

  describe("setDateRange", () => {
    it("should set date range", () => {
      const from = new Date("2025-01-01");
      const to = new Date("2025-01-07");
      useFilters.getState().setDateRange(from, to);
      expect(useFilters.getState().dateFrom).toEqual(from);
      expect(useFilters.getState().dateTo).toEqual(to);
    });

    it("should allow clearing date range", () => {
      useFilters.setState({ dateFrom: new Date(), dateTo: new Date() });
      useFilters.getState().setDateRange(null, null);
      expect(useFilters.getState().dateFrom).toBeNull();
      expect(useFilters.getState().dateTo).toBeNull();
    });
  });

  describe("setTimeRange", () => {
    it("should set time range", () => {
      useFilters.getState().setTimeRange(14, 20);
      expect(useFilters.getState().timeFrom).toBe(14);
      expect(useFilters.getState().timeTo).toBe(20);
    });

    it("should allow clearing time range", () => {
      useFilters.setState({ timeFrom: 10, timeTo: 18 });
      useFilters.getState().setTimeRange(null, null);
      expect(useFilters.getState().timeFrom).toBeNull();
      expect(useFilters.getState().timeTo).toBeNull();
    });
  });

  describe("toggleFormat", () => {
    it("should add format to empty list", () => {
      useFilters.getState().toggleFormat("35mm");
      expect(useFilters.getState().formats).toContain("35mm");
    });

    it("should remove format if already present", () => {
      useFilters.setState({ formats: ["35mm", "70mm"] });
      useFilters.getState().toggleFormat("35mm");
      expect(useFilters.getState().formats).not.toContain("35mm");
      expect(useFilters.getState().formats).toContain("70mm");
    });
  });

  describe("toggleProgrammingType", () => {
    it("should add programming type", () => {
      useFilters.getState().toggleProgrammingType("repertory");
      expect(useFilters.getState().programmingTypes).toContain("repertory");
    });

    it("should remove programming type if present", () => {
      useFilters.setState({ programmingTypes: ["repertory", "new_release"] });
      useFilters.getState().toggleProgrammingType("repertory");
      expect(useFilters.getState().programmingTypes).not.toContain("repertory");
    });
  });

  describe("toggleDecade", () => {
    it("should add decade", () => {
      useFilters.getState().toggleDecade("1970s");
      expect(useFilters.getState().decades).toContain("1970s");
    });

    it("should remove decade if present", () => {
      useFilters.setState({ decades: ["1970s", "1980s"] });
      useFilters.getState().toggleDecade("1970s");
      expect(useFilters.getState().decades).not.toContain("1970s");
    });
  });

  describe("toggleGenre", () => {
    it("should add genre", () => {
      useFilters.getState().toggleGenre("Horror");
      expect(useFilters.getState().genres).toContain("Horror");
    });

    it("should remove genre if present", () => {
      useFilters.setState({ genres: ["Horror", "Comedy"] });
      useFilters.getState().toggleGenre("Horror");
      expect(useFilters.getState().genres).not.toContain("Horror");
    });
  });

  describe("festival filters", () => {
    it("should set festival filter", () => {
      useFilters.getState().setFestivalFilter("london-film-festival");
      expect(useFilters.getState().festivalSlug).toBe("london-film-festival");
    });

    it("should set festival only mode", () => {
      useFilters.getState().setFestivalOnly(true);
      expect(useFilters.getState().festivalOnly).toBe(true);
    });

    it("should clear festival filter", () => {
      useFilters.setState({ festivalSlug: "fest", festivalOnly: true });
      useFilters.getState().clearFestivalFilter();
      expect(useFilters.getState().festivalSlug).toBeNull();
      expect(useFilters.getState().festivalOnly).toBe(false);
    });
  });

  describe("setVenueType", () => {
    it("should set venue type", () => {
      useFilters.getState().setVenueType("independent");
      expect(useFilters.getState().venueType).toBe("independent");
    });
  });

  describe("personal filters", () => {
    it("should set hide seen", () => {
      useFilters.getState().setHideSeen(true);
      expect(useFilters.getState().hideSeen).toBe(true);
    });

    it("should set hide not interested", () => {
      useFilters.getState().setHideNotInterested(false);
      expect(useFilters.getState().hideNotInterested).toBe(false);
    });

    it("should set only single showings", () => {
      useFilters.getState().setOnlySingleShowings(true);
      expect(useFilters.getState().onlySingleShowings).toBe(true);
    });
  });

  describe("clearAllFilters", () => {
    it("should reset all filters to initial state", () => {
      // Set various filters
      useFilters.setState({
        filmSearch: "test",
        cinemaIds: ["bfi-southbank"],
        formats: ["35mm"],
        decades: ["1970s"],
        hideSeen: true,
        festivalSlug: "fest",
      });

      useFilters.getState().clearAllFilters();

      const state = useFilters.getState();
      expect(state.filmSearch).toBe("");
      expect(state.cinemaIds).toEqual([]);
      expect(state.formats).toEqual([]);
      expect(state.decades).toEqual([]);
      expect(state.hideSeen).toBe(false);
      expect(state.festivalSlug).toBeNull();
      // hideNotInterested should be true (default)
      expect(state.hideNotInterested).toBe(true);
    });
  });

  describe("getActiveFilterCount", () => {
    it("should return 0 for default state", () => {
      expect(useFilters.getState().getActiveFilterCount()).toBe(0);
    });

    it("should count film search as 1 filter", () => {
      useFilters.setState({ filmSearch: "2001" });
      expect(useFilters.getState().getActiveFilterCount()).toBe(1);
    });

    it("should count cinema selection as 1 filter (not N cinemas)", () => {
      useFilters.setState({ cinemaIds: ["bfi", "pcc", "curzon"] });
      expect(useFilters.getState().getActiveFilterCount()).toBe(1);
    });

    it("should count date range as 1 filter", () => {
      useFilters.setState({ dateFrom: new Date() });
      expect(useFilters.getState().getActiveFilterCount()).toBe(1);
    });

    it("should count time range as 1 filter", () => {
      useFilters.setState({ timeFrom: 14, timeTo: 20 });
      expect(useFilters.getState().getActiveFilterCount()).toBe(1);
    });

    it("should count each format individually", () => {
      useFilters.setState({ formats: ["35mm", "70mm"] });
      expect(useFilters.getState().getActiveFilterCount()).toBe(2);
    });

    it("should count each programming type individually", () => {
      useFilters.setState({ programmingTypes: ["repertory", "new_release"] });
      expect(useFilters.getState().getActiveFilterCount()).toBe(2);
    });

    it("should NOT count hideNotInterested (it's the default)", () => {
      // hideNotInterested is true by default and shouldn't add to count
      useFilters.setState({ hideNotInterested: true });
      expect(useFilters.getState().getActiveFilterCount()).toBe(0);
    });

    it("should count hideSeen", () => {
      useFilters.setState({ hideSeen: true });
      expect(useFilters.getState().getActiveFilterCount()).toBe(1);
    });

    it("should count venueType only when not 'all'", () => {
      useFilters.setState({ venueType: "all" });
      expect(useFilters.getState().getActiveFilterCount()).toBe(0);

      useFilters.setState({ venueType: "independent" });
      expect(useFilters.getState().getActiveFilterCount()).toBe(1);
    });

    it("should count festival filters", () => {
      useFilters.setState({ festivalSlug: "lff" });
      expect(useFilters.getState().getActiveFilterCount()).toBe(1);

      useFilters.setState({ festivalSlug: "lff", festivalOnly: true });
      expect(useFilters.getState().getActiveFilterCount()).toBe(2);
    });

    it("should count onlySingleShowings", () => {
      useFilters.setState({ onlySingleShowings: true });
      expect(useFilters.getState().getActiveFilterCount()).toBe(1);
    });

    it("should correctly count complex filter combinations", () => {
      useFilters.setState({
        filmSearch: "search",      // +1
        cinemaIds: ["a", "b"],     // +1 (grouped)
        dateFrom: new Date(),      // +1
        formats: ["35mm", "70mm"], // +2
        decades: ["1970s"],        // +1
        genres: ["Horror"],        // +1
        hideSeen: true,            // +1
        festivalSlug: "lff",       // +1
        venueType: "independent",  // +1
        onlySingleShowings: true,  // +1
      });
      expect(useFilters.getState().getActiveFilterCount()).toBe(11);
    });
  });

  describe("bulkSetPersisted", () => {
    it("should merge persisted filters", () => {
      useFilters.getState().bulkSetPersisted({
        cinemaIds: ["bfi-southbank"],
        formats: ["35mm"],
        hideSeen: true,
      });

      expect(useFilters.getState().cinemaIds).toEqual(["bfi-southbank"]);
      expect(useFilters.getState().formats).toEqual(["35mm"]);
      expect(useFilters.getState().hideSeen).toBe(true);
    });
  });

  describe("getPersistedFilters", () => {
    it("should return persisted filter fields", () => {
      useFilters.setState({
        cinemaIds: ["bfi"],
        formats: ["35mm"],
        hideSeen: true,
        filmSearch: "test", // Not persisted
      });

      const persisted = useFilters.getState().getPersistedFilters();

      expect(persisted.cinemaIds).toEqual(["bfi"]);
      expect(persisted.formats).toEqual(["35mm"]);
      expect(persisted.hideSeen).toBe(true);
      expect(persisted).not.toHaveProperty("filmSearch");
    });
  });
});

// =============================================================================
// Helper Function Tests (Pure Functions)
// =============================================================================

describe("getTimeOfDayFromHour", () => {
  it("should return morning for hours before 12", () => {
    expect(getTimeOfDayFromHour(0)).toBe("morning");
    expect(getTimeOfDayFromHour(9)).toBe("morning");
    expect(getTimeOfDayFromHour(11)).toBe("morning");
  });

  it("should return afternoon for hours 12-16", () => {
    expect(getTimeOfDayFromHour(12)).toBe("afternoon");
    expect(getTimeOfDayFromHour(14)).toBe("afternoon");
    expect(getTimeOfDayFromHour(16)).toBe("afternoon");
  });

  it("should return evening for hours 17-20", () => {
    expect(getTimeOfDayFromHour(17)).toBe("evening");
    expect(getTimeOfDayFromHour(19)).toBe("evening");
    expect(getTimeOfDayFromHour(20)).toBe("evening");
  });

  it("should return late_night for hours 21+", () => {
    expect(getTimeOfDayFromHour(21)).toBe("late_night");
    expect(getTimeOfDayFromHour(23)).toBe("late_night");
  });
});

describe("formatHour", () => {
  it("should format midnight as 12am", () => {
    expect(formatHour(0)).toBe("12am");
  });

  it("should format noon as 12pm", () => {
    expect(formatHour(12)).toBe("12pm");
  });

  it("should format morning hours with am", () => {
    expect(formatHour(1)).toBe("1am");
    expect(formatHour(9)).toBe("9am");
    expect(formatHour(11)).toBe("11am");
  });

  it("should format afternoon/evening hours with pm", () => {
    expect(formatHour(13)).toBe("1pm");
    expect(formatHour(18)).toBe("6pm");
    expect(formatHour(23)).toBe("11pm");
  });
});

describe("formatTimeRange", () => {
  it("should return 'Any Time' for null range", () => {
    expect(formatTimeRange(null, null)).toBe("Any Time");
  });

  it("should format open-ended start", () => {
    expect(formatTimeRange(14, null)).toBe("After 2pm");
  });

  it("should format open-ended end", () => {
    expect(formatTimeRange(null, 17)).toBe("Before 6pm");
  });

  it("should format single hour", () => {
    expect(formatTimeRange(14, 14)).toBe("2pm");
  });

  it("should format time range", () => {
    expect(formatTimeRange(14, 20)).toBe("2pm - 9pm");
  });
});

describe("matchesTimePreset", () => {
  it("should match morning preset", () => {
    const morning = TIME_PRESETS[0];
    expect(matchesTimePreset(0, 11, morning)).toBe(true);
    expect(matchesTimePreset(0, 12, morning)).toBe(false);
  });

  it("should match afternoon preset", () => {
    const afternoon = TIME_PRESETS[1];
    expect(matchesTimePreset(12, 16, afternoon)).toBe(true);
  });

  it("should match evening preset", () => {
    const evening = TIME_PRESETS[2];
    expect(matchesTimePreset(17, 20, evening)).toBe(true);
  });

  it("should match late preset", () => {
    const late = TIME_PRESETS[3];
    expect(matchesTimePreset(21, 23, late)).toBe(true);
  });
});

describe("isIndependentCinema", () => {
  it("should return true for null chain", () => {
    expect(isIndependentCinema(null)).toBe(true);
  });

  it("should return true for BFI", () => {
    expect(isIndependentCinema("BFI")).toBe(true);
  });

  it("should return false for other chains", () => {
    expect(isIndependentCinema("Curzon")).toBe(false);
    expect(isIndependentCinema("Everyman")).toBe(false);
    expect(isIndependentCinema("Picturehouse")).toBe(false);
  });
});

describe("label helper functions", () => {
  describe("getTimeOfDayLabel", () => {
    it("should return correct labels", () => {
      expect(getTimeOfDayLabel("morning")).toBe("Morning (before 12pm)");
      expect(getTimeOfDayLabel("afternoon")).toBe("Afternoon (12pm-5pm)");
      expect(getTimeOfDayLabel("evening")).toBe("Evening (5pm-9pm)");
      expect(getTimeOfDayLabel("late_night")).toBe("Late Night (after 9pm)");
    });
  });

  describe("getProgrammingTypeLabel", () => {
    it("should return correct labels", () => {
      expect(getProgrammingTypeLabel("repertory")).toBe("Repertory / Classic");
      expect(getProgrammingTypeLabel("new_release")).toBe("New Release");
      expect(getProgrammingTypeLabel("special_event")).toBe("Special Event");
      expect(getProgrammingTypeLabel("preview")).toBe("Preview / Premiere");
    });
  });

  describe("getVenueTypeLabel", () => {
    it("should return correct labels", () => {
      expect(getVenueTypeLabel("all")).toBe("All Venues");
      expect(getVenueTypeLabel("independent")).toBe("Independent");
      expect(getVenueTypeLabel("chain")).toBe("Chains");
    });
  });
});
