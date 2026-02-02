/**
 * Social Outreach Pipeline Configuration
 * 
 * Defines scrapers, search terms, and filters for finding
 * London-based film enthusiasts across social platforms.
 */

export const SEARCH_CONFIG = {
  // Instagram hashtags to monitor
  instagramHashtags: [
    'londoncinema',
    'londonfilm',
    'bfilondon',
    'independentcinema',
    'filmtwitter',
    'cinemalondon',
    'artcinema',
    'repertorycinema',
    'cinematheque',
    'classicfilm',
  ],

  // Instagram profiles to scrape followers from (cinema accounts)
  instagramProfiles: [
    'baborc',
    'princecharlescinema',
    'barbaborc',
    'riocinema',
    'genesiscinema',
    'thelotsw10',
    'electriccinema',
    'paborc',
  ],

  // TikTok search terms
  tiktokSearchTerms: [
    'london cinema',
    'london film',
    'bfi london',
    'independent cinema london',
    'arthouse film',
  ],

  // TikTok hashtags
  tiktokHashtags: [
    'londoncinema',
    'filmtok',
    'cinematok',
    'moviereview',
    'bfilondon',
  ],

  // YouTube search terms
  youtubeSearchTerms: [
    'london cinema vlog',
    'bfi london',
    'independent cinema london',
    'london film review',
    'arthouse cinema london',
  ],

  // Reddit subreddits to monitor
  redditSubreddits: [
    'r/london',
    'r/TrueFilm',
    'r/movies',
    'r/criterion',
    'r/boutiquebluray',
  ],

  // Reddit search keywords (within subreddits)
  redditKeywords: [
    'cinema london',
    'bfi',
    'curzon',
    'picturehouse',
    'independent cinema',
    'arthouse',
  ],
};

// Apify Actor IDs
export const APIFY_ACTORS = {
  instagramHashtag: 'apify/instagram-hashtag-scraper',
  instagramProfile: 'apify/instagram-profile-scraper',
  tiktok: 'clockworks/tiktok-scraper',
  youtube: 'streamers/youtube-scraper',
  reddit: 'trudax/reddit-scraper',
};

// Filters to identify active, engaged users
export const ENGAGEMENT_FILTERS = {
  instagram: {
    minLikes: 10,
    maxDaysOld: 14, // Only posts from last 2 weeks
  },
  tiktok: {
    minViews: 100,
    maxDaysOld: 30, // TikTok content stays relevant longer
  },
  youtube: {
    minViews: 50,
    maxDaysOld: 30, // YouTube content lives longer
  },
  reddit: {
    minUpvotes: 5,
    maxDaysOld: 14,
  },
};

// Location keywords to filter for London-based users
export const LOCATION_KEYWORDS = [
  'london',
  'uk',
  'england',
  'british',
  'soho',
  'hackney',
  'peckham',
  'brixton',
  'shoreditch',
  'islington',
  'camden',
  'dalston',
];
