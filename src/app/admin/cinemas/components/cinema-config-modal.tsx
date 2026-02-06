"use client";

/**
 * Cinema Config Modal
 * Configure tier and anomaly detection thresholds for a cinema
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { X, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";

interface CinemaConfig {
  tier: "top" | "standard";
  tolerancePercent: number;
  weekdayAvg: number | null;
  weekendAvg: number | null;
  manualOverride: boolean;
  notes: string | null;
}

interface CinemaConfigModalProps {
  cinemaId: string;
  cinemaName: string;
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

type SaveStatus = "idle" | "saving" | "success" | "error";

export function CinemaConfigModal({
  cinemaId,
  cinemaName,
  isOpen,
  onClose,
  onSave,
}: CinemaConfigModalProps) {
  const [config, setConfig] = useState<CinemaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Fetch current config
  useEffect(() => {
    if (!isOpen) return;

    async function fetchConfig() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/admin/cinemas/${cinemaId}/config`);
        if (!response.ok) {
          throw new Error("Failed to load config");
        }
        const data = await response.json();
        setConfig(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchConfig();
  }, [cinemaId, isOpen]);

  async function handleSave() {
    if (!config) return;

    setSaveStatus("saving");
    setError(null);

    try {
      const response = await fetch(`/api/admin/cinemas/${cinemaId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save config");
      }

      setSaveStatus("success");
      onSave?.();

      // Close after brief success display
      setTimeout(() => {
        onClose();
        setSaveStatus("idle");
      }, 1000);
    } catch (err) {
      setSaveStatus("error");
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close cinema configuration modal"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <Card className="relative z-10 w-full max-w-md mx-4 bg-background-primary">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <div>
            <h2 className="font-medium text-text-primary">Configure Cinema</h2>
            <p className="text-sm text-text-secondary">{cinemaName}</p>
          </div>
          <button
            type="button"
            aria-label="Close cinema configuration modal"
            onClick={onClose}
            className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
            </div>
          ) : error && !config ? (
            <div className="text-center py-8">
              <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <p className="text-red-600">{error}</p>
            </div>
          ) : config ? (
            <>
              {/* Tier */}
              <div>
                <p className="block text-sm font-medium text-text-primary mb-2">
                  Tier
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, tier: "top" })}
                    className={cn(
                      "px-4 py-2 rounded-lg border text-sm font-medium transition-colors",
                      config.tier === "top"
                        ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                        : "border-border-subtle text-text-secondary hover:border-border-default"
                    )}
                  >
                    Top Tier
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, tier: "standard" })}
                    className={cn(
                      "px-4 py-2 rounded-lg border text-sm font-medium transition-colors",
                      config.tier === "standard"
                        ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                        : "border-border-subtle text-text-secondary hover:border-border-default"
                    )}
                  >
                    Standard
                  </button>
                </div>
                <p className="text-xs text-text-tertiary mt-1">
                  Top tier triggers on any anomaly; standard tolerates more variance
                </p>
              </div>

              {/* Tolerance */}
              <div>
                <label
                  htmlFor="cinema-config-tolerance-percent"
                  className="block text-sm font-medium text-text-primary mb-2"
                >
                  Tolerance Threshold
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="cinema-config-tolerance-percent"
                    type="range"
                    min="10"
                    max="80"
                    step="5"
                    value={config.tolerancePercent}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        tolerancePercent: parseInt(e.target.value),
                      })
                    }
                    className="flex-1"
                  />
                  <span className="font-mono text-text-primary w-12 text-right">
                    {config.tolerancePercent}%
                  </span>
                </div>
                <p className="text-xs text-text-tertiary mt-1">
                  Anomaly triggers when count drops more than this percentage
                </p>
              </div>

              {/* Expected Counts */}
              <div>
                <p className="block text-sm font-medium text-text-primary mb-2">
                  Expected Counts (Optional)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="cinema-config-weekday-average"
                      className="block text-xs text-text-tertiary mb-1"
                    >
                      Weekday Average
                    </label>
                    <input
                      id="cinema-config-weekday-average"
                      type="number"
                      min="0"
                      value={config.weekdayAvg ?? ""}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          weekdayAvg: e.target.value ? parseInt(e.target.value) : null,
                          manualOverride: true,
                        })
                      }
                      placeholder="Auto"
                      className="w-full px-3 py-2 bg-background-secondary border border-border-subtle rounded-lg text-text-primary placeholder:text-text-tertiary"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="cinema-config-weekend-average"
                      className="block text-xs text-text-tertiary mb-1"
                    >
                      Weekend Average
                    </label>
                    <input
                      id="cinema-config-weekend-average"
                      type="number"
                      min="0"
                      value={config.weekendAvg ?? ""}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          weekendAvg: e.target.value ? parseInt(e.target.value) : null,
                          manualOverride: true,
                        })
                      }
                      placeholder="Auto"
                      className="w-full px-3 py-2 bg-background-secondary border border-border-subtle rounded-lg text-text-primary placeholder:text-text-tertiary"
                    />
                  </div>
                </div>
                <p className="text-xs text-text-tertiary mt-1">
                  Leave empty to calculate from historical data
                </p>
              </div>

              {/* Notes */}
              <div>
                <label
                  htmlFor="cinema-config-notes"
                  className="block text-sm font-medium text-text-primary mb-2"
                >
                  Notes
                </label>
                <textarea
                  id="cinema-config-notes"
                  value={config.notes ?? ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      notes: e.target.value || null,
                    })
                  }
                  placeholder="Optional notes about this cinema's configuration..."
                  rows={2}
                  className="w-full px-3 py-2 bg-background-secondary border border-border-subtle rounded-lg text-text-primary placeholder:text-text-tertiary resize-none"
                />
              </div>

              {/* Error */}
              {error && saveStatus === "error" && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </>
          ) : null}
        </CardContent>

        {/* Footer */}
        {config && (
          <div className="flex items-center justify-end gap-2 p-4 border-t border-border-subtle">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saveStatus === "saving" || saveStatus === "success"}
            >
              {saveStatus === "saving" && (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Saving...
                </>
              )}
              {saveStatus === "success" && (
                <>
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Saved
                </>
              )}
              {(saveStatus === "idle" || saveStatus === "error") && "Save Changes"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
