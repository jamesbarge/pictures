/**
 * Attio CRM Client
 * 
 * Handles upserting contacts (People) to Attio using the Assert Record API.
 * Uses username as the matching attribute to prevent duplicates.
 */

interface AttioContact {
  username: string;
  platform: string;
  profileUrl: string;
  displayName?: string;
  bio?: string;
  followerCount?: number;
  engagementScore?: number;
  location?: string;
  lastActiveAt?: string;
  scrapedAt: string;
  source: string; // e.g., "instagram_hashtag", "tiktok_search"
}

interface AttioRecordValues {
  [key: string]: unknown;
}

const ATTIO_API_BASE = 'https://api.attio.com/v2';

export class AttioClient {
  private apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  private async request(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<unknown> {
    const response = await fetch(`${ATTIO_API_BASE}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Attio API error (${response.status}): ${error}`);
    }

    return response.json();
  }

  /**
   * Create a contact in Attio People object.
   * Uses POST to create new records (no matching/dedup at Attio level).
   * Deduplication is handled in our code before calling this.
   */
  async upsertContact(contact: AttioContact): Promise<{ created: boolean; recordId: string }> {
    // Build the unique identifier: platform_username
    const uniqueId = `${contact.platform}:${contact.username}`;
    
    // Build a descriptive name for the contact
    const displayName = contact.displayName || contact.username;
    const fullName = `${displayName} (${contact.platform})`;
    
    // Build attribute values for Attio
    const values: AttioRecordValues = {
      name: fullName,
    };

    // Add description with all the details
    const description = [
      `Platform: ${contact.platform}`,
      `Username: @${contact.username}`,
      `Profile: ${contact.profileUrl}`,
      contact.bio ? `Bio: ${contact.bio.slice(0, 500)}` : null,
      contact.followerCount ? `Followers: ${contact.followerCount.toLocaleString()}` : null,
      contact.location ? `Location: ${contact.location}` : null,
      `Source: ${contact.source}`,
      `Last Active: ${contact.lastActiveAt || 'Unknown'}`,
      `Scraped: ${contact.scrapedAt}`,
    ]
      .filter(Boolean)
      .join('\n');

    values.description = description;

    try {
      // Use POST to create new record
      const result = await this.request(
        'POST',
        '/objects/people/records',
        {
          data: {
            values,
          },
        }
      );

      const record = result as { data: { id: { record_id: string } } };
      
      console.log(`✓ Created contact: ${uniqueId}`);
      
      return {
        created: true,
        recordId: record.data.id.record_id,
      };
    } catch (error) {
      console.error(`✗ Failed to create ${uniqueId}:`, error);
      throw error;
    }
  }

  /**
   * Batch upsert multiple contacts with rate limiting
   */
  async batchUpsertContacts(
    contacts: AttioContact[],
    options: { delayMs?: number; onProgress?: (current: number, total: number) => void } = {}
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const { delayMs = 200, onProgress } = options;
    
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      
      try {
        await this.upsertContact(contact);
        success++;
      } catch (error) {
        failed++;
        errors.push(`${contact.platform}:${contact.username} - ${error}`);
      }

      if (onProgress) {
        onProgress(i + 1, contacts.length);
      }

      // Rate limiting delay
      if (i < contacts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return { success, failed, errors };
  }
}

export type { AttioContact };
