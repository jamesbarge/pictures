/**
 * Screening Validator
 *
 * Validates scraped screenings before database insertion to catch:
 * - Invalid times (before 10:00 AM - cinemas don't show films that early)
 * - Dates too far in future (>90 days - likely parsing errors)
 * - Malformed booking URLs
 * - Suspicious patterns (Christmas Day, etc.)
 */

import type { RawScreening } from "../types";

/**
 * Strip HTML tags from text to prevent stored XSS
 */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

/**
 * Sanitize a screening's text fields by stripping HTML tags
 */
export function sanitizeScreening(screening: RawScreening): RawScreening {
  return {
    ...screening,
    filmTitle: stripHtml(screening.filmTitle),
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];    // Fatal - screening should be rejected
  warnings: string[];  // Non-fatal - log but allow
}

export interface ValidationSummary {
  total: number;
  valid: number;
  rejected: number;
  warnings: number;
  errorsByType: Record<string, number>;
  warningsByType: Record<string, number>;
}

// Cinema operating hours - screenings outside these are suspicious
const MIN_SCREENING_HOUR = 10;  // 10:00 AM
const MAX_SCREENING_HOUR = 23;  // 11:00 PM (last screening start)

// Maximum days in future for valid screenings
const MAX_DAYS_IN_FUTURE = 90;

// Holidays when most cinemas are closed
const CLOSED_DATES = [
  { month: 12, day: 25, name: "Christmas Day" },
];

// Days that warrant a warning (some cinemas open, some closed)
const WARNING_DATES = [
  { month: 12, day: 24, name: "Christmas Eve" },
  { month: 12, day: 26, name: "Boxing Day" },
  { month: 1, day: 1, name: "New Year's Day" },
];

/**
 * Validate a single screening
 */
export function validateScreening(screening: RawScreening): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { filmTitle, datetime, bookingUrl } = screening;

  // 1. Title validation
  if (!filmTitle || filmTitle.trim().length < 2) {
    errors.push("title_too_short: Film title is too short or empty");
  } else if (filmTitle.length > 200) {
    errors.push("title_too_long: Film title exceeds 200 characters");
  }

  // 2. Datetime validation
  if (!datetime || isNaN(datetime.getTime())) {
    errors.push("invalid_datetime: Datetime is invalid or missing");
  } else {
    const now = new Date();
    const hour = datetime.getHours();
    const daysDiff = Math.floor((datetime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Check if in the past
    if (datetime < now) {
      errors.push("past_screening: Screening is in the past");
    }

    // Check time of day
    if (hour < MIN_SCREENING_HOUR) {
      errors.push(`suspicious_time_early: Screening at ${hour}:00 is before ${MIN_SCREENING_HOUR}:00 AM`);
    } else if (hour > MAX_SCREENING_HOUR) {
      warnings.push(`late_screening: Screening starts at ${hour}:00 (after ${MAX_SCREENING_HOUR}:00)`);
    }

    // Check date range
    if (daysDiff > MAX_DAYS_IN_FUTURE) {
      errors.push(`too_far_future: Screening is ${daysDiff} days in future (max ${MAX_DAYS_IN_FUTURE})`);
    }

    // Check closed dates
    const month = datetime.getMonth() + 1;
    const day = datetime.getDate();

    for (const closed of CLOSED_DATES) {
      if (month === closed.month && day === closed.day) {
        warnings.push(`holiday_screening: Screening on ${closed.name} - verify cinema is open`);
      }
    }

    for (const warn of WARNING_DATES) {
      if (month === warn.month && day === warn.day) {
        warnings.push(`possible_holiday: Screening on ${warn.name} - some cinemas may be closed`);
      }
    }
  }

  // 3. Booking URL validation
  if (!bookingUrl || bookingUrl.trim() === "") {
    warnings.push("missing_booking_url: No booking URL provided");
  } else if (bookingUrl.length > 2000) {
    errors.push("booking_url_too_long: Booking URL exceeds 2000 characters");
  } else if (!bookingUrl.startsWith("http://") && !bookingUrl.startsWith("https://")) {
    errors.push("invalid_booking_url_protocol: Booking URL must use http or https protocol");
  } else if (bookingUrl.includes("undefined") || bookingUrl.includes("null")) {
    errors.push("malformed_booking_url: Booking URL contains 'undefined' or 'null'");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate an array of screenings and return summary
 */
export function validateScreenings(screenings: RawScreening[]): {
  validScreenings: RawScreening[];
  rejectedScreenings: Array<{ screening: RawScreening; errors: string[] }>;
  summary: ValidationSummary;
} {
  const validScreenings: RawScreening[] = [];
  const rejectedScreenings: Array<{ screening: RawScreening; errors: string[] }> = [];
  const errorsByType: Record<string, number> = {};
  const warningsByType: Record<string, number> = {};
  let warningCount = 0;

  for (const screening of screenings) {
    const result = validateScreening(screening);

    // Count errors by type
    for (const error of result.errors) {
      const type = error.split(":")[0];
      errorsByType[type] = (errorsByType[type] || 0) + 1;
    }

    // Count warnings by type
    for (const warning of result.warnings) {
      const type = warning.split(":")[0];
      warningsByType[type] = (warningsByType[type] || 0) + 1;
      warningCount++;
    }

    if (result.valid) {
      validScreenings.push(sanitizeScreening(screening));

      // Log warnings for valid screenings
      if (result.warnings.length > 0) {
        console.warn(`[Validator] ${screening.filmTitle}: ${result.warnings.join(", ")}`);
      }
    } else {
      rejectedScreenings.push({ screening, errors: result.errors });
      console.error(`[Validator] REJECTED ${screening.filmTitle}: ${result.errors.join(", ")}`);
    }
  }

  const summary: ValidationSummary = {
    total: screenings.length,
    valid: validScreenings.length,
    rejected: rejectedScreenings.length,
    warnings: warningCount,
    errorsByType,
    warningsByType,
  };

  return { validScreenings, rejectedScreenings, summary };
}

/**
 * Print validation summary to console
 */
export function printValidationSummary(summary: ValidationSummary): void {
  console.log("\n=== Validation Summary ===");
  console.log(`Total: ${summary.total} | Valid: ${summary.valid} | Rejected: ${summary.rejected} | Warnings: ${summary.warnings}`);

  if (Object.keys(summary.errorsByType).length > 0) {
    console.log("\nRejection reasons:");
    for (const [type, count] of Object.entries(summary.errorsByType)) {
      console.log(`  ${type}: ${count}`);
    }
  }

  if (Object.keys(summary.warningsByType).length > 0) {
    console.log("\nWarnings:");
    for (const [type, count] of Object.entries(summary.warningsByType)) {
      console.log(`  ${type}: ${count}`);
    }
  }
  console.log("");
}
