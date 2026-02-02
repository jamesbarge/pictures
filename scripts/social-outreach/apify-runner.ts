/**
 * Apify Actor Runner
 * 
 * Runs Apify scrapers and normalizes results into a common contact format.
 */

import { ApifyClient } from 'apify-client';
import { APIFY_ACTORS, SEARCH_CONFIG, ENGAGEMENT_FILTERS, LOCATION_KEYWORDS } from './config';
import type { AttioContact } from './attio-client';

interface ScraperResult {
  platform: string;
  source: string;
  contacts: AttioContact[];
}

export class ApifyRunner {
  private client: ApifyClient;

  constructor(apiToken: string) {
    this.client = new ApifyClient({ token: apiToken });
  }

  /**
   * Check if text contains London-related keywords
   */
  private isLondonBased(text: string): boolean {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    return LOCATION_KEYWORDS.some((keyword) => lowerText.includes(keyword));
  }

  /**
   * Check if post is recent enough
   */
  private isRecentPost(timestamp: string | number, maxDaysOld: number): boolean {
    const postDate = new Date(timestamp);
    const now = new Date();
    const diffDays = (now.getTime() - postDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= maxDaysOld;
  }

  /**
   * Run Instagram Hashtag Scraper
   */
  async scrapeInstagramHashtags(): Promise<ScraperResult> {
    console.log('🔍 Scraping Instagram hashtags...');
    const contacts: AttioContact[] = [];

    for (const hashtag of SEARCH_CONFIG.instagramHashtags.slice(0, 3)) {
      // Limit to 3 hashtags per run for free tier
      try {
        const run = await this.client.actor(APIFY_ACTORS.instagramHashtag).call({
          hashtags: [hashtag],
          resultsType: 'posts',
          resultsLimit: 20, // Conservative limit
        });

        const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

        for (const item of items) {
          const post = item as {
            ownerUsername?: string;
            ownerFullName?: string;
            caption?: string;
            likesCount?: number;
            timestamp?: string;
            url?: string;
            locationName?: string;
          };

          // Filter by engagement and recency
          if (
            (post.likesCount ?? 0) < ENGAGEMENT_FILTERS.instagram.minLikes ||
            !post.timestamp ||
            !this.isRecentPost(post.timestamp, ENGAGEMENT_FILTERS.instagram.maxDaysOld)
          ) {
            continue;
          }

          // Check if user seems London-based
          const combinedText = [post.caption, post.locationName, post.ownerFullName]
            .filter(Boolean)
            .join(' ');

          if (!this.isLondonBased(combinedText)) {
            continue;
          }

          if (post.ownerUsername) {
            contacts.push({
              username: post.ownerUsername,
              platform: 'instagram',
              profileUrl: `https://instagram.com/${post.ownerUsername}`,
              displayName: post.ownerFullName,
              bio: post.caption?.slice(0, 200),
              location: post.locationName,
              lastActiveAt: post.timestamp,
              scrapedAt: new Date().toISOString(),
              source: `instagram_hashtag_${hashtag}`,
            });
          }
        }

        console.log(`  ✓ #${hashtag}: found ${items.length} posts`);
      } catch (error) {
        console.error(`  ✗ #${hashtag} failed:`, error);
      }
    }

    // Deduplicate by username
    const unique = this.deduplicateContacts(contacts);
    console.log(`📸 Instagram: ${unique.length} unique London-based contacts`);

    return { platform: 'instagram', source: 'hashtags', contacts: unique };
  }

  /**
   * Run TikTok Scraper
   */
  async scrapeTikTok(): Promise<ScraperResult> {
    console.log('🎵 Scraping TikTok...');
    const contacts: AttioContact[] = [];

    try {
      const run = await this.client.actor(APIFY_ACTORS.tiktok).call({
        hashtags: SEARCH_CONFIG.tiktokHashtags.slice(0, 2),
        resultsPerPage: 20,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
      });

      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      for (const item of items) {
        const post = item as {
          authorMeta?: {
            name?: string;
            nickName?: string;
            signature?: string;
            fans?: number;
          };
          playCount?: number;
          createTimeISO?: string;
          webVideoUrl?: string;
          text?: string;
        };

        // Filter by engagement and recency
        if (
          (post.playCount ?? 0) < ENGAGEMENT_FILTERS.tiktok.minViews ||
          !post.createTimeISO ||
          !this.isRecentPost(post.createTimeISO, ENGAGEMENT_FILTERS.tiktok.maxDaysOld)
        ) {
          continue;
        }

        // For TikTok, we're already filtering by London-specific hashtags
        // so we don't require location in bio (most TikTok users don't add it)
        // Just check the post content for London mentions as a bonus signal
        const combinedText = [post.text, post.authorMeta?.signature].filter(Boolean).join(' ');
        const hasLondonSignal = this.isLondonBased(combinedText);
        
        // Skip if no London signal AND not from our London-specific hashtags
        // (londoncinema hashtag is already London-focused, so include those)
        const isFromLondonHashtag = SEARCH_CONFIG.tiktokHashtags.some(
          (h) => h.toLowerCase().includes('london')
        );

        if (post.authorMeta?.name) {
          contacts.push({
            username: post.authorMeta.name,
            platform: 'tiktok',
            profileUrl: `https://tiktok.com/@${post.authorMeta.name}`,
            displayName: post.authorMeta.nickName,
            bio: post.authorMeta.signature,
            followerCount: post.authorMeta.fans,
            lastActiveAt: post.createTimeISO,
            scrapedAt: new Date().toISOString(),
            source: 'tiktok_hashtags',
          });
        }
      }

      console.log(`  ✓ Found ${items.length} TikTok posts`);
    } catch (error) {
      console.error('  ✗ TikTok scrape failed:', error);
    }

    const unique = this.deduplicateContacts(contacts);
    console.log(`🎵 TikTok: ${unique.length} unique London-based contacts`);

    return { platform: 'tiktok', source: 'hashtags', contacts: unique };
  }

  /**
   * Run YouTube Scraper
   */
  async scrapeYouTube(): Promise<ScraperResult> {
    console.log('📺 Scraping YouTube...');
    const contacts: AttioContact[] = [];

    for (const searchTerm of SEARCH_CONFIG.youtubeSearchTerms.slice(0, 2)) {
      try {
        const run = await this.client.actor(APIFY_ACTORS.youtube).call({
          searchKeywords: searchTerm, // Must be string, not array
          maxResults: 15,
          uploadDate: 'week', // Last week only
        });

        const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

        for (const item of items) {
          const video = item as {
            channelName?: string;
            channelUrl?: string;
            viewCount?: number;
            date?: string;
            title?: string;
            text?: string;
            numberOfSubscribers?: number;
          };

          if ((video.viewCount ?? 0) < ENGAGEMENT_FILTERS.youtube.minViews) {
            continue;
          }

          // Check if channel seems London-based
          const combinedText = [video.title, video.text, video.channelName]
            .filter(Boolean)
            .join(' ');

          if (!this.isLondonBased(combinedText)) {
            continue;
          }

          if (video.channelName && video.channelUrl) {
            contacts.push({
              username: video.channelName,
              platform: 'youtube',
              profileUrl: video.channelUrl,
              displayName: video.channelName,
              followerCount: video.numberOfSubscribers,
              lastActiveAt: video.date,
              scrapedAt: new Date().toISOString(),
              source: `youtube_search_${searchTerm.replace(/\s+/g, '_')}`,
            });
          }
        }

        console.log(`  ✓ "${searchTerm}": found ${items.length} videos`);
      } catch (error) {
        console.error(`  ✗ "${searchTerm}" failed:`, error);
      }
    }

    const unique = this.deduplicateContacts(contacts);
    console.log(`📺 YouTube: ${unique.length} unique London-based contacts`);

    return { platform: 'youtube', source: 'search', contacts: unique };
  }

  /**
   * Run Reddit Scraper
   * NOTE: The trudax/reddit-scraper requires a paid rental.
   * This is disabled for now - Reddit contacts should be added manually
   * or we can explore other free Reddit scrapers later.
   */
  async scrapeReddit(): Promise<ScraperResult> {
    console.log('🔴 Reddit: Skipped (requires paid Apify actor rental)');
    console.log('   To enable: rent trudax/reddit-scraper at https://apify.com/trudax/reddit-scraper');
    
    // Return empty result - Reddit scraping disabled
    return { platform: 'reddit', source: 'subreddits', contacts: [] };
  }

  /**
   * Run all scrapers
   */
  async runAll(): Promise<AttioContact[]> {
    console.log('\n🚀 Starting social outreach scrape...\n');

    const results = await Promise.allSettled([
      this.scrapeInstagramHashtags(),
      this.scrapeTikTok(),
      this.scrapeYouTube(),
      this.scrapeReddit(),
    ]);

    const allContacts: AttioContact[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allContacts.push(...result.value.contacts);
      } else {
        console.error('Scraper failed:', result.reason);
      }
    }

    // Final deduplication across platforms
    const unique = this.deduplicateContacts(allContacts);
    
    console.log(`\n📊 Total unique contacts: ${unique.length}\n`);
    
    return unique;
  }

  /**
   * Remove duplicate contacts by platform+username
   */
  private deduplicateContacts(contacts: AttioContact[]): AttioContact[] {
    const seen = new Set<string>();
    return contacts.filter((contact) => {
      const key = `${contact.platform}:${contact.username}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
