/**
 * Mobile Modal Wrapper Component
 * Full-screen modal pattern for mobile devices with slide-up animation
 *
 * Features:
 * - Slide-in-from-bottom animation
 * - Header with title and close button
 * - Scrollable content area
 * - Sticky footer with safe-area-bottom padding
 * - Body scroll lock to prevent background scrolling
 *
 * Used by: MobileDatePickerModal, MobileCinemaPickerModal
 */

"use client";

import { type ReactNode } from "react";
import { X } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

interface MobileModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Optional footer content (buttons, actions) */
  footer?: ReactNode;
  /** Optional content to show below header (e.g., search input) */
  stickyContent?: ReactNode;
}

export function MobileModal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  stickyContent,
}: MobileModalProps) {
  // Lock body scroll when modal is open
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background-secondary animate-in slide-in-from-bottom duration-300">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-background-primary">
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        <button
          onClick={onClose}
          className="p-2 -mr-2 rounded-lg hover:bg-background-tertiary transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-text-secondary" />
        </button>
      </header>

      {/* Optional sticky content below header (e.g., search) */}
      {stickyContent && (
        <div className="border-b border-border-subtle bg-background-primary">{stickyContent}</div>
      )}

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">{children}</div>

      {/* Sticky Footer */}
      {footer && (
        <div className="px-4 py-3 border-t border-border-subtle bg-background-primary safe-area-bottom">
          {footer}
        </div>
      )}
    </div>
  );
}
