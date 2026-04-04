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
	admin_district: string | null;
	parish: string | null;
	region: string | null;
}

/** Raw JSON response from postcodes.io single-postcode lookup */
interface PostcodeLookupResponse {
	status: number;
	result: PostcodeResult | null;
	error?: string;
}

const POSTCODES_API_BASE = 'https://api.postcodes.io';

/**
 * Lookup a UK postcode and get its coordinates
 * Returns null if postcode is invalid or not found
 */
export async function lookupPostcode(postcode: string): Promise<PostcodeResult | null> {
	const normalized = postcode.replace(/\s+/g, '').toUpperCase();

	if (!normalized || normalized.length < 5) {
		return null;
	}

	try {
		const response = await fetch(
			`${POSTCODES_API_BASE}/postcodes/${encodeURIComponent(normalized)}`
		);

		if (!response.ok) {
			if (response.status === 404) {
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
		console.error('Postcode lookup failed:', error);
		return null;
	}
}

/**
 * Validate a UK postcode format (doesn't check if it exists)
 */
export function isValidPostcodeFormat(postcode: string): boolean {
	const pattern = /^([A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}|GIR ?0A{2})$/i;
	return pattern.test(postcode.trim());
}

/**
 * Format a postcode with proper spacing
 * e.g., "SW1A1AA" -> "SW1A 1AA"
 */
export function formatPostcode(postcode: string): string {
	const normalized = postcode.replace(/\s+/g, '').toUpperCase();

	if (normalized.length >= 5) {
		return `${normalized.slice(0, -3)} ${normalized.slice(-3)}`;
	}

	return normalized;
}

/**
 * Check if coordinates are within London (rough bounding box)
 */
export function isWithinLondon(lat: number, lng: number): boolean {
	const bounds = {
		north: 51.7,
		south: 51.3,
		east: 0.2,
		west: -0.5
	};

	return lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east;
}

/**
 * Get a friendly location name from postcode result
 */
export function getLocationName(result: PostcodeResult): string {
	if (result.admin_district) {
		return result.admin_district;
	}
	return formatPostcode(result.postcode);
}
