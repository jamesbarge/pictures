import { describe, it, expect } from "vitest";

import { classifyContent } from "./content-classifier";

describe("quickClassify — event patterns", () => {
  it("classifies quiz night as event", async () => {
    const result = await classifyContent("Quiz Night");
    expect(result.contentType).toBe("event");
  });

  it("classifies café philo as event", async () => {
    const result = await classifyContent("Café Philo");
    expect(result.contentType).toBe("event");
  });

  it("classifies private hire as event", async () => {
    const result = await classifyContent("Private Hire");
    expect(result.contentType).toBe("event");
  });

  it("classifies mystery movie as film", async () => {
    const result = await classifyContent("Mystery Movie");
    expect(result.contentType).toBe("film");
  });

  it("classifies musical bingo as event", async () => {
    const result = await classifyContent("Musical Bingo Night");
    expect(result.contentType).toBe("event");
  });

  it("classifies comedy club as event", async () => {
    const result = await classifyContent("Comedy Club");
    expect(result.contentType).toBe("event");
  });

  it("classifies comedy night as event", async () => {
    const result = await classifyContent("Stand-Up Comedy Night");
    expect(result.contentType).toBe("event");
  });

  it("classifies member poll as event", async () => {
    const result = await classifyContent("Member Poll: Vote for Next Month's Film");
    expect(result.contentType).toBe("event");
  });

  it("classifies member quiz as event", async () => {
    const result = await classifyContent("Member Quiz Night");
    expect(result.contentType).toBe("event");
  });

  it("classifies 'in conversation with' as event", async () => {
    const result = await classifyContent("In Conversation With Steve McQueen");
    expect(result.contentType).toBe("event");
  });
});

describe("quickClassify — live broadcast patterns", () => {
  it("classifies NT Live as live_broadcast", async () => {
    const result = await classifyContent("NT Live: Hamlet");
    expect(result.contentType).toBe("live_broadcast");
    expect(result.cleanTitle).toBe("Hamlet");
  });

  it("classifies Royal Opera House as live_broadcast", async () => {
    const result = await classifyContent("Royal Opera House: La Traviata");
    expect(result.contentType).toBe("live_broadcast");
    expect(result.cleanTitle).toBe("La Traviata");
  });

  it("classifies The Royal Opera as live_broadcast", async () => {
    const result = await classifyContent("The Royal Opera: Carmen");
    expect(result.contentType).toBe("live_broadcast");
    expect(result.cleanTitle).toBe("Carmen");
  });

  it("classifies ROH Encore as live_broadcast", async () => {
    const result = await classifyContent("ROH Encore: Swan Lake");
    expect(result.contentType).toBe("live_broadcast");
    expect(result.cleanTitle).toBe("Swan Lake");
  });

  it("classifies ROH Cinema as live_broadcast", async () => {
    const result = await classifyContent("ROH Cinema: The Nutcracker");
    expect(result.contentType).toBe("live_broadcast");
    expect(result.cleanTitle).toBe("The Nutcracker");
  });

  it("classifies RBO Cinema as live_broadcast", async () => {
    const result = await classifyContent("RBO Cinema: Giselle");
    expect(result.contentType).toBe("live_broadcast");
    expect(result.cleanTitle).toBe("Giselle");
  });

  it("classifies RBO Encore as live_broadcast", async () => {
    const result = await classifyContent("RBO Encore: Siegfried");
    expect(result.contentType).toBe("live_broadcast");
    expect(result.cleanTitle).toBe("Siegfried");
  });

  it("classifies Exhibition on Screen as live_broadcast", async () => {
    const result = await classifyContent("Exhibition on Screen: Vermeer");
    expect(result.contentType).toBe("live_broadcast");
    expect(result.cleanTitle).toBe("Vermeer");
  });

  it("classifies Bolshoi Ballet as live_broadcast", async () => {
    const result = await classifyContent("Bolshoi Ballet: Swan Lake");
    expect(result.contentType).toBe("live_broadcast");
    expect(result.cleanTitle).toBe("Swan Lake");
  });

  it("extracts year from live broadcast title", async () => {
    const result = await classifyContent("NT Live: Hamlet (2026)");
    expect(result.contentType).toBe("live_broadcast");
    expect(result.cleanTitle).toBe("Hamlet");
    expect(result.year).toBe(2026);
  });
});

describe("quickClassify — concert patterns", () => {
  it("classifies 'in concert' as concert", async () => {
    const result = await classifyContent("Hans Zimmer in Concert");
    expect(result.contentType).toBe("concert");
  });

  it("classifies live performance with 'in concert'", async () => {
    const result = await classifyContent("Radiohead in Concert: A Film");
    expect(result.contentType).toBe("concert");
  });
});

describe("quickClassify — clean film titles", () => {
  it("classifies simple film titles as film", async () => {
    const result = await classifyContent("Nosferatu");
    expect(result.contentType).toBe("film");
    expect(result.cleanTitle).toBe("Nosferatu");
  });

  it("extracts year from film title", async () => {
    const result = await classifyContent("Solaris (1972)");
    expect(result.contentType).toBe("film");
    expect(result.cleanTitle).toBe("Solaris");
    expect(result.year).toBe(1972);
  });

  it("strips BBFC ratings from film titles", async () => {
    const result = await classifyContent("Paddington (U)");
    expect(result.contentType).toBe("film");
    expect(result.cleanTitle).toBe("Paddington");
  });
});
