/**
 * HTTP Client Tests
 * 
 * This file contains tests for the HTTP client implementation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpClient, RequestOptions } from '../../../src/client/HttpClient';
import { ErrorCode } from '../../../src/types';
import { ImpossibleDBError } from '../../../src/utils/errorHandler';

// Mock fetch
global.fetch = vi.fn() as any;

// Create a mock AbortController
const mockAbortController = {
  abort: vi.fn(),
  signal: 'mock-signal'
};

// Mock AbortController constructor
vi.stubGlobal('AbortController', vi.fn(() => mockAbortController));

// Mock setTimeout
const mockSetTimeout = vi.fn().mockReturnValue(123);
vi.stubGlobal('setTimeout', mockSetTimeout);

// Mock clearTimeout
const mockClearTimeout = vi.fn();
vi.stubGlobal('clearTimeout', mockClearTimeout);

describe('HttpClient', () => {
  let client: HttpClient;
  
  const mockConfig = {
    endpoint: 'api.impossibledb.com',
    apiKey: 'test-api-key',
    useHttps: true,
    timeout: 5000,
    maxRetries: 3
  };
  
  beforeEach(() => {
    client = new HttpClient(mockConfig);
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    vi.resetAllMocks();
  });
  
  describe('request methods', () => {
    it('should send a GET request', async () => {
      // Mock successful response
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue({ data: 'test' }),
        headers: new Map([['content-type', 'application/json']])
      };
      
      (global.fetch as any).mockResolvedValue(mockResponse);
      
      const result = await client.get('users/123');
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.impossibledb.com/users/123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Bearer test-api-key'
          }),
          signal: 'mock-signal'
        })
      );
      
      expect(result).toEqual({ data: 'test' });
    });
    
    it('should send a POST request with data', async () => {
      // Mock successful response
      const mockResponse = {
        ok: true,
        status: 201,
        statusText: 'Created',
        json: vi.fn().mockResolvedValue({ id: '123', name: 'Test User' }),
        headers: new Map([['content-type', 'application/json']])
      };
      
      (global.fetch as any).mockResolvedValue(mockResponse);
      
      const data = { name: 'Test User', email: 'test@example.com' };
      const result = await client.post('users', data);
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.impossibledb.com/users',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Bearer test-api-key'
          }),
          body: JSON.stringify(data),
          signal: 'mock-signal'
        })
      );
      
      expect(result).toEqual({ id: '123', name: 'Test User' });
    });
    
    it('should send a PUT request with data', async () => {
      // Mock successful response
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue({ id: '123', name: 'Updated User' }),
        headers: new Map([['content-type', 'application/json']])
      };
      
      (global.fetch as any).mockResolvedValue(mockResponse);
      
      const data = { name: 'Updated User' };
      const result = await client.put('users/123', data);
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.impossibledb.com/users/123',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Bearer test-api-key'
          }),
          body: JSON.stringify(data),
          signal: 'mock-signal'
        })
      );
      
      expect(result).toEqual({ id: '123', name: 'Updated User' });
    });
    
    it('should send a DELETE request', async () => {
      // Mock successful response
      const mockResponse = {
        ok: true,
        status: 204,
        statusText: 'No Content',
        json: vi.fn().mockResolvedValue({}),
        headers: new Map([['content-type', 'application/json']])
      };
      
      (global.fetch as any).mockResolvedValue(mockResponse);
      
      const result = await client.delete('users/123');
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.impossibledb.com/users/123',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Bearer test-api-key'
          }),
          signal: 'mock-signal'
        })
      );
      
      expect(result).toEqual({});
    });
  });
  
  describe('error handling', () => {
    it('should handle server errors', async () => {
      // Mock error response
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: vi.fn().mockResolvedValue({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Something went wrong'
          }
        }),
        headers: new Map([['content-type', 'application/json']]),
        url: 'https://api.impossibledb.com/users'
      };
      
      // Always return the error response (no retries in test)
      (global.fetch as any).mockResolvedValue(mockResponse);
      
      // Create a client with no retries for this test
      const noRetryClient = new HttpClient({
        ...mockConfig,
        maxRetries: 0
      });
      
      await expect(noRetryClient.get('users')).rejects.toThrow(ImpossibleDBError);
      await expect(noRetryClient.get('users')).rejects.toMatchObject({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Something went wrong'
      });
    });
    
    it('should handle network errors', async () => {
      // Mock network error
      (global.fetch as any).mockRejectedValue(new TypeError('Failed to fetch'));
      
      // Create a client with no retries for this test
      const noRetryClient = new HttpClient({
        ...mockConfig,
        maxRetries: 0
      });
      
      await expect(noRetryClient.get('users')).rejects.toThrow(ImpossibleDBError);
      await expect(noRetryClient.get('users')).rejects.toMatchObject({
        code: ErrorCode.NETWORK_ERROR,
        message: 'Network error occurred'
      });
    });
    
    it('should handle timeout errors', async () => {
      // Mock timeout error
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      
      (global.fetch as any).mockRejectedValue(abortError);
      
      // Create a client with no retries for this test
      const noRetryClient = new HttpClient({
        ...mockConfig,
        maxRetries: 0
      });
      
      await expect(noRetryClient.get('users')).rejects.toThrow(ImpossibleDBError);
      await expect(noRetryClient.get('users')).rejects.toMatchObject({
        code: ErrorCode.TIMEOUT,
        message: 'Request timed out'
      });
    });
    
    it('should retry on server errors', async () => {
      // Mock error response for first attempt
      const mockErrorResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: vi.fn().mockResolvedValue({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Something went wrong'
          }
        }),
        headers: new Map([['content-type', 'application/json']]),
        url: 'https://api.impossibledb.com/users'
      };
      
      // Mock successful response for second attempt
      const mockSuccessResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue({ data: 'test' }),
        headers: new Map([['content-type', 'application/json']])
      };
      
      // First call fails, second call succeeds
      (global.fetch as any)
        .mockResolvedValueOnce(mockErrorResponse)
        .mockResolvedValueOnce(mockSuccessResponse);
      
      // Create a client with only 1 retry and no delay for this test
      const singleRetryClient = new HttpClient({
        ...mockConfig,
        maxRetries: 1
      });
      
      // Override the retry delay to be 0ms for testing
      vi.spyOn(singleRetryClient as any, 'getRetryDelay').mockReturnValue(0);
      
      const result = await singleRetryClient.get('users');
      
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ data: 'test' });
    });
    
    it('should respect max retries', async () => {
      // Mock error response
      const mockErrorResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: vi.fn().mockResolvedValue({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Something went wrong'
          }
        }),
        headers: new Map([['content-type', 'application/json']]),
        url: 'https://api.impossibledb.com/users'
      };
      
      // All calls fail
      (global.fetch as any).mockResolvedValue(mockErrorResponse);
      
      // Create a client with only 1 retry and no delay for this test
      const retryClient = new HttpClient({
        ...mockConfig,
        maxRetries: 1
      });
      
      // Override the retry delay to be 0ms for testing
      vi.spyOn(retryClient as any, 'getRetryDelay').mockReturnValue(0);
      
      // Set max retries to 2 for this specific request
      const options: RequestOptions = { retries: 2 };
      
      await expect(retryClient.get('users', options)).rejects.toThrow(ImpossibleDBError);
      
      // Initial attempt + 2 retries = 3 calls
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });
  
  describe('request options', () => {
    it('should use custom headers', async () => {
      // Mock successful response
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue({ data: 'test' }),
        headers: new Map([['content-type', 'application/json']])
      };
      
      (global.fetch as any).mockResolvedValue(mockResponse);
      
      const options: RequestOptions = {
        headers: {
          'X-Custom-Header': 'custom-value',
          'X-Trace-ID': '123456'
        }
      };
      
      await client.get('users', options);
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.impossibledb.com/users',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Bearer test-api-key',
            'X-Custom-Header': 'custom-value',
            'X-Trace-ID': '123456'
          })
        })
      );
    });
    
    it('should skip authentication when specified', async () => {
      // Mock successful response
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue({ data: 'test' }),
        headers: new Map([['content-type', 'application/json']])
      };
      
      (global.fetch as any).mockResolvedValue(mockResponse);
      
      const options: RequestOptions = {
        authenticate: false
      };
      
      await client.get('users', options);
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.impossibledb.com/users',
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'Authorization': expect.anything()
          })
        })
      );
    });
    
    it('should use custom timeout', async () => {
      // Mock successful response
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue({ data: 'test' }),
        headers: new Map([['content-type', 'application/json']])
      };
      
      (global.fetch as any).mockResolvedValue(mockResponse);
      
      const options: RequestOptions = {
        timeout: 10000
      };
      
      await client.get('users', options);
      
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 10000);
    });
  });
  
  describe('URL building', () => {
    it('should build URLs with HTTP protocol when specified', async () => {
      // Create client with HTTP protocol
      const httpClient = new HttpClient({
        ...mockConfig,
        useHttps: false
      });
      
      // Mock successful response
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue({ data: 'test' }),
        headers: new Map([['content-type', 'application/json']])
      };
      
      (global.fetch as any).mockResolvedValue(mockResponse);
      
      await httpClient.get('users');
      
      expect(global.fetch).toHaveBeenCalledWith(
        'http://api.impossibledb.com/users',
        expect.anything()
      );
    });
    
    it('should handle paths with or without leading slashes', async () => {
      // Mock successful response
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue({ data: 'test' }),
        headers: new Map([['content-type', 'application/json']])
      };
      
      (global.fetch as any).mockResolvedValue(mockResponse);
      
      // Path without leading slash
      await client.get('users/123');
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.impossibledb.com/users/123',
        expect.anything()
      );
      
      // Path with leading slash
      await client.get('/users/123');
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.impossibledb.com/users/123',
        expect.anything()
      );
    });
    
    it('should strip protocol from endpoint if provided', async () => {
      // Create client with protocol in endpoint
      const clientWithProtocol = new HttpClient({
        ...mockConfig,
        endpoint: 'https://api.impossibledb.com'
      });
      
      // Mock successful response
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue({ data: 'test' }),
        headers: new Map([['content-type', 'application/json']])
      };
      
      (global.fetch as any).mockResolvedValue(mockResponse);
      
      await clientWithProtocol.get('users');
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.impossibledb.com/users',
        expect.anything()
      );
    });
  });
});
