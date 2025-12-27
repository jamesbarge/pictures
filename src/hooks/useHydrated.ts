/**
 * useHydrated Hook
 *
 * Returns true after client-side hydration is complete.
 * Use this to safely access browser-only APIs like localStorage,
 * which prevents hydration mismatches when using SSR.
 *
 * Example:
 *   const hydrated = useHydrated();
 *   const storeValue = hydrated ? store.getValue() : defaultValue;
 */

import { useState, useEffect } from "react";

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Standard hydration pattern
    setHydrated(true);
  }, []);

  return hydrated;
}
