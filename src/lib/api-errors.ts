/**
 * Standardized API error handling
 *
 * Provides typed errors and consistent response handling for API routes.
 */

import { NextResponse } from "next/server";

/**
 * HTTP status codes for common API errors
 */
export const HttpStatus = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

/**
 * Base API error class with HTTP status code
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Unauthorized access error (401)
 */
export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized") {
    super(message, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

/**
 * Bad request error (400)
 */
export class BadRequestError extends ApiError {
  constructor(message = "Bad request", public readonly details?: unknown) {
    super(message, HttpStatus.BAD_REQUEST, "BAD_REQUEST");
    this.name = "BadRequestError";
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends ApiError {
  constructor(message = "Resource not found") {
    super(message, HttpStatus.NOT_FOUND, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

/**
 * Rate limit exceeded error (429)
 */
export class RateLimitError extends ApiError {
  constructor(
    message = "Too many requests",
    public readonly resetIn?: number
  ) {
    super(message, HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED");
    this.name = "RateLimitError";
  }
}

/**
 * Standard API error response format
 */
interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}

/**
 * Create a JSON error response from an ApiError
 */
export function errorResponse(error: ApiError): NextResponse<ApiErrorResponse> {
  const body: ApiErrorResponse = {
    error: error.message,
  };

  if (error.code) {
    body.code = error.code;
  }

  if (error instanceof BadRequestError && error.details) {
    body.details = error.details;
  }

  const headers: Record<string, string> = {};

  if (error instanceof RateLimitError && error.resetIn) {
    headers["Retry-After"] = String(error.resetIn);
    headers["X-RateLimit-Remaining"] = "0";
  }

  return NextResponse.json(body, {
    status: error.statusCode,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
}

/**
 * Handle an unknown error and return an appropriate response
 *
 * Use this in catch blocks to standardize error handling:
 * ```
 * try {
 *   // ...
 * } catch (error) {
 *   return handleApiError(error, "operation description");
 * }
 * ```
 */
export function handleApiError(
  error: unknown,
  context?: string
): NextResponse<ApiErrorResponse> {
  // Handle known API errors
  if (error instanceof ApiError) {
    return errorResponse(error);
  }

  // Handle legacy "Unauthorized" error message pattern
  if (error instanceof Error && error.message === "Unauthorized") {
    return errorResponse(new UnauthorizedError());
  }

  // Log unexpected errors
  const message = context ? `API error in ${context}` : "API error";
  console.error(message, error);

  // Return generic 500 for unexpected errors
  return errorResponse(
    new ApiError("Internal server error", HttpStatus.INTERNAL_SERVER_ERROR)
  );
}

/**
 * Type guard to check if a value is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
