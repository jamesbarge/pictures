/**
 * UK Postcode Utilities
 *
 * Uses postcodes.io - a free, open-source UK postcode API
 * No API key required, generous rate limits
 *
 * @see https://postcodes.io/
 */

/** Parsed postcode data returned by postcodes.io */
export interface PostcodeResult {
  postcode: string;
  latitude: number;
  longitude: number;
  // Additional useful fields
  admin_district: string | null;  // e.g., "Tower Hamlets"
  parish: string | null;
  region: string | null;  // e.g., "London"
}

/** Raw JSON response from postcodes.io single-postcode lookup */
export interface PostcodeLookupResponse {
  status: number;
  result: PostcodeResult | null;
  error?: string;
}

/** Raw JSON response from postcodes.io validation endpoint */
export interface PostcodeValidationResponse {
  status: number;
  result: boolean;
}

const POSTCODES_API_BASE = "https://api.postcodes.io";

/**
 * Lookup a UK postcode and get its coordinates
 * Returns null if postcode is invalid or not found
 */
export async function lookupPostcode(
  postcode: string
): Promise<PostcodeResult | null> {
  // Normalize: remove spaces, uppercase
  const normalized = postcode.replace(/\s+/g, "").toUpperCase();

  if (!normalized || normalized.length < 5) {
    return null;
  }

  try {
    const response = await fetch(
      `${POSTCODES_API_BASE}/postcodes/${encodeURIComponent(normalized)}`
    );

    if (!response.ok) {
      if (response.status === 404) {
        // Postcode not found
        return null;
      }
      throw new Error(`Postcode API error: ${response.status}`);
    }

    const data: PostcodeLookupResponse = await response.json();

    if (data.status !== 200 || !data.result) {
      return null;
    }

    return data.result;
  } catch (error) {
    console.error("Postcode lookup failed:", error);
    return null;
  }
}

/**
 * Validate a UK postcode format (doesn't check if it exists)
 */
export function isValidPostcodeFormat(postcode: string): boolean {
  // UK postcode regex pattern
  // Matches formats like: SW1A 1AA, EC1A 1BB, W1A 0AX, M1 1AE, B33 8TH
  const pattern =
    /^([A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}|GIR ?0A{2})$/i;
  return pattern.test(postcode.trim());
}

/**
 * Format a postcode with proper spacing
 * e.g., "SW1A1AA" → "SW1A 1AA"
 */
export function formatPostcode(postcode: string): string {
  const normalized = postcode.replace(/\s+/g, "").toUpperCase();

  // Insert space before the last 3 characters (inward code)
  if (normalized.length >= 5) {
    return `${normalized.slice(0, -3)} ${normalized.slice(-3)}`;
  }

  return normalized;
}

/**
 * Autocomplete postcodes (for type-ahead suggestions)
 * Returns up to 10 matching postcodes
 */
export async function autocompletePostcode(
  partial: string
): Promise<string[]> {
  const normalized = partial.replace(/\s+/g, "").toUpperCase();

  if (normalized.length < 2) {
    return [];
  }

  try {
    const response = await fetch(
      `${POSTCODES_API_BASE}/postcodes/${encodeURIComponent(normalized)}/autocomplete`
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    if (data.status !== 200 || !data.result) {
      return [];
    }

    // Format each postcode properly
    return (data.result as string[]).map(formatPostcode);
  } catch {
    return [];
  }
}

/**
 * Check if coordinates are within London (rough bounding box)
 * Useful for warning users if they enter a postcode far from London cinemas
 */
export function isWithinLondon(lat: number, lng: number): boolean {
  // Rough London bounding box
  const bounds = {
    north: 51.7,
    south: 51.3,
    east: 0.2,
    west: -0.5,
  };

  return (
    lat >= bounds.south &&
    lat <= bounds.north &&
    lng >= bounds.west &&
    lng <= bounds.east
  );
}

/**
 * Get a friendly location name from postcode result
 */
export function getLocationName(result: PostcodeResult): string {
  // Prefer admin_district (e.g., "Tower Hamlets", "Camden")
  if (result.admin_district) {
    return result.admin_district;
  }

  // Fall back to formatted postcode
  return formatPostcode(result.postcode);
}
