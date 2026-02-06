/**
 * Postcode Input Component
 * UK postcode input with validation and coordinate lookup
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { MapPin, Loader2, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  lookupPostcode,
  isValidPostcodeFormat,
  formatPostcode,
  isWithinLondon,
} from "@/lib/postcode";
import { useDebouncedCallback } from "use-debounce";

interface PostcodeInputProps {
  value: string;
  onChange: (
    postcode: string,
    coordinates: { lat: number; lng: number } | null,
    error?: string
  ) => void;
  error?: string | null;
  placeholder?: string;
  ariaLabel?: string;
}

type Status = "idle" | "validating" | "valid" | "invalid" | "warning";

export function PostcodeInput({
  value,
  onChange,
  error,
  placeholder = "e.g. E1 6PW",
  ariaLabel = "Postcode",
}: PostcodeInputProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [locationName, setLocationName] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced postcode lookup
  const lookupPostcodeDebounced = useDebouncedCallback(
    async (postcode: string) => {
      // Skip if too short
      if (postcode.replace(/\s/g, "").length < 5) {
        setStatus("idle");
        setLocationName(null);
        onChange(postcode, null);
        return;
      }

      // Quick format validation first
      if (!isValidPostcodeFormat(postcode)) {
        setStatus("invalid");
        setLocationName(null);
        onChange(postcode, null, "Invalid postcode format");
        return;
      }

      // Do the lookup
      setStatus("validating");
      setWarningMessage(null);

      try {
        const result = await lookupPostcode(postcode);

        if (!result) {
          setStatus("invalid");
          setLocationName(null);
          onChange(postcode, null, "Postcode not found");
          return;
        }

        // Check if within London
        const inLondon = isWithinLondon(result.latitude, result.longitude);
        if (!inLondon) {
          setWarningMessage(
            "This postcode is outside London - travel times may be long"
          );
          setStatus("warning");
        } else {
          setStatus("valid");
        }

        // Set location name for display
        setLocationName(result.admin_district || formatPostcode(postcode));

        // Pass coordinates to parent
        onChange(formatPostcode(postcode), {
          lat: result.latitude,
          lng: result.longitude,
        });
      } catch (err) {
        setStatus("invalid");
        setLocationName(null);
        onChange(postcode, null, "Failed to validate postcode");
      }
    },
    500 // 500ms debounce
  );

  // Handle input change
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value.toUpperCase();
      onChange(newValue, null); // Clear coords immediately
      lookupPostcodeDebounced(newValue);
    },
    [onChange, lookupPostcodeDebounced]
  );

  // Format on blur
  const handleBlur = useCallback(() => {
    if (value && isValidPostcodeFormat(value)) {
      const formatted = formatPostcode(value);
      if (formatted !== value) {
        onChange(formatted, null);
        lookupPostcodeDebounced(formatted);
      }
    }
  }, [value, onChange, lookupPostcodeDebounced]);

  // Validate initial value on mount
  useEffect(() => {
    if (value && value.length >= 5) {
      lookupPostcodeDebounced(value);
    }
  }, []); // Only on mount

  const showError = error || (status === "invalid" && value.length > 0);
  const showSuccess = status === "valid" || status === "warning";

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
          <MapPin className="w-5 h-5" />
        </div>

        <input
          ref={inputRef}
          type="text"
          aria-label={ariaLabel}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={cn(
            "w-full pl-10 pr-10 py-3 rounded-lg border bg-background-secondary text-text-primary",
            "placeholder:text-text-tertiary",
            "focus:outline-none focus:ring-2 focus:ring-accent-primary/50",
            "transition-colors",
            showError && "border-accent-danger focus:ring-accent-danger/30",
            showSuccess && "border-accent-success/40",
            !showError && !showSuccess && "border-border-default"
          )}
          autoComplete="postal-code"
          autoCapitalize="characters"
          spellCheck={false}
        />

        {/* Status Icon */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {status === "validating" && (
            <Loader2 className="w-5 h-5 text-text-tertiary animate-spin" />
          )}
          {status === "valid" && (
            <Check className="w-5 h-5 text-accent-success" />
          )}
          {status === "warning" && (
            <AlertCircle className="w-5 h-5 text-accent-highlight" />
          )}
          {status === "invalid" && value.length > 0 && (
            <AlertCircle className="w-5 h-5 text-accent-danger" />
          )}
        </div>
      </div>

      {/* Location Name Display */}
      {locationName && showSuccess && (
        <p className="text-sm text-accent-success flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" />
          {locationName}
        </p>
      )}

      {/* Warning Message */}
      {warningMessage && status === "warning" && (
        <p className="text-sm text-accent-highlight flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />
          {warningMessage}
        </p>
      )}

      {/* Error Message */}
      {showError && (
        <p className="text-sm text-accent-danger flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />
          {error || "Invalid postcode"}
        </p>
      )}
    </div>
  );
}
