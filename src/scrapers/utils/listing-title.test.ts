import { describe, expect, it } from "vitest";
import {
  bookingUrlNamesTitle,
  isSpecificBookingUrl,
  planListingTitleRepair,
  shoutedTitleToDisplay,
  splitPossessiveCredit,
  storageTitle,
  sameListingTitle,
} from "./listing-title";

describe("shouted Rio titles", () => {
  it.each([
    ["EMPIRE RECORDS", "Empire Records"],
    ["THE WILD ROBOT", "The Wild Robot"],
    ["PENGUIN HIGHWAY", "Penguin Highway"],
    ["THE LITTLE VAMPIRE", "The Little Vampire"],
    ["RETURN TO THE TATLER", "Return to the Tatler"],
    ["SHORTS NIGHT", "Shorts Night"],
    ["BELLY", "Belly"],
    ["ROCKERS", "Rockers"],
    ["THE SOCIAL RECKONING", "The Social Reckoning"],
    ["40 YEARS OF F*N' UP!", "40 Years of F*n' Up!"],
  ])("title-cases %s", (raw, expected) => {
    expect(shoutedTitleToDisplay(raw)).toBe(expected);
  });

  it("leaves mixed case, short tokens and four-letter acronyms", () => {
    expect(shoutedTitleToDisplay("Se7en")).toBe("Se7en");
    expect(shoutedTitleToDisplay("J.G.Ballard’s CRASH")).toBe("J.G.Ballard’s CRASH");
    expect(shoutedTitleToDisplay("NOFX")).toBe("NOFX");
    expect(shoutedTitleToDisplay("II")).toBe("II");
    expect(shoutedTitleToDisplay("HALLOWEEN II")).toBe("Halloween II");
  });
});

describe("possessive credits", () => {
  it("splits a director or an initialled author and keeps real possessive titles whole", () => {
    expect(splitPossessiveCredit("Ken Russell's The Devils")).toEqual({
      credit: "Ken Russell",
      rest: "The Devils",
    });
    expect(splitPossessiveCredit("Rob Zombie's Halloween II")).toEqual({
      credit: "Rob Zombie",
      rest: "Halloween II",
    });
    expect(splitPossessiveCredit("J.G.Ballard’s CRASH")).toEqual({
      credit: "J.G.Ballard",
      rest: "CRASH",
    });
    expect(splitPossessiveCredit("Bram Stoker's Dracula")?.rest).toBe("Dracula");
    expect(splitPossessiveCredit("Schindler's List")).toBeNull();
    expect(splitPossessiveCredit("Rosemary's Baby")).toBeNull();
    expect(splitPossessiveCredit("Ferris Bueller's Day Off")?.rest).toBe("Day Off");
  });

  it("stores the stripped title only when the credit is the director or an initialled author", () => {
    expect(storageTitle("Ken Russell's The Devils", "Ken Russell")).toBe("The Devils");
    expect(storageTitle("J.G.Ballard’s CRASH", "David Cronenberg")).toBe("Crash");
    expect(storageTitle("Bram Stoker's Dracula", "Francis Ford Coppola")).toBe("Bram Stoker's Dracula");
    expect(storageTitle("Rosemary's Baby", "Roman Polanski")).toBe("Rosemary's Baby");
    expect(storageTitle("THE WILD ROBOT")).toBe("The Wild Robot");
  });
});

describe("planListingTitleRepair", () => {
  it("repairs each live QA title", () => {
    expect(planListingTitleRepair({ title: "Ken Russell's The Devils", directors: [], year: null })).toMatchObject({
      title: "The Devils",
    });
    expect(planListingTitleRepair({
      title: "J.G.Ballard’s CRASH",
      directors: ["David Cronenberg"],
      year: 1996,
    })).toMatchObject({ title: "Crash", year: 1996 });
    expect(planListingTitleRepair({
      title: "Rob Zombie's Halloween II (2009) • Director's Cut",
      directors: ["Rob Zombie"],
      year: null,
    })).toMatchObject({ title: "Halloween II", year: 2009 });
    expect(planListingTitleRepair({
      title: "Horror for a Cause - Save the Cinema Museum - The Evil Dead",
      directors: [],
      year: 1981,
    })).toMatchObject({ title: "The Return of the Living Dead", year: 1985 });
    expect(planListingTitleRepair({ title: "Carers & Babies: THE SOCIAL RECKONING", directors: [], year: 2026 }))
      .toMatchObject({ title: "The Social Reckoning" });
    expect(planListingTitleRepair({ title: "Parent and Baby: The Social Reckoning", directors: [], year: null }))
      .toMatchObject({ title: "The Social Reckoning" });
    expect(planListingTitleRepair({ title: "Hard of Hearing: THE SOCIAL RECKONING", directors: [], year: null }))
      .toMatchObject({ title: "The Social Reckoning" });
    expect(planListingTitleRepair({
      title: "Akinola Davies presents BELLY",
      directors: ["ype Williams"],
      year: 1998,
    })).toMatchObject({ title: "Belly", directors: ["Hype Williams"], year: 1998 });
    expect(planListingTitleRepair({
      title: "Akinola Davies presents ROCKERS",
      directors: ["Ted Bafaloukos"],
      year: 1978,
    })).toMatchObject({ title: "Rockers" });
    expect(planListingTitleRepair({ title: "Clarissa (Film Africa)", directors: [], year: null }))
      .toMatchObject({ title: "Clarissa" });
    expect(planListingTitleRepair({ title: "Congo Boy (Film Africa)", directors: [], year: null }))
      .toMatchObject({ title: "Congo Boy" });
    expect(planListingTitleRepair({ title: "Amy Winehouse 'Back To Black", directors: [], year: null }))
      .toMatchObject({ title: "Back to Black" });
    expect(planListingTitleRepair({ title: "EMPIRE RECORDS", directors: [], year: 1995 }))
      .toMatchObject({ title: "Empire Records" });
    expect(planListingTitleRepair({ title: "THE WILD ROBOT", directors: [], year: null }))
      .toMatchObject({ title: "The Wild Robot" });
    expect(planListingTitleRepair({ title: "PENGUIN HIGHWAY", directors: [], year: null }))
      .toMatchObject({ title: "Penguin Highway" });
    expect(planListingTitleRepair({ title: "THE LITTLE VAMPIRE", directors: [], year: null }))
      .toMatchObject({ title: "The Little Vampire" });
    expect(planListingTitleRepair({ title: "SHORTS NIGHT", directors: [], year: null }))
      .toMatchObject({ title: "Shorts Night" });
    expect(planListingTitleRepair({
      title: "RETURN TO THE TATLER",
      directors: ["Bette Gordon"],
      year: 1983,
    })).toMatchObject({ title: "Variety", year: 1983 });
    expect(planListingTitleRepair({ title: "Variety", directors: ["Bette Gordon"], year: 1985 }))
      .toMatchObject({ title: "Variety", year: 1983 });
    expect(planListingTitleRepair({ title: "Seven", directors: ["David Fincher"], year: null }))
      .toMatchObject({ title: "Se7en", year: 1995 });
  });

  it("does not rewrite titles that are already the film", () => {
    expect(planListingTitleRepair({ title: "Se7en", directors: ["David Fincher"], year: 1995 })).toBeNull();
    expect(planListingTitleRepair({ title: "The Devils", directors: ["Ken Russell"], year: 1971 })).toBeNull();
    expect(planListingTitleRepair({ title: "Bram Stoker's Dracula", directors: ["Francis Ford Coppola"], year: 1992 })).toBeNull();
    expect(planListingTitleRepair({ title: "Schindler's List", directors: ["Steven Spielberg"], year: 1993 })).toBeNull();
    expect(planListingTitleRepair({ title: "Rosemary's Baby", directors: ["Roman Polanski"], year: 1968 })).toBeNull();
    expect(planListingTitleRepair({ title: "Seven", directors: ["Andy Sidaris"], year: 1979 })).toBeNull();
    expect(planListingTitleRepair({ title: "NOFX", directors: [], year: null })).toBeNull();
  });
});

describe("booking URLs", () => {
  it("treats an event slug as specific and a calendar as not", () => {
    expect(isSpecificBookingUrl(
      "https://cinemamuseum.org.uk/scheduled/horror-for-a-cause-save-the-cinema-museum-the-return-of-the-living-dead-1985/",
    )).toBe(true);
    expect(isSpecificBookingUrl("https://riocinema.org.uk/Rio.dll/WhatsOn?f=2796447")).toBe(true);
    expect(isSpecificBookingUrl("https://cinemamuseum.org.uk/schedule/")).toBe(false);
    expect(isSpecificBookingUrl("https://riocinema.org.uk/Rio.dll/WhatsOn")).toBe(false);
  });

  it("sees The Return of the Living Dead in the Cinema Museum slug", () => {
    const url = "https://cinemamuseum.org.uk/scheduled/horror-for-a-cause-save-the-cinema-museum-the-return-of-the-living-dead-1985/";
    expect(bookingUrlNamesTitle(url, "The Return of the Living Dead")).toBe(true);
    expect(bookingUrlNamesTitle(url, "The Evil Dead")).toBe(false);
  });
});

describe("sameListingTitle", () => {
  const normalize = (title: string) =>
    title.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  it("treats Se7en and Seven as one listing for Fincher or the stylized spelling", () => {
    expect(sameListingTitle(
      { title: "Se7en", directors: ["David Fincher"] },
      { title: "Seven", directors: ["David Fincher"] },
      normalize,
    )).toBe(true);
    expect(sameListingTitle(
      { title: "Seven", directors: ["Andy Sidaris"] },
      { title: "Seven Samurai", directors: ["Akira Kurosawa"] },
      normalize,
    )).toBe(false);
  });
});
