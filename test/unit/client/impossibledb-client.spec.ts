/**
 * ImpossibleDB Client Tests
 * 
 * This file contains tests for the ImpossibleDB client implementation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ImpossibleDBClient, ClientConfig } from '../../../src/client/ImpossibleDBClient';
import { HttpClient } from '../../../src/client/HttpClient';
import { Collection } from '../../../src/client/Collection';
import { Transaction } from '../../../src/client/Transaction';
import { Document, ErrorCode } from '../../../src/types';
import { ImpossibleDBError } from '../../../src/utils/errorHandler';

// Create a mock HttpClient class
class MockHttpClient {
  get = vi.fn();
  post = vi.fn();
  put = vi.fn();
  delete = vi.fn();
}

// Mock the HttpClient module
vi.mock('../../../src/client/HttpClient', () => {
  return {
    HttpClient: vi.fn().mockImplementation(() => new MockHttpClient())
  };
});

// Mock uuid
vi.mock('uuid', () => {
  return {
    v4: vi.fn().mockReturnValue('mock-uuid')
  };
});

describe('ImpossibleDBClient', () => {
  let client: ImpossibleDBClient;
  let mockHttpClient: any;
  
  const defaultConfig: ClientConfig = {
    endpoint: 'api.impossibledb.com',
    apiKey: 'test-api-key',
    timeout: 5000,
    maxRetries: 3,
    useHttps: true
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create a new client for each test
    client = new ImpossibleDBClient(defaultConfig);
    
    // Get the HttpClient instance that was created by the ImpossibleDBClient constructor
    mockHttpClient = vi.mocked(HttpClient).mock.results[0].value;
  });
  
  describe('constructor', () => {
    it('should create a client with default config when no config is provided', () => {
      const defaultClient = new ImpossibleDBClient();
      const config = defaultClient.getConfig();
      
      expect(config.endpoint).toBe('localhost:8787');
      expect(config.timeout).toBe(30000);
      expect(config.maxRetries).toBe(3);
      expect(config.useHttps).toBe(true);
      expect(config.apiKey).toBeUndefined();
    });
    
    it('should merge provided config with default config', () => {
      const customConfig: Partial<ClientConfig> = {
        endpoint: 'custom.impossibledb.com',
        apiKey: 'custom-api-key'
      };
      
      const customClient = new ImpossibleDBClient(customConfig);
      const config = customClient.getConfig();
      
      expect(config.endpoint).toBe('custom.impossibledb.com');
      expect(config.apiKey).toBe('custom-api-key');
      expect(config.timeout).toBe(30000); // Default value
      expect(config.maxRetries).toBe(3); // Default value
      expect(config.useHttps).toBe(true); // Default value
    });
    
    it('should initialize the HttpClient with the config', () => {
      expect(HttpClient).toHaveBeenCalledWith(expect.objectContaining(defaultConfig));
    });
  });
  
  describe('collection', () => {
    it('should throw an error if collection name is not provided', () => {
      expect(() => client.collection('')).toThrow(ImpossibleDBError);
      expect(() => client.collection('')).toThrow('Collection name is required and must be a string');
    });
    
    it('should return a Collection instance', () => {
      const collection = client.collection('users');
      
      expect(collection).toBeInstanceOf(Collection);
      expect(collection.getName()).toBe('users');
    });
    
    it('should cache and reuse Collection instances', () => {
      const collection1 = client.collection('users');
      const collection2 = client.collection('users');
      
      expect(collection1).toBe(collection2);
    });
    
    it('should create different Collection instances for different names', () => {
      const usersCollection = client.collection('users');
      const postsCollection = client.collection('posts');
      
      expect(usersCollection).not.toBe(postsCollection);
      expect(usersCollection.getName()).toBe('users');
      expect(postsCollection.getName()).toBe('posts');
    });
  });
  
  describe('createTransaction', () => {
    it('should create a Transaction instance', () => {
      const transaction = client.createTransaction();
      
      expect(transaction).toBeInstanceOf(Transaction);
      expect(transaction.getId()).toBe('mock-uuid');
    });
  });
  
  describe('API operations', () => {
    let usersCollection: Collection;
    
    beforeEach(() => {
      usersCollection = client.collection('users');
    });
    
    describe('query', () => {
      it('should execute a query', async () => {
        const mockResult = {
          results: [{ _id: '123', name: 'Test User' }],
          metadata: { total: 1, limit: 10, offset: 0 }
        };
        
        mockHttpClient.post.mockResolvedValue(mockResult);
        
        const query = usersCollection.query().where('name', '=', 'Test User');
        const result = await usersCollection.find(query);
        
        expect(mockHttpClient.post).toHaveBeenCalledWith(
          'collections/users/query',
          expect.objectContaining({
            filters: [{ field: 'name', operator: '=', value: 'Test User' }]
          }),
          expect.any(Object)
        );
        
        expect(result).toEqual(mockResult);
      });
    });
    
    describe('findById', () => {
      it('should get a document by ID', async () => {
        const mockDocument = {
          _id: '123',
          _collection: 'users',
          _version: 1,
          _createdAt: 1620000000000,
          _updatedAt: 1620000000000,
          name: 'Test User',
          email: 'test@example.com'
        };
        
        mockHttpClient.get.mockResolvedValue(mockDocument);
        
        const document = await usersCollection.findById('123');
        
        expect(mockHttpClient.get).toHaveBeenCalledWith(
          'collections/users/documents/123',
          expect.any(Object)
        );
        
        expect(document).toEqual(mockDocument);
      });
      
      it('should throw an error if document ID is not provided', async () => {
        await expect(usersCollection.findById('')).rejects.toThrow(ImpossibleDBError);
        await expect(usersCollection.findById('')).rejects.toThrow('Document ID is required and must be a string');
      });
    });
    
    describe('create', () => {
      it('should create a document', async () => {
        const newDocument = {
          name: 'Test User',
          email: 'test@example.com'
        };
        
        const mockCreatedDocument = {
          _id: 'mock-uuid',
          _collection: 'users',
          _version: 1,
          _createdAt: 1620000000000,
          _updatedAt: 1620000000000,
          ...newDocument
        };
        
        mockHttpClient.post.mockResolvedValue(mockCreatedDocument);
        
        const document = await usersCollection.create(newDocument);
        
        expect(mockHttpClient.post).toHaveBeenCalledWith(
          'collections/users/documents',
          expect.objectContaining({
            _id: 'mock-uuid',
            name: 'Test User',
            email: 'test@example.com'
          }),
          expect.any(Object)
        );
        
        expect(document).toEqual(mockCreatedDocument);
      });
      
      it('should throw an error if document is not provided', async () => {
        await expect(usersCollection.create(null as any)).rejects.toThrow(ImpossibleDBError);
        await expect(usersCollection.create(null as any)).rejects.toThrow('Document must be an object');
      });
    });
    
    describe('update', () => {
      it('should update a document', async () => {
        const updateData = {
          name: 'Updated User'
        };
        
        const mockUpdatedDocument = {
          _id: '123',
          _collection: 'users',
          _version: 2,
          _createdAt: 1620000000000,
          _updatedAt: 1620100000000,
          name: 'Updated User',
          email: 'test@example.com'
        };
        
        mockHttpClient.put.mockResolvedValue(mockUpdatedDocument);
        
        const document = await usersCollection.update('123', updateData);
        
        expect(mockHttpClient.put).toHaveBeenCalledWith(
          'collections/users/documents/123',
          updateData,
          expect.any(Object)
        );
        
        expect(document).toEqual(mockUpdatedDocument);
      });
      
      it('should throw an error if document ID is not provided', async () => {
        await expect(usersCollection.update('', { name: 'Updated User' })).rejects.toThrow(ImpossibleDBError);
        await expect(usersCollection.update('', { name: 'Updated User' })).rejects.toThrow('Document ID is required and must be a string');
      });
      
      it('should throw an error if update data is not provided', async () => {
        await expect(usersCollection.update('123', null as any)).rejects.toThrow(ImpossibleDBError);
        await expect(usersCollection.update('123', null as any)).rejects.toThrow('Document must be an object');
      });
    });
    
    describe('delete', () => {
      it('should delete a document', async () => {
        mockHttpClient.delete.mockResolvedValue(undefined);
        
        await usersCollection.delete('123');
        
        expect(mockHttpClient.delete).toHaveBeenCalledWith(
          'collections/users/documents/123',
          expect.any(Object)
        );
      });
      
      it('should throw an error if document ID is not provided', async () => {
        await expect(usersCollection.delete('')).rejects.toThrow(ImpossibleDBError);
        await expect(usersCollection.delete('')).rejects.toThrow('Document ID is required and must be a string');
      });
    });
  });
  
  describe('transaction', () => {
    it('should execute a transaction', async () => {
      const mockTransactionResult = {
        id: 'mock-uuid',
        status: 'COMMITTED',
        operations: [
          {
            type: 'WRITE',
            collection: 'users',
            documentId: '123',
            data: {
              _id: '123',
              _collection: 'users',
              name: 'Test User'
            }
          }
        ],
        timestamp: 1620000000000
      };
      
      mockHttpClient.post.mockResolvedValue(mockTransactionResult);
      
      const transaction = client.createTransaction();
      
      transaction.write('users', '123', { name: 'Test User' });
      
      const result = await transaction.commit();
      
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'transactions',
        {
          operations: [
            {
              type: 'WRITE',
              collection: 'users',
              documentId: '123',
              data: {
                _id: '123',
                _collection: 'users',
                name: 'Test User'
              }
            }
          ]
        },
        expect.objectContaining({
          timeout: 10000 // Default timeout * 2
        })
      );
      
      expect(result).toEqual(mockTransactionResult);
    });
  });
});
