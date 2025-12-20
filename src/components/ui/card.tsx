/**
 * Card Component
 * Flexible container component with multiple variants for content display
 */

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type CardVariant = "default" | "elevated" | "outlined" | "ghost" | "interactive";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: "none" | "sm" | "md" | "lg";
  as?: "div" | "article" | "section";
}

const variantStyles: Record<CardVariant, string> = {
  default: "bg-background-secondary/50 border border-border-subtle",
  elevated: "bg-background-secondary border border-border-subtle shadow-md",
  outlined: "bg-transparent border border-border-default",
  ghost: "bg-transparent border-none",
  interactive: cn(
    "bg-background-secondary/50 border border-border-subtle",
    "transition-all duration-[var(--duration-normal)]",
    "hover:border-accent-gold/30 hover:bg-background-secondary hover:shadow-md",
    "cursor-pointer"
  ),
};

const paddingStyles: Record<string, string> = {
  none: "p-0",
  sm: "p-[var(--space-3)]",
  md: "p-[var(--card-padding)]",
  lg: "p-[var(--space-6)]",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    variant = "default",
    padding = "md",
    as: Component = "div",
    className,
    children,
    ...props
  },
  ref
) {
  return (
    <Component
      ref={ref}
      className={cn(
        "rounded-[var(--card-radius)]",
        variantStyles[variant],
        paddingStyles[padding],
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
});

// Card Header subcomponent
export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  heading?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}

export function CardHeader({
  heading,
  subtitle,
  action,
  className,
  children,
  ...props
}: CardHeaderProps) {
  return (
    <div
      className={cn("flex items-start justify-between gap-4", className)}
      {...props}
    >
      <div className="flex-1 min-w-0">
        {heading && (
          <h3 className="font-display text-lg text-text-primary truncate">
            {heading}
          </h3>
        )}
        {subtitle && (
          <p className="text-sm text-text-secondary mt-0.5">{subtitle}</p>
        )}
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// Card Content subcomponent
export function CardContent({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mt-3", className)} {...props}>
      {children}
    </div>
  );
}

// Card Footer subcomponent
export function CardFooter({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-4 pt-4 border-t border-border-subtle flex items-center justify-between gap-3",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// Card Image subcomponent - for image headers
export interface CardImageProps extends HTMLAttributes<HTMLDivElement> {
  src: string;
  alt: string;
  aspectRatio?: "video" | "square" | "poster";
  overlay?: ReactNode;
}

export function CardImage({
  src,
  alt,
  aspectRatio = "video",
  overlay,
  className,
  ...props
}: CardImageProps) {
  const aspectStyles = {
    video: "aspect-video",
    square: "aspect-square",
    poster: "aspect-[2/3]",
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-t-[var(--card-radius)] -mx-[var(--card-padding)] -mt-[var(--card-padding)]",
        aspectStyles[aspectRatio],
        className
      )}
      {...props}
    >
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-cover"
      />
      {overlay && (
        <div className="absolute inset-0 bg-gradient-to-t from-background-primary/80 via-transparent to-transparent">
          {overlay}
        </div>
      )}
    </div>
  );
}

// Skeleton Card for loading states
export function CardSkeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <Card className={cn("animate-pulse", className)} {...props}>
      <div className="space-y-3">
        <div className="h-4 bg-background-tertiary rounded w-3/4 skeleton" />
        <div className="h-3 bg-background-tertiary rounded w-1/2 skeleton" />
        <div className="h-20 bg-background-tertiary rounded skeleton" />
      </div>
    </Card>
  );
}
