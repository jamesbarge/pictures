/**
 * Letterboxd Import — Trigger.dev task wrapper.
 *
 * @deprecated Thin shim around `runLetterboxdImport` in @/lib/jobs/letterboxd-import.
 * This file will be deleted when src/trigger/ is removed in the
 * local-scraping-rebuild migration.
 */

import { task } from "@trigger.dev/sdk/v3";
import {
  runLetterboxdImport,
  type LetterboxdImportPayload,
  type LetterboxdImportOutput,
} from "@/lib/jobs/letterboxd-import";

export const letterboxdImportLookup = task({
  id: "letterboxd-import-lookup",
  retry: { maxAttempts: 2 },
  run: (payload: LetterboxdImportPayload): Promise<LetterboxdImportOutput> =>
    runLetterboxdImport(payload),
});
