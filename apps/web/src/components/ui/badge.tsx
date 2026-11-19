import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium tracking-tight",
  {
    variants: {
      tone: {
        neutral: "bg-surface text-ink-secondary border border-borderSubtle",
        cobalt: "bg-cobalt-soft text-cobalt",
        coral: "bg-coral-soft text-coral",
        orange: "bg-orange-soft text-orange",
        lavender: "bg-lavender-soft text-lavender",
        green: "bg-emeraldBrand-soft text-emeraldBrand",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props} />
  );
}
