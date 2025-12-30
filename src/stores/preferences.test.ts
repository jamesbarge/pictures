/**
 * Preferences Store Tests
 * Tests for user preferences state management
 */

import { describe, it, expect, beforeEach } from "vitest";
import { usePreferences } from "./preferences";

// Initial state values for resetting between tests
const initialStateValues = {
  selectedCinemas: [] as string[],
  defaultView: "list" as const,
  calendarViewMode: "films" as const,
  showRepertoryOnly: false,
  hidePastScreenings: true,
  defaultDateRange: "all" as const,
  preferredFormats: [] as string[],
  mapArea: null,
  useMapFiltering: false,
  updatedAt: new Date().toISOString(),
};

describe("usePreferences store", () => {
  beforeEach(() => {
    // Reset store state values before each test
    usePreferences.setState(initialStateValues);
  });

  describe("toggleCinema", () => {
    it("should add cinema to empty list", () => {
      usePreferences.getState().toggleCinema("bfi-southbank");
      expect(usePreferences.getState().selectedCinemas).toContain("bfi-southbank");
      expect(usePreferences.getState().selectedCinemas).toHaveLength(1);
    });

    it("should add cinema to existing list", () => {
      usePreferences.setState({ selectedCinemas: ["prince-charles-cinema"] });
      usePreferences.getState().toggleCinema("bfi-southbank");
      expect(usePreferences.getState().selectedCinemas).toHaveLength(2);
      expect(usePreferences.getState().selectedCinemas).toContain("bfi-southbank");
      expect(usePreferences.getState().selectedCinemas).toContain("prince-charles-cinema");
    });

    it("should remove cinema if already present", () => {
      usePreferences.setState({ selectedCinemas: ["bfi-southbank", "curzon-soho"] });
      usePreferences.getState().toggleCinema("bfi-southbank");
      expect(usePreferences.getState().selectedCinemas).not.toContain("bfi-southbank");
      expect(usePreferences.getState().selectedCinemas).toContain("curzon-soho");
      expect(usePreferences.getState().selectedCinemas).toHaveLength(1);
    });

    it("should update updatedAt timestamp", () => {
      const before = usePreferences.getState().updatedAt;
      usePreferences.getState().toggleCinema("bfi-southbank");
      const after = usePreferences.getState().updatedAt;
      expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    });
  });

  describe("setCinemas", () => {
    it("should replace all cinemas", () => {
      usePreferences.setState({ selectedCinemas: ["old-cinema"] });
      usePreferences.getState().setCinemas(["new-1", "new-2"]);
      expect(usePreferences.getState().selectedCinemas).toEqual(["new-1", "new-2"]);
    });
  });

  describe("selectAllCinemas", () => {
    it("should set all provided cinemas", () => {
      usePreferences.getState().selectAllCinemas(["cinema-1", "cinema-2", "cinema-3"]);
      expect(usePreferences.getState().selectedCinemas).toEqual(["cinema-1", "cinema-2", "cinema-3"]);
    });
  });

  describe("clearCinemas", () => {
    it("should clear all cinemas", () => {
      usePreferences.setState({ selectedCinemas: ["bfi", "pcc"] });
      usePreferences.getState().clearCinemas();
      expect(usePreferences.getState().selectedCinemas).toEqual([]);
    });
  });

  describe("setDefaultView", () => {
    it("should set view to list", () => {
      usePreferences.setState({ defaultView: "grid" });
      usePreferences.getState().setDefaultView("list");
      expect(usePreferences.getState().defaultView).toBe("list");
    });

    it("should set view to grid", () => {
      usePreferences.getState().setDefaultView("grid");
      expect(usePreferences.getState().defaultView).toBe("grid");
    });
  });

  describe("setCalendarViewMode", () => {
    it("should set mode to films", () => {
      usePreferences.setState({ calendarViewMode: "screenings" });
      usePreferences.getState().setCalendarViewMode("films");
      expect(usePreferences.getState().calendarViewMode).toBe("films");
    });

    it("should set mode to screenings", () => {
      usePreferences.getState().setCalendarViewMode("screenings");
      expect(usePreferences.getState().calendarViewMode).toBe("screenings");
    });
  });

  describe("setShowRepertoryOnly", () => {
    it("should set repertory only mode", () => {
      usePreferences.getState().setShowRepertoryOnly(true);
      expect(usePreferences.getState().showRepertoryOnly).toBe(true);
    });

    it("should clear repertory only mode", () => {
      usePreferences.setState({ showRepertoryOnly: true });
      usePreferences.getState().setShowRepertoryOnly(false);
      expect(usePreferences.getState().showRepertoryOnly).toBe(false);
    });
  });

  describe("setHidePastScreenings", () => {
    it("should set hide past screenings", () => {
      usePreferences.getState().setHidePastScreenings(false);
      expect(usePreferences.getState().hidePastScreenings).toBe(false);
    });
  });

  describe("setDefaultDateRange", () => {
    it("should set date range to today", () => {
      usePreferences.getState().setDefaultDateRange("today");
      expect(usePreferences.getState().defaultDateRange).toBe("today");
    });

    it("should set date range to week", () => {
      usePreferences.getState().setDefaultDateRange("week");
      expect(usePreferences.getState().defaultDateRange).toBe("week");
    });

    it("should set date range to weekend", () => {
      usePreferences.getState().setDefaultDateRange("weekend");
      expect(usePreferences.getState().defaultDateRange).toBe("weekend");
    });
  });

  describe("togglePreferredFormat", () => {
    it("should add format to empty list", () => {
      usePreferences.getState().togglePreferredFormat("35mm");
      expect(usePreferences.getState().preferredFormats).toContain("35mm");
    });

    it("should remove format if already present", () => {
      usePreferences.setState({ preferredFormats: ["35mm", "70mm"] });
      usePreferences.getState().togglePreferredFormat("35mm");
      expect(usePreferences.getState().preferredFormats).not.toContain("35mm");
      expect(usePreferences.getState().preferredFormats).toContain("70mm");
    });
  });

  describe("map actions", () => {
    const testMapArea = {
      bounds: {
        north: 51.6,
        south: 51.4,
        east: 0.1,
        west: -0.2,
      },
      center: { lat: 51.5, lng: -0.05 },
      zoom: 12,
    };

    describe("setMapArea", () => {
      it("should set map area and enable map filtering", () => {
        usePreferences.getState().setMapArea(testMapArea);
        expect(usePreferences.getState().mapArea).toEqual(testMapArea);
        expect(usePreferences.getState().useMapFiltering).toBe(true);
      });

      it("should clear map area and disable filtering when set to null", () => {
        usePreferences.setState({ mapArea: testMapArea, useMapFiltering: true });
        usePreferences.getState().setMapArea(null);
        expect(usePreferences.getState().mapArea).toBeNull();
        expect(usePreferences.getState().useMapFiltering).toBe(false);
      });
    });

    describe("toggleMapFiltering", () => {
      it("should toggle map filtering when mapArea exists", () => {
        usePreferences.setState({ mapArea: testMapArea, useMapFiltering: true });
        usePreferences.getState().toggleMapFiltering();
        expect(usePreferences.getState().useMapFiltering).toBe(false);

        usePreferences.getState().toggleMapFiltering();
        expect(usePreferences.getState().useMapFiltering).toBe(true);
      });

      it("should not enable filtering when mapArea is null", () => {
        usePreferences.setState({ mapArea: null, useMapFiltering: false });
        usePreferences.getState().toggleMapFiltering();
        expect(usePreferences.getState().useMapFiltering).toBe(false);
      });
    });

    describe("clearMapArea", () => {
      it("should clear map area and disable filtering", () => {
        usePreferences.setState({ mapArea: testMapArea, useMapFiltering: true });
        usePreferences.getState().clearMapArea();
        expect(usePreferences.getState().mapArea).toBeNull();
        expect(usePreferences.getState().useMapFiltering).toBe(false);
      });
    });
  });

  describe("reset", () => {
    it("should reset all preferences to defaults", () => {
      usePreferences.setState({
        selectedCinemas: ["bfi"],
        defaultView: "grid",
        calendarViewMode: "screenings",
        showRepertoryOnly: true,
        preferredFormats: ["35mm"],
      });

      usePreferences.getState().reset();

      const state = usePreferences.getState();
      expect(state.selectedCinemas).toEqual([]);
      expect(state.defaultView).toBe("list");
      expect(state.calendarViewMode).toBe("films");
      expect(state.showRepertoryOnly).toBe(false);
      expect(state.preferredFormats).toEqual([]);
    });
  });

  describe("bulkSet", () => {
    it("should merge preferences from server", () => {
      usePreferences.getState().bulkSet({
        selectedCinemas: ["bfi-southbank"],
        defaultView: "grid",
        showRepertoryOnly: true,
      });

      expect(usePreferences.getState().selectedCinemas).toEqual(["bfi-southbank"]);
      expect(usePreferences.getState().defaultView).toBe("grid");
      expect(usePreferences.getState().showRepertoryOnly).toBe(true);
    });
  });

  describe("getAll", () => {
    it("should return all preference values (excluding actions)", () => {
      usePreferences.setState({
        selectedCinemas: ["bfi"],
        defaultView: "grid",
        calendarViewMode: "screenings",
      });

      const all = usePreferences.getState().getAll();

      expect(all.selectedCinemas).toEqual(["bfi"]);
      expect(all.defaultView).toBe("grid");
      expect(all.calendarViewMode).toBe("screenings");
      // Should not have action functions
      expect(all).not.toHaveProperty("toggleCinema");
      expect(all).not.toHaveProperty("reset");
    });
  });
});
