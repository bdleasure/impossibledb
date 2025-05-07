/**
 * Storage Object Tests
 * 
 * This file contains tests for the StorageObject Durable Object.
 */

import { describe, it, expect } from 'vitest';
import { StorageObject } from '../src/objects/StorageObject';

// Mock DurableObjectState
class MockDurableObjectState {
  private storage = new Map<string, any>();
  
  blockConcurrencyWhile(callback: () => Promise<void>): Promise<void> {
    return callback();
  }
  
  async get<T>(key: string | string[]): Promise<T> {
    if (Array.isArray(key)) {
      const result: Record<string, any> = {};
      key.forEach(k => {
        result[k] = this.storage.get(k) || null;
      });
      return result as unknown as T;
    }
    return this.storage.get(key) as T;
  }
  
  async put(key: string, value: any): Promise<void> {
    this.storage.set(key, value);
  }
  
  async delete(key: string): Promise<boolean> {
    return this.storage.delete(key);
  }
}

// Helper functions for tests
async function createStorageObject(): Promise<StorageObject> {
  const mockState = new MockDurableObjectState();
  return new StorageObject(mockState as unknown as DurableObjectState);
}

async function createDocument(storage: StorageObject, collection: string, id: string, data: any): Promise<Response> {
  const url = new URL(`http://localhost/${collection}/${id}`);
  const request = new Request(url.toString(), {
    method: 'PUT',
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' }
  });
  return await storage.fetch(request);
}

async function getDocument(storage: StorageObject, collection: string, id: string): Promise<Response> {
  const url = new URL(`http://localhost/${collection}/${id}`);
  const request = new Request(url.toString(), {
    method: 'GET'
  });
  return await storage.fetch(request);
}

async function deleteDocument(storage: StorageObject, collection: string, id: string): Promise<Response> {
  const url = new URL(`http://localhost/${collection}/${id}`);
  const request = new Request(url.toString(), {
    method: 'DELETE'
  });
  return await storage.fetch(request);
}

async function queryDocuments(storage: StorageObject, collection: string, filters?: any[], options?: any): Promise<Response> {
  const url = new URL('http://localhost/query');
  const request = new Request(url.toString(), {
    method: 'POST',
    body: JSON.stringify({
      collection,
      filters,
      options
    }),
    headers: { 'Content-Type': 'application/json' }
  });
  return await storage.fetch(request);
}

// Tests
describe('StorageObject', () => {
  it('should create and retrieve a document', async () => {
    const storage = await createStorageObject();
    const testData = { name: 'Test User', email: 'test@example.com' };
    
    // Create document
    const putResponse = await createDocument(storage, 'users', 'user1', testData);
    expect(putResponse.status).toBe(201);
    
    const putResponseData = await putResponse.json() as Record<string, any>;
    expect(putResponseData.name).toBe(testData.name);
    expect(putResponseData.email).toBe(testData.email);
    expect(putResponseData._id).toBe('user1');
    expect(putResponseData._collection).toBe('users');
    expect(putResponseData._version).toBe(1);
    
    // Get document
    const getResponse = await getDocument(storage, 'users', 'user1');
    expect(getResponse.status).toBe(200);
    
    const getResponseData = await getResponse.json() as Record<string, any>;
    expect(getResponseData).toEqual(putResponseData);
  });
  
  it('should update an existing document', async () => {
    const storage = await createStorageObject();
    const initialData = { name: 'Test User', email: 'test@example.com' };
    const updatedData = { name: 'Updated User', email: 'updated@example.com' };
    
    // Create document
    await createDocument(storage, 'users', 'user1', initialData);
    
    // Update document
    const putResponse = await createDocument(storage, 'users', 'user1', updatedData);
    expect(putResponse.status).toBe(200);
    
    const putResponseData = await putResponse.json() as Record<string, any>;
    expect(putResponseData.name).toBe(updatedData.name);
    expect(putResponseData.email).toBe(updatedData.email);
    expect(putResponseData._version).toBe(2);
  });
  
  it('should delete a document', async () => {
    const storage = await createStorageObject();
    const testData = { name: 'Test User', email: 'test@example.com' };
    
    // Create document
    await createDocument(storage, 'users', 'user1', testData);
    
    // Delete document
    const deleteResponse = await deleteDocument(storage, 'users', 'user1');
    expect(deleteResponse.status).toBe(200);
    
    // Try to get deleted document
    const getResponse = await getDocument(storage, 'users', 'user1');
    expect(getResponse.status).toBe(404);
  });
  
  it('should query documents', async () => {
    const storage = await createStorageObject();
    
    // Create test documents
    await createDocument(storage, 'users', 'user1', { name: 'Alice', age: 25 });
    await createDocument(storage, 'users', 'user2', { name: 'Bob', age: 30 });
    await createDocument(storage, 'users', 'user3', { name: 'Charlie', age: 35 });
    
    // Query with filter
    const queryResponse = await queryDocuments(storage, 'users', [
      { field: 'age', operator: '>', value: 25 }
    ]);
    expect(queryResponse.status).toBe(200);
    
    const queryData = await queryResponse.json() as Record<string, any>;
    expect(queryData.results.length).toBe(2);
    expect(queryData.metadata.total).toBe(2);
    
    // Check that we got Bob and Charlie
    const names = queryData.results.map((doc: any) => doc.name).sort();
    expect(names).toEqual(['Bob', 'Charlie']);
  });
});
