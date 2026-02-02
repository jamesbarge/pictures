# Social Outreach Pipeline

Automated pipeline that scrapes Instagram, TikTok, YouTube, and Reddit for London-based film enthusiasts and syncs them to Attio CRM.

## How It Works

1. **Weekly Cron** (Sundays 10am UTC) - GitHub Action triggers the pipeline
2. **Apify Scrapers** - Runs 4 platform scrapers via Apify API
3. **Filtering** - Filters for active users interested in London cinema
4. **Attio Sync** - Upserts contacts to Attio People object

## Platforms Scraped

| Platform | Actor | What We Scrape |
|----------|-------|----------------|
| Instagram | `apify/instagram-hashtag-scraper` | Posts from #londoncinema, #bfilondon, etc. |
| TikTok | `clockworks/tiktok-scraper` | Videos with London film hashtags |
| YouTube | `streamers/youtube-scraper` | London cinema vlogs/reviews |
| Reddit | `trudax/reddit-scraper` | r/london, r/TrueFilm posts about cinema |

## Filtering for Active Users

- **Recency**: Only posts from last 7-30 days
- **Engagement**: Minimum likes/views thresholds
- **Location**: Keywords like "london", "uk", "peckham", etc.

## Setup

### 1. Environment Variables

Add to `.env.local`:

```bash
# Apify
APIFY_API_TOKEN=apify_api_xxx

# Attio CRM
ATTIO_API_TOKEN=xxx
```

### 2. GitHub Secrets

Add these secrets to your repository (Settings → Secrets → Actions):

- `APIFY_API_TOKEN`
- `ATTIO_API_TOKEN`

## Usage

### Local Development

```bash
# Full pipeline (scrape + sync to Attio)
npm run outreach

# Dry run (scrape only, no Attio sync)
npm run outreach:dry-run

# Specific platform
npm run outreach -- --platform=instagram
npm run outreach -- --platform=tiktok
npm run outreach -- --platform=youtube
npm run outreach -- --platform=reddit
```

### GitHub Actions

- **Automatic**: Runs every Sunday at 10am UTC
- **Manual**: Go to Actions → Social Outreach Pipeline → Run workflow

## Configuration

Edit `config.ts` to customize:

- Search hashtags and keywords
- Instagram profiles to follow
- Engagement thresholds
- Location keywords

## Costs

Using Apify Free Tier (49 runs/month, $5 credits):

| Actor | Cost | Estimated Monthly |
|-------|------|-------------------|
| Instagram Hashtags | $2.30/1k results | ~$1 |
| TikTok | Pay per event | ~$0.50 |
| YouTube | $5/1k videos | ~$0.50 |
| Reddit | Free | $0 |

**Total: ~$2-3/month** on free tier

## Attio Integration

Contacts are upserted to the **People** object using `platform:username` as the unique identifier.

Fields synced:
- Name (unique ID)
- Description (display name + platform)
- Profile URL
- Follower count
- Last active date
- Source (which scraper found them)

## Troubleshooting

### "APIFY_API_TOKEN is required"
Set the token in `.env.local` or GitHub Secrets.

### Rate Limiting
The pipeline includes 250ms delays between Attio API calls. If you hit limits, increase the delay in `attio-client.ts`.

### No Results
Check `config.ts` - you may need to adjust:
- Hashtags (are they actively used?)
- Location keywords (too restrictive?)
- Engagement thresholds (too high?)
