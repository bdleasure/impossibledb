/**
 * Error Handler Utility
 * 
 * This file provides centralized error handling for ImpossibleDB.
 * It standardizes error responses and logging.
 */

import { ErrorCode, ErrorResponse } from '../types';
import { createLogger } from './logger';

const logger = createLogger('errorHandler');

/**
 * Custom error class for ImpossibleDB
 */
export class ImpossibleDBError extends Error {
  code: ErrorCode;
  details?: any;
  status: number;
  
  /**
   * Creates a new ImpossibleDBError
   * 
   * @param code Error code from ErrorCode enum
   * @param message Human-readable error message
   * @param details Optional additional details
   * @param status HTTP status code (defaults based on error code)
   */
  constructor(code: ErrorCode, message: string, details?: any, status?: number) {
    super(message);
    this.name = 'ImpossibleDBError';
    this.code = code;
    this.details = details;
    this.status = status || getStatusCodeForError(code);
  }
  
  /**
   * Converts the error to a standard error response
   */
  toResponse(): Response {
    const errorResponse: ErrorResponse = {
      error: {
        code: this.code,
        message: this.message,
        details: this.details
      }
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: this.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Maps error codes to HTTP status codes
 * 
 * @param code Error code
 * @returns Appropriate HTTP status code
 */
function getStatusCodeForError(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.INVALID_REQUEST:
      return 400;
    case ErrorCode.UNAUTHORIZED:
      return 401;
    case ErrorCode.FORBIDDEN:
      return 403;
    case ErrorCode.NOT_FOUND:
    case ErrorCode.DOCUMENT_NOT_FOUND:
    case ErrorCode.SHARD_NOT_FOUND:
      return 404;
    case ErrorCode.CONFLICT:
    case ErrorCode.DOCUMENT_ALREADY_EXISTS:
    case ErrorCode.TRANSACTION_CONFLICT:
      return 409;
    case ErrorCode.QUERY_TIMEOUT:
    case ErrorCode.TRANSACTION_TIMEOUT:
      return 408;
    case ErrorCode.SYSTEM_OVERLOADED:
      return 503;
    case ErrorCode.MAINTENANCE_MODE:
      return 503;
    default:
      return 500;
  }
}

/**
 * Handles an error and returns an appropriate response
 * 
 * @param error The error to handle
 * @returns A standardized response
 */
export function handleError(error: unknown): Response {
  // If it's already our custom error, just return its response
  if (error instanceof ImpossibleDBError) {
    logger.error(`${error.code}: ${error.message}`, error);
    return error.toResponse();
  }
  
  // For standard errors, convert to our format
  if (error instanceof Error) {
    logger.error('Unhandled error', error);
    
    const dbError = new ImpossibleDBError(
      ErrorCode.INTERNAL_ERROR,
      'An unexpected error occurred',
      { originalError: error.message }
    );
    
    return dbError.toResponse();
  }
  
  // For unknown errors
  logger.error('Unknown error type', undefined, { error });
  
  return new Response(JSON.stringify({
    error: {
      code: ErrorCode.UNKNOWN_ERROR,
      message: 'An unknown error occurred',
      details: String(error)
    }
  }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Creates a not found error response
 * 
 * @param message Custom message
 * @param details Additional details
 * @returns Error response
 */
export function notFound(message = 'Resource not found', details?: any): Response {
  return new ImpossibleDBError(ErrorCode.NOT_FOUND, message, details).toResponse();
}

/**
 * Creates a bad request error response
 * 
 * @param message Custom message
 * @param details Additional details
 * @returns Error response
 */
export function badRequest(message = 'Invalid request', details?: any): Response {
  return new ImpossibleDBError(ErrorCode.INVALID_REQUEST, message, details).toResponse();
}

/**
 * Wraps an async handler with error handling
 * 
 * @param handler The async handler function
 * @returns A new handler with error handling
 */
export function withErrorHandling(
  handler: (request: Request, env: any, ctx: ExecutionContext) => Promise<Response>
): (request: Request, env: any, ctx: ExecutionContext) => Promise<Response> {
  return async (request: Request, env: any, ctx: ExecutionContext) => {
    try {
      return await handler(request, env, ctx);
    } catch (error) {
      return handleError(error);
    }
  };
}
