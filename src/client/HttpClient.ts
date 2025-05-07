/**
 * HTTP Client for ImpossibleDB
 * 
 * This module provides the HTTP client for communicating with the ImpossibleDB server.
 * It handles request formatting, authentication, retries, and error handling.
 */

import { ClientConfig } from './ImpossibleDBClient';
import { ImpossibleDBError } from '../utils/errorHandler';
import { ErrorCode } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('HttpClient');

/**
 * HTTP request options
 */
export interface RequestOptions {
  // Request timeout in milliseconds
  timeout?: number;
  
  // Number of retry attempts for failed requests
  retries?: number;
  
  // Whether to include authentication headers
  authenticate?: boolean;
  
  // Additional headers to include in the request
  headers?: Record<string, string>;
}

/**
 * HTTP response interface
 */
export interface HttpResponse<T = any> {
  // Response status code
  status: number;
  
  // Response data
  data: T;
  
  // Response headers
  headers: Record<string, string>;
}

/**
 * HTTP client for communicating with the ImpossibleDB server
 */
export class HttpClient {
  private readonly config: ClientConfig;
  
  /**
   * Creates a new HttpClient instance
   * 
   * @param config Client configuration
   */
  constructor(config: ClientConfig) {
    this.config = config;
  }
  
  /**
   * Sends a GET request to the server
   * 
   * @param path The request path
   * @param options Request options
   * @returns The response data
   */
  async get<T = any>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }
  
  /**
   * Sends a POST request to the server
   * 
   * @param path The request path
   * @param data The request data
   * @param options Request options
   * @returns The response data
   */
  async post<T = any>(path: string, data?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, data, options);
  }
  
  /**
   * Sends a PUT request to the server
   * 
   * @param path The request path
   * @param data The request data
   * @param options Request options
   * @returns The response data
   */
  async put<T = any>(path: string, data?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, data, options);
  }
  
  /**
   * Sends a DELETE request to the server
   * 
   * @param path The request path
   * @param options Request options
   * @returns The response data
   */
  async delete<T = any>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }
  
  /**
   * Sends a request to the server
   * 
   * @param method The HTTP method
   * @param path The request path
   * @param data The request data
   * @param options Request options
   * @returns The response data
   */
  private async request<T = any>(
    method: string,
    path: string,
    data?: any,
    options?: RequestOptions
  ): Promise<T> {
    const url = this.buildUrl(path);
    const headers = this.buildHeaders(options);
    const timeout = options?.timeout ?? this.config.timeout;
    const retries = options?.retries ?? this.config.maxRetries ?? 3;
    
    let attempt = 0;
    let lastError: Error | null = null;
    
    while (attempt <= retries) {
      try {
        logger.debug(`Sending ${method} request to ${url} (attempt ${attempt + 1}/${retries})`);
        
        const response = await this.executeRequest<T>(method, url, data, headers, timeout);
        
        logger.debug(`Request successful: ${method} ${url} (status: ${response.status})`);
        
        return response.data;
      } catch (error) {
        lastError = error as Error;
        
        if (!this.shouldRetry(error, attempt, retries)) {
          break;
        }
        
        logger.warn(`Request failed, retrying: ${method} ${url} (attempt ${attempt + 1}/${retries}) - ${lastError.message}`);
        
        // Use the retry delay method
        const delay = this.getRetryDelay(attempt || 0);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        attempt++;
      }
    }
    
    logger.error(`Request failed after ${attempt} attempts (max: ${retries}): ${lastError?.message}`);
    
    throw this.handleError(lastError);
  }
  
  /**
   * Builds the request URL
   * 
   * @param path The request path
   * @returns The full URL
   */
  private buildUrl(path: string): string {
    const protocol = this.config.useHttps ? 'https' : 'http';
    const endpoint = this.config.endpoint.replace(/^https?:\/\//, '');
    
    // Ensure path starts with a slash
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    
    return `${protocol}://${endpoint}${normalizedPath}`;
  }
  
  /**
   * Builds the request headers
   * 
   * @param options Request options
   * @returns The request headers
   */
  private buildHeaders(options?: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'ImpossibleDB-Client/1.0'
    };
    
    // Add authentication header if required
    if (options?.authenticate !== false && this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    
    // Add custom headers
    if (options?.headers) {
      Object.assign(headers, options.headers);
    }
    
    return headers;
  }
  
  /**
   * Executes the HTTP request
   * 
   * @param method The HTTP method
   * @param url The request URL
   * @param data The request data
   * @param headers The request headers
   * @param timeout The request timeout
   * @returns The response
   */
  private async executeRequest<T>(
    method: string,
    url: string,
    data?: any,
    headers?: Record<string, string>,
    timeout?: number
  ): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const timeoutId = timeout ? setTimeout(() => controller.abort(), timeout) : null;
    
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal
      });
      
      const responseData = await response.json() as T;
      const responseHeaders: Record<string, string> = {};
      
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      
      if (!response.ok) {
        throw this.createErrorFromResponse(response, responseData);
      }
      
      return {
        status: response.status,
        data: responseData,
        headers: responseHeaders
      };
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }
  
  /**
   * Creates an error from the response
   * 
   * @param response The response object
   * @param data The response data
   * @returns The error
   */
  private createErrorFromResponse(response: Response, data: any): Error {
    const status = response.status;
    const message = data?.message || response.statusText;
    const code = data?.code || this.mapStatusToErrorCode(status);
    
    return new ImpossibleDBError(code, message, {
      status,
      url: response.url,
      data
    });
  }
  
  /**
   * Maps HTTP status codes to error codes
   * 
   * @param status The HTTP status code
   * @returns The error code
   */
  private mapStatusToErrorCode(status: number): ErrorCode {
    switch (status) {
      case 400:
        return ErrorCode.INVALID_REQUEST;
      case 401:
        return ErrorCode.UNAUTHORIZED;
      case 403:
        return ErrorCode.FORBIDDEN;
      case 404:
        return ErrorCode.DOCUMENT_NOT_FOUND;
      case 409:
        return ErrorCode.CONFLICT;
      case 429:
        return ErrorCode.RATE_LIMITED;
      case 500:
        return ErrorCode.INTERNAL_ERROR;
      case 503:
        return ErrorCode.SERVICE_UNAVAILABLE;
      default:
        return ErrorCode.UNKNOWN_ERROR;
    }
  }
  
  /**
   * Determines whether to retry a failed request
   * 
   * @param error The error
   * @param attempt The current attempt
   * @param maxRetries The maximum number of retries
   * @returns Whether to retry the request
   */
  private shouldRetry(error: any, attempt: number, maxRetries: number): boolean {
    // Don't retry if we've reached the maximum number of retries
    if (attempt >= maxRetries) {
      return false;
    }
    
    // Retry on network errors
    if (error instanceof TypeError || error.name === 'AbortError') {
      return true;
    }
    
    // Retry on certain HTTP status codes
    if (error instanceof ImpossibleDBError) {
      const status = (error.details as any)?.status;
      
      // Retry on server errors and rate limiting
      return status >= 500 || status === 429;
    }
    
    return false;
  }
  
  /**
   * Gets the delay before the next retry attempt
   * 
   * @param attempt The current attempt number (0-based)
   * @returns The delay in milliseconds
   */
  private getRetryDelay(attempt: number): number {
    // Exponential backoff with jitter
    const baseDelay = Math.min(1000 * Math.pow(2, attempt), 30000);
    const jitter = Math.random() * 0.3 * baseDelay;
    return baseDelay + jitter;
  }
  
  /**
   * Handles an error
   * 
   * @param error The error
   * @returns The error
   */
  private handleError(error: Error | null): Error {
    if (!error) {
      return new ImpossibleDBError(
        ErrorCode.UNKNOWN_ERROR,
        'Unknown error occurred'
      );
    }
    
    if (error instanceof ImpossibleDBError) {
      return error;
    }
    
    if (error.name === 'AbortError') {
      return new ImpossibleDBError(
        ErrorCode.TIMEOUT,
        'Request timed out'
      );
    }
    
    if (error instanceof TypeError) {
      return new ImpossibleDBError(
        ErrorCode.NETWORK_ERROR,
        'Network error occurred',
        { originalError: error }
      );
    }
    
    return new ImpossibleDBError(
      ErrorCode.UNKNOWN_ERROR,
      error.message || 'Unknown error occurred',
      { originalError: error }
    );
  }
}
