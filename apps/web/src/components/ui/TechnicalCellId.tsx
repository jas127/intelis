"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface TechnicalCellIdProps {
  h3Index: string;
  label?: string;
  className?: string;
}

/**
 * Subtle technical-details display for an internal H3 index with
 * a one-click copy-to-clipboard action.
 */
export function TechnicalCellId({
  h3Index,
  label = "H3 cell ID",
  className = "",
}: TechnicalCellIdProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(h3Index);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable in restricted context
    }
  };

  return (
    <div
      className={`inline-flex items-center gap-2 text-[11px] text-ink-muted ${className}`}
    >
      <span>{label}:</span>
      <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink-secondary">
        {h3Index}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        title={`Copy H3 ID ${h3Index}`}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary transition-colors hover:bg-surface hover:text-ink-primary"
      >
        {copied ? (
          <>
            <Check className="h-3 w-3 text-emeraldBrand" />
            <span className="text-emeraldBrand">Copied</span>
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" />
            <span>Copy</span>
          </>
        )}
      </button>
    </div>
  );
}
