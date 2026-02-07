# iOS API Reference

Base URL: `https://pictures.london`

All endpoints are public (no auth required), rate-limited to 100 req/min per IP, and return JSON with `Cache-Control` headers.

---

## GET /api/screenings

List screenings with filtering and optional cursor pagination.

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `startDate` | ISO 8601 datetime | now | Start of date range |
| `endDate` | ISO 8601 datetime | +14 days | End of date range |
| `cinemas` | string | — | Comma-separated cinema IDs |
| `formats` | string | — | Comma-separated: `35mm`, `70mm`, `imax`, `dolby_cinema`, `4dx`, etc. |
| `repertory` | `"true"` \| `"false"` | — | Filter by repertory status |
| `festivalOnly` | `"true"` \| `"false"` | — | Only festival screenings |
| `festival` | string | — | Festival slug |
| `season` | string | — | Season slug |
| `cursor` | string | — | Opaque cursor from previous response |
| `limit` | integer (1-500) | 200 | Page size (activates cursor pagination) |

### Response

```jsonc
{
  "screenings": [
    {
      "id": "4bbcf888-7559-40db-8dcc-cf9c63d9935e",
      "datetime": "2026-02-07T17:15:00.000Z",
      "format": "dcp",              // "35mm" | "70mm" | "imax" | "dolby_cinema" | "4dx" | "dcp" | "dcp_4k" | "imax_laser" | "screenx" | "unknown" | null
      "screen": "Screen 1",         // nullable
      "eventType": "q_and_a",       // nullable
      "eventDescription": null,     // nullable
      "bookingUrl": "https://...",
      "isFestivalScreening": false,
      "availabilityStatus": null,    // "available" | "low" | "sold_out" | "returns" | "unknown" | null
      "hasSubtitles": false,
      "hasAudioDescription": false,
      "isRelaxedScreening": false,
      "film": {
        "id": "14f85c43-b607-42fc-a482-3b628676499f",
        "title": "Sinners",
        "year": 2025,
        "directors": ["Ryan Coogler"],
        "posterUrl": "https://image.tmdb.org/...",
        "runtime": 137,
        "isRepertory": false,
        "letterboxdRating": 3.89,   // 0-5 scale, nullable
        "contentType": "film",      // "film" | "concert" | "live_broadcast" | "event"
        "tmdbRating": 7.5           // 0-10 scale, nullable
      },
      "cinema": {
        "id": "bfi-southbank",
        "name": "BFI Southbank",
        "shortName": "BFI"          // nullable
      }
    }
  ],
  "meta": {
    "total": 3,                     // count in this response
    "startDate": "2026-02-07T...",
    "endDate": "2026-02-21T...",
    // Only present when cursor/limit is used:
    "cursor": "2026-02-07T17:15:00.000Z_4bbcf888-...",  // null if no more pages
    "hasMore": true,
    "limit": 3
  }
}
```

### Pagination

Pass `limit` to activate cursor pagination. Use the returned `cursor` value in the next request to get the next page. When `hasMore` is `false`, you've reached the end.

```
GET /api/screenings?limit=50
GET /api/screenings?limit=50&cursor={cursor from previous response}
```

Without `cursor`/`limit`, the legacy non-paginated response is returned (up to 3000 results, no cursor metadata).

---

## GET /api/films/:id

Get full film metadata and upcoming screenings.

### Path Parameters

| Param | Type | Description |
|-------|------|-------------|
| `id` | UUID | Film ID |

### Response (200)

```jsonc
{
  "film": {
    "id": "14f85c43-b607-42fc-a482-3b628676499f",
    "tmdbId": 12345,               // nullable
    "imdbId": "tt1234567",          // nullable
    "title": "Sinners",
    "originalTitle": null,          // nullable (non-English films)
    "year": 2025,                   // nullable
    "runtime": 137,                 // minutes, nullable
    "contentType": "film",          // "film" | "concert" | "live_broadcast" | "event"
    "directors": ["Ryan Coogler"],
    "cast": [                       // array of cast members
      { "name": "Michael B. Jordan", "character": "Smoke", "order": 0 }
    ],
    "genres": ["horror", "drama"],
    "countries": ["US"],
    "languages": ["en"],
    "certification": "15",          // nullable
    "synopsis": "...",              // nullable
    "tagline": "...",               // nullable
    "posterUrl": "https://image.tmdb.org/t/p/w500/...",   // nullable
    "backdropUrl": "https://image.tmdb.org/t/p/w1280/...", // nullable
    "sourceImageUrl": null,         // fallback image from cinema website, nullable
    "trailerUrl": null,             // YouTube URL, nullable
    "isRepertory": false,
    "decade": "2020s",              // nullable
    "tmdbRating": 7.5,              // 0-10, nullable
    "letterboxdRating": 3.89,       // 0-5, nullable
    "letterboxdUrl": "https://letterboxd.com/film/sinners/"  // nullable
  },
  "screenings": [
    {
      "id": "...",
      "datetime": "2026-02-07T17:15:00.000Z",
      "format": "dcp",
      "screen": "Screen 1",
      "eventType": null,
      "eventDescription": null,
      "bookingUrl": "https://...",
      "isFestivalScreening": false,
      "availabilityStatus": null,
      "hasSubtitles": false,
      "hasAudioDescription": false,
      "isRelaxedScreening": false,
      "cinema": {
        "id": "bfi-southbank",
        "name": "BFI Southbank",
        "shortName": "BFI",
        "address": {                // nullable
          "street": "Belvedere Road",
          "area": "South Bank",
          "postcode": "SE1 8XT",
          "borough": "Lambeth"
        }
      }
    }
  ],
  "meta": {
    "screeningCount": 25
  }
}
```

### Errors

| Status | Body | When |
|--------|------|------|
| 400 | `{"error": "Invalid film ID", "details": {...}}` | ID is not a valid UUID |
| 404 | `{"error": "Film not found", "code": "NOT_FOUND"}` | No film with this ID |
| 429 | `{"error": "Too many requests"}` | Rate limit exceeded |

---

## GET /api/cinemas

List all active London cinemas.

### Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `chain` | string | Filter by chain name (exact match): `"Curzon"`, `"Picturehouse"`, `"Everyman"`, etc. |
| `features` | string | Comma-separated features (any match): `"imax"`, `"35mm"`, `"dolby_atmos"`, etc. |

### Response (200)

```jsonc
{
  "cinemas": [
    {
      "id": "bfi-southbank",
      "name": "BFI Southbank",
      "shortName": "BFI",
      "chain": "BFI",              // nullable
      "address": {                 // nullable
        "street": "Belvedere Road",
        "area": "South Bank",
        "postcode": "SE1 8XT",
        "borough": "Lambeth"
      },
      "coordinates": {             // nullable
        "lat": 51.5074,
        "lng": -0.1157
      },
      "screens": 4,               // nullable
      "features": ["independent", "repertory", "archive"],
      "programmingFocus": ["repertory", "arthouse", "documentary"],
      "website": "https://www.bfi.org.uk/bfi-southbank",
      "bookingUrl": null,          // nullable
      "imageUrl": null             // nullable
    }
  ],
  "meta": {
    "total": 63
  }
}
```

Cache: `s-maxage=600` (10 minutes) — cinema data changes rarely.

No pagination needed (~40-65 cinemas in London).

---

## GET /api/cinemas/:id

Get cinema details with upcoming screenings.

### Path Parameters

| Param | Type | Description |
|-------|------|-------------|
| `id` | string | Cinema slug ID (e.g. `"bfi-southbank"`, `"curzon-soho"`) |

### Response (200)

```jsonc
{
  "cinema": {
    "id": "bfi-southbank",
    "name": "BFI Southbank",
    "shortName": "BFI",
    "chain": "BFI",
    "address": { "street": "...", "area": "...", "postcode": "...", "borough": "..." },
    "coordinates": { "lat": 51.5074, "lng": -0.1157 },
    "screens": 4,
    "features": ["independent", "repertory", "archive"],
    "programmingFocus": ["repertory", "arthouse", "documentary"],
    "website": "https://...",
    "bookingUrl": null,
    "imageUrl": null,
    "description": "The UK's leading repertory cinema..."  // nullable, only in detail
  },
  "screenings": [
    {
      "id": "...",
      "datetime": "2026-02-07T18:00:00.000Z",
      "format": "dcp",
      "screen": "NFT1",
      "eventType": "q_and_a",
      "eventDescription": "With director in attendance",
      "bookingUrl": "https://...",
      "isFestivalScreening": false,
      "availabilityStatus": null,
      "hasSubtitles": false,
      "hasAudioDescription": false,
      "isRelaxedScreening": false,
      "film": {
        "id": "...",
        "title": "The Chronology of Water",
        "year": 2025,
        "posterUrl": "https://...",
        "runtime": 108,
        "directors": ["Kristen Stewart"],
        "isRepertory": false,
        "letterboxdRating": 3.2,
        "contentType": "film"
      }
    }
  ],
  "meta": {
    "screeningCount": 100          // capped at 100
  }
}
```

### Errors

| Status | Body | When |
|--------|------|------|
| 400 | `{"error": "Invalid cinema ID", "details": {...}}` | ID validation failed |
| 404 | `{"error": "Cinema not found", "code": "NOT_FOUND"}` | No cinema with this ID |
| 429 | `{"error": "Too many requests"}` | Rate limit exceeded |

---

## Common Patterns

### Rate Limiting

All endpoints: 100 requests per 60 seconds per IP. On 429, the `Retry-After` header contains seconds until reset.

### Caching

| Endpoint | s-maxage | stale-while-revalidate |
|----------|----------|----------------------|
| `/api/screenings` | 300s (5min) | 600s (10min) |
| `/api/films/:id` | 300s (5min) | 600s (10min) |
| `/api/cinemas` | 600s (10min) | 1200s (20min) |
| `/api/cinemas/:id` | 300s (5min) | 600s (10min) |

### Error Format

All errors follow:
```json
{
  "error": "Human-readable message",
  "code": "MACHINE_CODE",
  "details": {}
}
```

### Content Types

Films have a `contentType` field that classifies what kind of event it is:

| Value | Description |
|-------|-------------|
| `film` | Traditional movie (matched to TMDB) |
| `concert` | Music performance, album screening |
| `live_broadcast` | NT Live, Met Opera, ballet broadcasts |
| `event` | Quiz nights, Q&As, special events |

### Screening Formats

| Value | Description |
|-------|-------------|
| `35mm` | 35mm film print |
| `70mm` | 70mm film print |
| `70mm_imax` | 70mm IMAX |
| `dcp` | Digital Cinema Package |
| `dcp_4k` | 4K DCP |
| `imax` | Digital IMAX |
| `imax_laser` | IMAX Laser |
| `dolby_cinema` | Dolby Cinema |
| `4dx` | 4DX |
| `screenx` | ScreenX |
| `unknown` | Format not determined |
