"use client";

/**
 * Data Quality Actions Component
 * Trigger fallback enrichment from the dashboard
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, CheckCircle, XCircle } from "lucide-react";

type Status = "idle" | "running" | "success" | "error";

interface Result {
  success: boolean;
  summary: string;
  details?: string[];
  error?: string;
}

export function DataQualityActions() {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<Result | null>(null);

  async function handleEnrich() {
    if (status === "running") return;

    setStatus("running");
    setResult(null);

    try {
      const response = await fetch("/api/admin/data-quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Enrichment failed");
      }

      setResult(data);
      setStatus(data.success ? "success" : "error");
    } catch (err) {
      setResult({
        success: false,
        summary: "Failed to run enrichment",
        error: err instanceof Error ? err.message : "Unknown error",
      });
      setStatus("error");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        variant={status === "running" ? "secondary" : "primary"}
        size="sm"
        onClick={handleEnrich}
        disabled={status === "running"}
      >
        {status === "running" ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Enriching...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 mr-2" />
            Run Fallback Enrichment
          </>
        )}
      </Button>

      {result && (
        <div className="flex items-center gap-2 text-sm">
          {result.success ? (
            <CheckCircle className="w-4 h-4 text-green-600" />
          ) : (
            <XCircle className="w-4 h-4 text-red-600" />
          )}
          <span className="text-text-secondary">{result.summary}</span>
        </div>
      )}
    </div>
  );
}
