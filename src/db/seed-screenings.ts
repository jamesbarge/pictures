/**
 * Seed script for test screenings
 * Creates sample films and screenings for development
 */

import { db } from "./index";
import { films, screenings, cinemas } from "./schema";
import { v4 as uuidv4 } from "uuid";
import { addDays, setHours, setMinutes } from "date-fns";
import type { ScreeningFormat, EventType } from "@/types/screening";

// Sample films with real TMDB-style data
const sampleFilms = [
  {
    title: "2001: A Space Odyssey",
    year: 1968,
    directors: ["Stanley Kubrick"],
    cast: ["Keir Dullea", "Gary Lockwood", "William Sylvester"],
    genres: ["science fiction", "drama"],
    runtime: 149,
    posterUrl: "https://image.tmdb.org/t/p/w500/ve72VxNqjGM69Pk8gWyuEnRq2mF.jpg",
    synopsis: "Humanity finds a mysterious object buried beneath the lunar surface and sets off to find its origins with the help of HAL 9000, the world's most advanced super computer.",
    isRepertory: true,
    decade: "1960s",
    tmdbRating: 8.3,
  },
  {
    title: "In the Mood for Love",
    year: 2000,
    directors: ["Wong Kar-wai"],
    cast: ["Tony Leung Chiu-wai", "Maggie Cheung", "Siu Ping-lam"],
    genres: ["drama", "romance"],
    runtime: 98,
    posterUrl: "https://image.tmdb.org/t/p/w500/iYypPT4bhqXfq1b6EnmxvRt6b2Y.jpg",
    synopsis: "Two neighbors form a strong bond after discovering that their spouses are having an affair.",
    isRepertory: true,
    decade: "2000s",
    tmdbRating: 8.1,
  },
  {
    title: "The Substance",
    year: 2024,
    directors: ["Coralie Fargeat"],
    cast: ["Demi Moore", "Margaret Qualley", "Dennis Quaid"],
    genres: ["horror", "science fiction"],
    runtime: 141,
    posterUrl: "https://image.tmdb.org/t/p/w500/lqoMzCcZYEFK729d6qzt349fB4o.jpg",
    synopsis: "A fading celebrity discovers a black market drug that temporarily creates a younger, better version of herself.",
    isRepertory: false,
    decade: "2020s",
    tmdbRating: 7.3,
  },
  {
    title: "Anora",
    year: 2024,
    directors: ["Sean Baker"],
    cast: ["Mikey Madison", "Mark Eydelshteyn", "Yura Borisov"],
    genres: ["comedy", "drama"],
    runtime: 139,
    posterUrl: "https://image.tmdb.org/t/p/w500/mEzSKlXhmFhZ60WXrLuXuhoFCqz.jpg",
    synopsis: "A young sex worker from Brooklyn gets her chance at a Cinderella story when she meets and impulsively marries the son of an oligarch.",
    isRepertory: false,
    decade: "2020s",
    tmdbRating: 7.6,
  },
  {
    title: "Paris, Texas",
    year: 1984,
    directors: ["Wim Wenders"],
    cast: ["Harry Dean Stanton", "Nastassja Kinski", "Dean Stockwell"],
    genres: ["drama"],
    runtime: 145,
    posterUrl: "https://image.tmdb.org/t/p/w500/j9WsFmHFGZdYnPEtpKNy9fkVGI5.jpg",
    synopsis: "A man wanders out of the desert after a four-year absence and tries to reconnect with his young son.",
    isRepertory: true,
    decade: "1980s",
    tmdbRating: 8.0,
  },
  {
    title: "Mulholland Drive",
    year: 2001,
    directors: ["David Lynch"],
    cast: ["Naomi Watts", "Laura Harring", "Justin Theroux"],
    genres: ["thriller", "mystery", "drama"],
    runtime: 147,
    posterUrl: "https://image.tmdb.org/t/p/w500/tVxGt7uffLVhIIcwuldXJKX9mAB.jpg",
    synopsis: "After a car wreck on Mulholland Drive, an amnesiac woman and an aspiring actress uncover the dark secrets of Los Angeles.",
    isRepertory: true,
    decade: "2000s",
    tmdbRating: 7.9,
  },
  {
    title: "Nosferatu",
    year: 2024,
    directors: ["Robert Eggers"],
    cast: ["Bill Skarsgård", "Lily-Rose Depp", "Nicholas Hoult"],
    genres: ["horror", "fantasy"],
    runtime: 132,
    posterUrl: "https://image.tmdb.org/t/p/w500/5qGIxdEO841C0tdY8vOdLoRVrr0.jpg",
    synopsis: "A gothic tale of obsession between a haunted young woman and the terrifying vampire infatuated with her.",
    isRepertory: false,
    decade: "2020s",
    tmdbRating: 7.1,
  },
  {
    title: "Stalker",
    year: 1979,
    directors: ["Andrei Tarkovsky"],
    cast: ["Alisa Freyndlikh", "Aleksandr Kaydanovskiy", "Anatoliy Solonitsyn"],
    genres: ["science fiction", "drama"],
    runtime: 162,
    posterUrl: "https://image.tmdb.org/t/p/w500/3PVLxpQbwLXcBGUV3AAVnqj7rmJ.jpg",
    synopsis: "A guide leads two men through an apocalyptic wasteland called the Zone to find a room that grants wishes.",
    isRepertory: true,
    decade: "1970s",
    tmdbRating: 8.1,
  },
];

// Screening times (hours in 24h format)
const screeningTimes = [14, 16, 18, 20, 21];

async function seedScreenings() {
  console.log("🎬 Seeding test screenings...");

  // Get all cinemas
  const allCinemas = await db.select().from(cinemas);
  if (allCinemas.length === 0) {
    console.error("No cinemas found! Run the cinema seed first.");
    process.exit(1);
  }

  // Insert films
  const filmIds: string[] = [];
  for (const film of sampleFilms) {
    const id = uuidv4();
    filmIds.push(id);

    await db.insert(films).values({
      id,
      title: film.title,
      year: film.year,
      directors: film.directors,
      // Convert cast strings to CastMember objects
      cast: film.cast.map((name, index) => ({ name, order: index })),
      genres: film.genres,
      runtime: film.runtime,
      posterUrl: film.posterUrl,
      synopsis: film.synopsis,
      isRepertory: film.isRepertory,
      decade: film.decade,
      tmdbRating: film.tmdbRating,
      countries: [],
      languages: [],
    });

    console.log(`  ✓ Created film: ${film.title}`);
  }

  // Create screenings for the next 14 days
  const today = new Date();
  let screeningCount = 0;

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const date = addDays(today, dayOffset);

    // Each cinema gets 2-4 screenings per day
    for (const cinema of allCinemas) {
      const numScreenings = Math.floor(Math.random() * 3) + 2; // 2-4 screenings
      const usedFilms = new Set<number>();

      for (let i = 0; i < numScreenings; i++) {
        // Pick a random film we haven't used today at this cinema
        let filmIndex: number;
        do {
          filmIndex = Math.floor(Math.random() * filmIds.length);
        } while (usedFilms.has(filmIndex) && usedFilms.size < filmIds.length);
        usedFilms.add(filmIndex);

        // Pick a random time
        const hour = screeningTimes[Math.floor(Math.random() * screeningTimes.length)];
        const datetime = setMinutes(setHours(date, hour), Math.random() > 0.5 ? 0 : 30);

        // Random format based on cinema capabilities
        let format: string | undefined;
        if (cinema.features?.includes("imax") && Math.random() > 0.7) {
          format = "imax";
        } else if (cinema.features?.includes("35mm") && Math.random() > 0.6) {
          format = "35mm";
        } else if (cinema.features?.includes("70mm") && Math.random() > 0.85) {
          format = "70mm";
        }

        // Random event type
        let eventType: string | undefined;
        if (Math.random() > 0.85) {
          eventType = Math.random() > 0.5 ? "q_and_a" : "intro";
        }

        await db.insert(screenings).values({
          id: uuidv4(),
          filmId: filmIds[filmIndex],
          cinemaId: cinema.id,
          datetime,
          format: format as ScreeningFormat | null,
          screen: `Screen ${Math.floor(Math.random() * 4) + 1}`,
          eventType: eventType as EventType | null,
          bookingUrl: `${cinema.website}/book/${filmIds[filmIndex]}`,
          scrapedAt: new Date(),
        });

        screeningCount++;
      }
    }
  }

  console.log(`\n✅ Created ${screeningCount} screenings across ${allCinemas.length} cinemas`);
}

seedScreenings()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error seeding screenings:", err);
    process.exit(1);
  });
