import { getTMDBClient } from "@/lib/tmdb";

async function main() {
  const tmdb = getTMDBClient();
  // The film is the 2013 Brazilian animation "O Menino e o Mundo" /
  // English "Boy and the World"
  const results = await tmdb.searchFilms("O Menino e o Mundo", 2013);
  console.log(`Search results for "O Menino e o Mundo" 2013:`);
  for (const r of results.results.slice(0, 5)) {
    console.log(`  TMDB ${r.id}: ${r.title} (orig: ${r.original_title}, ${r.release_date}, popularity ${r.popularity})`);
  }
  console.log("---");
  const results2 = await tmdb.searchFilms("Boy and the World");
  console.log(`Search results for "Boy and the World":`);
  for (const r of results2.results.slice(0, 5)) {
    console.log(`  TMDB ${r.id}: ${r.title} (orig: ${r.original_title}, ${r.release_date}, popularity ${r.popularity})`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
