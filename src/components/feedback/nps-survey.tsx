/**
 * NPS Survey Component
 * Lightweight in-app Net Promoter Score survey.
 * Shows after meaningful engagement (e.g., 5+ sessions).
 * Captures score (0-10) and optional comment via PostHog.
 *
 * Key insight: NPS 7→8→9→10 each doubles viral coefficient (Nilan Peiris, Wise).
 * We track scores to identify what drives Promoters vs Detractors.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { usePostHog } from "posthog-js/react";

const NPS_STORAGE_KEY = "pictures-nps-state";
const NPS_SESSION_KEY = "pictures-nps-session-counted";
const MIN_SESSIONS_BEFORE_PROMPT = 5;
const DAYS_BETWEEN_PROMPTS = 90;

interface NpsState {
  lastPromptedAt: string | null;
  sessionCount: number;
  permanentlyDismissed: boolean;
  responded: boolean;
}

function getNpsState(): NpsState {
  if (typeof window === "undefined") {
    return { lastPromptedAt: null, sessionCount: 0, permanentlyDismissed: false, responded: false };
  }
  try {
    const stored = localStorage.getItem(NPS_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // Ignore parse errors
  }
  return { lastPromptedAt: null, sessionCount: 0, permanentlyDismissed: false, responded: false };
}

function setNpsState(state: NpsState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NPS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

export function NpsSurvey() {
  const [visible, setVisible] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const posthog = usePostHog();

  // Determine if we should show the survey
  useEffect(() => {
    const state = getNpsState();

    // Increment session count once per browser session (not per mount/navigation)
    if (!sessionStorage.getItem(NPS_SESSION_KEY)) {
      state.sessionCount += 1;
      setNpsState(state);
      sessionStorage.setItem(NPS_SESSION_KEY, "1");
    }

    // Don't show if already responded or permanently dismissed
    if (state.responded || state.permanentlyDismissed) return;

    // Don't show if not enough sessions
    if (state.sessionCount < MIN_SESSIONS_BEFORE_PROMPT) return;

    // Don't show if recently prompted (covers both "ask later" dismissals and previous showings)
    if (state.lastPromptedAt) {
      const lastPrompted = new Date(state.lastPromptedAt);
      const daysSincePrompt = (Date.now() - lastPrompted.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSincePrompt < DAYS_BETWEEN_PROMPTS) return;
    }

    // Show after a delay so it doesn't interrupt the initial experience
    const timer = setTimeout(() => {
      setVisible(true);
      state.lastPromptedAt = new Date().toISOString();
      setNpsState(state);
      posthog.capture("nps_survey_shown", { session_count: state.sessionCount });
    }, 15000); // 15 seconds after page load

    return () => clearTimeout(timer);
  }, [posthog]);

  const handleAskLater = useCallback(() => {
    setVisible(false);
    const state = getNpsState();
    // lastPromptedAt already set when shown — 90-day cooldown will apply
    setNpsState(state);
    posthog.capture("nps_survey_dismissed", { action: "ask_later" });
  }, [posthog]);

  const handleDontAskAgain = useCallback(() => {
    setVisible(false);
    const state = getNpsState();
    state.permanentlyDismissed = true;
    setNpsState(state);
    posthog.capture("nps_survey_dismissed", { action: "dont_ask_again" });
  }, [posthog]);

  const handleSubmit = useCallback(() => {
    if (score === null) return;

    posthog.capture("nps_score_submitted", {
      nps_score: score,
      nps_comment: comment || undefined,
      nps_category: score >= 9 ? "promoter" : score >= 7 ? "passive" : "detractor",
    });

    const state = getNpsState();
    state.responded = true;
    setNpsState(state);
    setSubmitted(true);

    // Auto-dismiss after thank you
    setTimeout(() => setVisible(false), 3000);
  }, [score, comment, posthog]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-[380px] z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-background-secondary border border-border-default rounded-xl shadow-elevated p-4">
        {submitted ? (
          <div className="text-center py-2">
            <p className="text-text-primary font-medium">Thank you for your feedback!</p>
            <p className="text-text-tertiary text-sm mt-1">
              {score !== null && score >= 9
                ? "Glad you love Pictures! Tell a friend?"
                : "We'll use this to make Pictures better."}
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-text-primary font-medium text-sm">
                  How likely are you to recommend Pictures to a friend?
                </p>
              </div>
              <button
                onClick={handleAskLater}
                className="p-1 rounded-lg hover:bg-surface-overlay-hover text-text-tertiary hover:text-text-primary transition-colors -mt-1 -mr-1"
                aria-label="Ask me later"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Score buttons */}
            <div className="flex gap-1 mb-2">
              {Array.from({ length: 11 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setScore(i)}
                  className={cn(
                    "flex-1 py-2 text-xs font-mono rounded transition-colors",
                    score === i
                      ? i >= 9
                        ? "bg-accent-success text-white"
                        : i >= 7
                          ? "bg-accent-highlight text-white"
                          : "bg-accent-danger text-white"
                      : "bg-background-tertiary text-text-secondary hover:bg-surface-overlay-hover"
                  )}
                  aria-label={`Score ${i} out of 10`}
                >
                  {i}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-text-tertiary mb-3">
              <span>Not likely</span>
              <span>Very likely</span>
            </div>

            {/* Comment (shown after score selection) */}
            {score !== null && (
              <div className="space-y-2">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={
                    score >= 9
                      ? "What do you love most?"
                      : score >= 7
                        ? "What could we improve?"
                        : "What's missing or frustrating?"
                  }
                  className="w-full px-3 py-2 text-sm bg-background-primary border border-border-subtle rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary/40 resize-none"
                  rows={2}
                />
                <button
                  onClick={handleSubmit}
                  className="w-full py-2 text-sm font-medium text-text-inverse bg-accent-primary hover:bg-accent-primary-hover rounded-lg transition-colors"
                >
                  Submit
                </button>
              </div>
            )}

            <button
              onClick={handleDontAskAgain}
              className="w-full text-center text-[11px] text-text-tertiary hover:text-text-secondary transition-colors mt-2"
            >
              Don&apos;t ask again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
