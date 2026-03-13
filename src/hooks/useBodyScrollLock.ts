/**
 * useBodyScrollLock
 * Locks body scroll when a modal is open to prevent background scrolling
 */

import { useEffect } from "react";

/** Locks body scroll when a modal or drawer is open, restoring position on close. */
export function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;

    // Store current scroll position
    const scrollY = window.scrollY;

    // Lock body
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.overflow = "hidden";

    return () => {
      // Unlock body
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.overflow = "";

      // Restore scroll position
      window.scrollTo(0, scrollY);
    };
  }, [isLocked]);
}
