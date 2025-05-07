/**
 * ImpossibleDBClient Tests
 * 
 * This file contains tests for the ImpossibleDBClient class.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImpossibleDBClient } from '../../../src/client/ImpossibleDBClient';
import { Collection } from '../../../src/client/Collection';
import { Transaction } from '../../../src/client/Transaction';
import { ErrorCode } from '../../../src/types';
import { ImpossibleDBError } from '../../../src/utils/errorHandler';

describe('ImpossibleDBClient', () => {
  let client: ImpossibleDBClient;
  
  beforeEach(() => {
    client = new ImpossibleDBClient({
      endpoint: 'test-endpoint',
      apiKey: 'test-api-key'
    });
  });
  
  it('should create a client with default configuration', () => {
    const defaultClient = new ImpossibleDBClient();
    const config = defaultClient.getConfig();
    
    expect(config.endpoint).toBe('localhost:8787');
    expect(config.timeout).toBe(30000);
    expect(config.maxRetries).toBe(3);
    expect(config.useHttps).toBe(true);
  });
  
  it('should create a client with custom configuration', () => {
    const config = client.getConfig();
    
    expect(config.endpoint).toBe('test-endpoint');
    expect(config.apiKey).toBe('test-api-key');
    expect(config.timeout).toBe(30000); // Default value
    expect(config.maxRetries).toBe(3); // Default value
    expect(config.useHttps).toBe(true); // Default value
  });
  
  it('should get a collection by name', () => {
    const collection = client.collection('users');
    
    expect(collection).toBeInstanceOf(Collection);
    expect(collection.getName()).toBe('users');
  });
  
  it('should cache collections', () => {
    const collection1 = client.collection('users');
    const collection2 = client.collection('users');
    
    expect(collection1).toBe(collection2); // Same instance
  });
  
  it('should throw an error if getting a collection with an invalid name', () => {
    expect(() => client.collection('')).toThrow(ImpossibleDBError);
    expect(() => client.collection(null as any)).toThrow(ImpossibleDBError);
  });
  
  it('should create a transaction', () => {
    const transaction = client.createTransaction();
    
    expect(transaction).toBeInstanceOf(Transaction);
    expect(transaction.getId()).toBeDefined();
    expect(transaction.getOperations()).toEqual([]);
  });
  
  it('should allow querying a collection', async () => {
    const collection = client.collection('users');
    const queryBuilder = collection.query().where('age', '>', 21);
    
    const result = await collection.find(queryBuilder);
    
    expect(result).toBeDefined();
    expect(result.results).toBeInstanceOf(Array);
    expect(result.metadata).toBeDefined();
  });
  
  it('should allow creating a document', async () => {
    const collection = client.collection('users');
    const doc = await collection.create({ name: 'Alice', age: 30 });
    
    expect(doc).toBeDefined();
    expect(doc._id).toBeDefined();
    expect(doc._collection).toBe('users');
    expect(doc._version).toBe(1);
    expect(doc._createdAt).toBeDefined();
    expect(doc._updatedAt).toBeDefined();
    expect(doc.name).toBe('Alice');
    expect(doc.age).toBe(30);
  });
  
  it('should allow reading a document', async () => {
    const collection = client.collection('users');
    const doc = await collection.findById('user1');
    
    expect(doc).toBeDefined();
    expect(doc._id).toBe('user1');
    expect(doc._collection).toBe('users');
    expect(doc._version).toBeDefined();
    expect(doc._createdAt).toBeDefined();
    expect(doc._updatedAt).toBeDefined();
  });
  
  it('should allow updating a document', async () => {
    const collection = client.collection('users');
    const doc = await collection.update('user1', { name: 'Updated Name' });
    
    expect(doc).toBeDefined();
    expect(doc._id).toBe('user1');
    expect(doc._collection).toBe('users');
    expect(doc._version).toBe(2);
    expect(doc._createdAt).toBeDefined();
    expect(doc._updatedAt).toBeDefined();
    expect(doc.name).toBe('Updated Name');
  });
  
  it('should allow deleting a document', async () => {
    const collection = client.collection('users');
    await expect(collection.delete('user1')).resolves.toBeUndefined();
  });
  
  it('should allow executing a transaction', async () => {
    const transaction = client.createTransaction();
    
    transaction
      .read('users', 'user1')
      .write('users', 'user2', { name: 'Bob' })
      .delete('users', 'user3');
    
    const result = await transaction.commit();
    
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.status).toBe('COMMITTED');
    expect(result.operations).toHaveLength(3);
    expect(result.timestamp).toBeDefined();
  });
});
