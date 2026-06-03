/**
 * Reactive load-once store wrapping the pure search core
 * (`catalog-index-core.ts`). Fetches the catalog snapshot from
 * `/api/search/catalog` ONCE, builds the in-browser fuzzy indexes, and serves
 * synchronous results — zero per-keystroke network calls once warm.
 */

import { browser } from "$app/environment";
import { apiGet } from "$lib/api/client";
import {
  buildCatalogIndexes,
  searchCatalog,
  EMPTY_CATALOG_RESULTS,
  type CatalogIndexes,
  type CatalogResponse,
  type CatalogSearchResults,
} from "./catalog-index-core";

let status = $state<"idle" | "loading" | "ready" | "error">("idle");
let indexes: CatalogIndexes | null = null;
let loadPromise: Promise<void> | null = null;

/** Idempotent: fetch the catalog once and build the indexes. */
async function ensureLoaded(): Promise<void> {
  if (!browser || status === "ready") return;
  if (loadPromise) return loadPromise;
  status = "loading";
  loadPromise = (async () => {
    try {
      const data = await apiGet<CatalogResponse>("/api/search/catalog");
      indexes = buildCatalogIndexes(data);
      status = "ready";
    } catch (err) {
      console.error(
        "[catalog-index] load failed:",
        err instanceof Error ? err.message : err,
      );
      status = "error";
      loadPromise = null; // permit a retry on the next palette open
    }
  })();
  return loadPromise;
}

function search(query: string): CatalogSearchResults {
  if (status !== "ready" || !indexes) return EMPTY_CATALOG_RESULTS;
  return searchCatalog(indexes, query);
}

export const catalogIndex = {
  get status() {
    return status;
  },
  ensureLoaded,
  search,
};
