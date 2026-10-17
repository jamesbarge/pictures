/**
 * Standardized API error handling
 *
 * Provides typed errors and consistent response handling for API routes.
 */

import { NextResponse } from "next/server";

/**
 * Base API error class with HTTP status code
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
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
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

/**
 * Bad request error (400)
 */
export class BadRequestError extends ApiError {
  constructor(message = "Bad request", public readonly details?: unknown) {
    super(message, 400, "BAD_REQUEST");
    this.name = "BadRequestError";
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends ApiError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
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

  return NextResponse.json(body, { status: error.statusCode });
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
  return errorResponse(new ApiError("Internal server error"));
}
