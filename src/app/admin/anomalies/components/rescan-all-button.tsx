"use client";

/**
 * Re-scan All Button Component
 * Triggers all scrapers via /api/admin/scrape/all (in-process orchestrator).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";

type ScanStatus = "idle" | "loading" | "success" | "error";

export function RescanAllButton() {
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [count, setCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (status === "loading") return;

    // Confirm before triggering
    const confirmed = window.confirm(
      "This will queue scrape jobs for all cinemas. Playwright-based scrapers may fail on Vercel. Continue?"
    );
    if (!confirmed) return;

    setStatus("loading");
    setError(null);

    try {
      const response = await fetch("/api/admin/scrape/all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to trigger scrapers");
      }

      setCount(data.count);
      setStatus("success");

      // Reset to idle after 5 seconds
      setTimeout(() => setStatus("idle"), 5000);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown error");

      // Reset to idle after 5 seconds
      setTimeout(() => {
        setStatus("idle");
        setError(null);
      }, 5000);
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleClick}
      disabled={status === "loading"}
      className={cn(
        status === "success" && "text-green-600",
        status === "error" && "text-red-600"
      )}
      title={error || undefined}
    >
      {status === "loading" && (
        <>
          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          Queueing...
        </>
      )}
      {status === "success" && (
        <>
          <Check className="w-4 h-4 mr-2" />
          Queued {count} scrapers
        </>
      )}
      {status === "error" && (
        <>
          <AlertCircle className="w-4 h-4 mr-2" />
          Failed
        </>
      )}
      {status === "idle" && (
        <>
          <RefreshCw className="w-4 h-4 mr-2" />
          Re-scan All
        </>
      )}
    </Button>
  );
}
