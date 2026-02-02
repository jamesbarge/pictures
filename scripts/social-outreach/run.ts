#!/usr/bin/env npx tsx
/**
 * Social Outreach Pipeline - Main Runner
 * 
 * Scrapes Instagram, TikTok, YouTube, and Reddit for London-based
 * film enthusiasts and syncs them to Attio CRM.
 * 
 * Usage:
 *   npm run outreach              # Run full pipeline
 *   npm run outreach -- --dry-run # Scrape only, don't push to Attio
 *   npm run outreach -- --platform instagram  # Scrape specific platform
 */

import { ApifyRunner } from './apify-runner';
import { AttioClient } from './attio-client';

// Environment variables (set in .env.local or GitHub Secrets)
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const ATTIO_API_TOKEN = process.env.ATTIO_API_TOKEN;

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const platformArg = args.find((a) => a.startsWith('--platform='));
  const platform = platformArg?.split('=')[1];

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     Pictures London - Social Outreach Pipeline         ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no Attio sync)' : 'FULL SYNC'}`);
  console.log(`Platform: ${platform || 'ALL'}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log();

  // Validate API tokens
  if (!APIFY_API_TOKEN) {
    console.error('❌ APIFY_API_TOKEN is required');
    console.error('   Set it in .env.local or as a GitHub secret');
    process.exit(1);
  }

  if (!isDryRun && !ATTIO_API_TOKEN) {
    console.error('❌ ATTIO_API_TOKEN is required for sync mode');
    console.error('   Set it in .env.local or as a GitHub secret');
    console.error('   Or use --dry-run to skip Attio sync');
    process.exit(1);
  }

  // Initialize clients
  const apifyRunner = new ApifyRunner(APIFY_API_TOKEN);

  try {
    // Run scrapers based on platform selection
    let contacts;
    
    if (platform) {
      console.log(`Running ${platform} scraper only...`);
      switch (platform) {
        case 'instagram':
          const igResult = await apifyRunner.scrapeInstagramHashtags();
          contacts = igResult.contacts;
          break;
        case 'tiktok':
          const ttResult = await apifyRunner.scrapeTikTok();
          contacts = ttResult.contacts;
          break;
        case 'youtube':
          const ytResult = await apifyRunner.scrapeYouTube();
          contacts = ytResult.contacts;
          break;
        case 'reddit':
          const rdResult = await apifyRunner.scrapeReddit();
          contacts = rdResult.contacts;
          break;
        default:
          console.error(`Unknown platform: ${platform}`);
          process.exit(1);
      }
    } else {
      // Run all scrapers
      contacts = await apifyRunner.runAll();
    }

    console.log(`\n📋 Found ${contacts.length} contacts to process\n`);

    // Print sample contacts
    if (contacts.length > 0) {
      console.log('Sample contacts:');
      for (const contact of contacts.slice(0, 5)) {
        console.log(`  - ${contact.platform}: @${contact.username} (${contact.source})`);
      }
      if (contacts.length > 5) {
        console.log(`  ... and ${contacts.length - 5} more`);
      }
      console.log();
    }

    // Sync to Attio
    if (!isDryRun && contacts.length > 0) {
      console.log('📤 Syncing to Attio CRM...\n');
      
      const attioClient = new AttioClient(ATTIO_API_TOKEN!);
      
      const result = await attioClient.batchUpsertContacts(contacts, {
        delayMs: 250, // Rate limiting
        onProgress: (current, total) => {
          if (current % 10 === 0 || current === total) {
            console.log(`   Progress: ${current}/${total}`);
          }
        },
      });

      console.log('\n✅ Attio sync complete:');
      console.log(`   Success: ${result.success}`);
      console.log(`   Failed: ${result.failed}`);
      
      if (result.errors.length > 0) {
        console.log('\n   Errors:');
        for (const error of result.errors.slice(0, 5)) {
          console.log(`   - ${error}`);
        }
      }
    } else if (isDryRun) {
      console.log('🔍 Dry run complete - no data sent to Attio');
    }

    console.log('\n🎬 Pipeline finished successfully!\n');
  } catch (error) {
    console.error('\n❌ Pipeline failed:', error);
    process.exit(1);
  }
}

main();
