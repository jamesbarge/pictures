import { describe, expect, it } from "vitest";
import {
  TIME_PRESETS,
  formatHour,
  formatTimeRange,
  getProgrammingTypeLabel,
  getTimeOfDayFromHour,
  getTimeOfDayLabel,
  isIndependentCinema,
  isProgrammingType,
  isTimeOfDay,
  matchesTimePreset,
} from "./filter-constants";

describe("isProgrammingType", () => {
  it("returns true for valid programming type strings", () => {
    expect(isProgrammingType("repertory")).toBe(true);
    expect(isProgrammingType("new_release")).toBe(true);
    expect(isProgrammingType("special_event")).toBe(true);
    expect(isProgrammingType("preview")).toBe(true);
  });

  it("returns false for invalid strings", () => {
    expect(isProgrammingType("imax")).toBe(false);
    expect(isProgrammingType("")).toBe(false);
    expect(isProgrammingType("Repertory")).toBe(false); // case-sensitive
  });
});

describe("isTimeOfDay", () => {
  it("returns true for the 4 valid TimeOfDay values", () => {
    expect(isTimeOfDay("morning")).toBe(true);
    expect(isTimeOfDay("afternoon")).toBe(true);
    expect(isTimeOfDay("evening")).toBe(true);
    expect(isTimeOfDay("late_night")).toBe(true);
  });

  it("returns false for invalid strings", () => {
    expect(isTimeOfDay("Morning")).toBe(false);
    expect(isTimeOfDay("midnight")).toBe(false);
    expect(isTimeOfDay("")).toBe(false);
  });
});

describe("getTimeOfDayLabel", () => {
  it("returns the canonical label for each time-of-day", () => {
    expect(getTimeOfDayLabel("morning")).toBe("Morning (before 12pm)");
    expect(getTimeOfDayLabel("afternoon")).toBe("Afternoon (12pm-5pm)");
    expect(getTimeOfDayLabel("evening")).toBe("Evening (5pm-9pm)");
    expect(getTimeOfDayLabel("late_night")).toBe("Late Night (after 9pm)");
  });
});

describe("getTimeOfDayFromHour", () => {
  it("hour 0-11 → morning", () => {
    expect(getTimeOfDayFromHour(0)).toBe("morning");
    expect(getTimeOfDayFromHour(11)).toBe("morning");
  });

  it("hour 12-16 → afternoon", () => {
    expect(getTimeOfDayFromHour(12)).toBe("afternoon");
    expect(getTimeOfDayFromHour(16)).toBe("afternoon");
  });

  it("hour 17-20 → evening", () => {
    expect(getTimeOfDayFromHour(17)).toBe("evening");
    expect(getTimeOfDayFromHour(20)).toBe("evening");
  });

  it("hour 21-23 → late_night", () => {
    expect(getTimeOfDayFromHour(21)).toBe("late_night");
    expect(getTimeOfDayFromHour(23)).toBe("late_night");
  });
});

describe("getProgrammingTypeLabel", () => {
  it("returns the canonical label for each programming type", () => {
    expect(getProgrammingTypeLabel("repertory")).toBe("Repertory / Classic");
    expect(getProgrammingTypeLabel("new_release")).toBe("New Release");
    expect(getProgrammingTypeLabel("special_event")).toBe("Special Event");
    expect(getProgrammingTypeLabel("preview")).toBe("Preview / Premiere");
  });
});

describe("isIndependentCinema", () => {
  it("returns true for null chain", () => {
    expect(isIndependentCinema(null)).toBe(true);
  });

  it("returns true for 'BFI' (treated as independent despite having a chain value)", () => {
    // Pinned contract — the BFI exception is intentional and documented in code.
    expect(isIndependentCinema("BFI")).toBe(true);
  });

  it("returns false for actual chains", () => {
    expect(isIndependentCinema("Curzon")).toBe(false);
    expect(isIndependentCinema("Picturehouse")).toBe(false);
    expect(isIndependentCinema("Everyman")).toBe(false);
  });

  it("is case-sensitive on the BFI exception", () => {
    expect(isIndependentCinema("bfi")).toBe(false);
  });
});

describe("formatHour", () => {
  it("formats midnight as 12am", () => {
    expect(formatHour(0)).toBe("12am");
  });

  it("formats noon as 12pm", () => {
    expect(formatHour(12)).toBe("12pm");
  });

  it("formats morning hours with am suffix", () => {
    expect(formatHour(1)).toBe("1am");
    expect(formatHour(9)).toBe("9am");
    expect(formatHour(11)).toBe("11am");
  });

  it("formats afternoon/evening hours with pm suffix", () => {
    expect(formatHour(13)).toBe("1pm");
    expect(formatHour(14)).toBe("2pm");
    expect(formatHour(20)).toBe("8pm");
    expect(formatHour(23)).toBe("11pm");
  });
});

describe("formatTimeRange", () => {
  it("returns 'Any Time' when both bounds are null", () => {
    expect(formatTimeRange(null, null)).toBe("Any Time");
  });

  it("returns 'After Xpm' when only `from` is set", () => {
    expect(formatTimeRange(17, null)).toBe("After 5pm");
  });

  it("returns 'Before Xpm' when only `to` is set (note: +1 to convert to end-of-hour)", () => {
    expect(formatTimeRange(null, 11)).toBe("Before 12pm");
  });

  it("returns a single hour when from === to", () => {
    expect(formatTimeRange(14, 14)).toBe("2pm");
  });

  it("returns 'Xpm - Ypm' for a range (note: `to+1` semantics)", () => {
    // `to: 16` means "up to and including 4pm" → display as "5pm" end.
    expect(formatTimeRange(12, 16)).toBe("12pm - 5pm");
  });

  it("handles across-noon ranges (am → pm)", () => {
    expect(formatTimeRange(9, 12)).toBe("9am - 1pm");
  });
});

describe("matchesTimePreset", () => {
  const morning = TIME_PRESETS[0];
  const evening = TIME_PRESETS[2];

  it("returns true when from/to exactly match the preset", () => {
    expect(matchesTimePreset(morning.from, morning.to, morning)).toBe(true);
    expect(matchesTimePreset(evening.from, evening.to, evening)).toBe(true);
  });

  it("returns false when from differs", () => {
    expect(matchesTimePreset(1, morning.to, morning)).toBe(false);
  });

  it("returns false when to differs", () => {
    expect(matchesTimePreset(morning.from, morning.to + 1, morning)).toBe(false);
  });

  it("returns false when either is null", () => {
    expect(matchesTimePreset(null, morning.to, morning)).toBe(false);
    expect(matchesTimePreset(morning.from, null, morning)).toBe(false);
  });
});
