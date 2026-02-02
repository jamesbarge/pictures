/**
 * FilmPoster Component
 * Wraps next/image with automatic optimization detection.
 * TMDB and Savoy URLs use full Next.js image optimization.
 * All other hosts render with unoptimized={true} to avoid allowlist issues.
 */

import Image, { type ImageProps } from "next/image";

const OPTIMIZED_HOSTS = ["image.tmdb.org", "images.savoysystems.co.uk"];

function isOptimizedHost(src: string): boolean {
  try {
    const url = new URL(src);
    return OPTIMIZED_HOSTS.includes(url.hostname);
  } catch {
    // Relative URLs (e.g. /api/poster-placeholder) are local — always optimized
    return true;
  }
}

type FilmPosterProps = Omit<ImageProps, "unoptimized">;

export function FilmPoster({ src, alt, ...props }: FilmPosterProps) {
  const srcString = typeof src === "string" ? src : "";
  const unoptimized = srcString ? !isOptimizedHost(srcString) : false;

  return <Image src={src} alt={alt} unoptimized={unoptimized} {...props} />;
}
