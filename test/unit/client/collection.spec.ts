/**
 * Collection Tests
 * 
 * This file contains tests for the Collection class.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Collection } from '../../../src/client/Collection';
import { QueryBuilder } from '../../../src/client/QueryBuilder';
import { Transaction } from '../../../src/client/Transaction';
import { Document, ErrorCode } from '../../../src/types';
import { ImpossibleDBError } from '../../../src/utils/errorHandler';

describe('Collection', () => {
  let collection: Collection;
  let executeQueryMock: any;
  let executeCreateMock: any;
  let executeReadMock: any;
  let executeUpdateMock: any;
  let executeDeleteMock: any;
  let createTransactionMock: any;
  let mockTransaction: Transaction;
  
  beforeEach(() => {
    executeQueryMock = vi.fn().mockResolvedValue({
      results: [],
      metadata: { total: 0, limit: 10, offset: 0 }
    });
    
    executeCreateMock = vi.fn().mockImplementation((collection, doc) => {
      return Promise.resolve({
        ...doc,
        _id: doc._id || 'generated-id',
        _collection: collection,
        _version: 1,
        _createdAt: Date.now(),
        _updatedAt: Date.now()
      });
    });
    
    executeReadMock = vi.fn().mockImplementation((collection, id) => {
      return Promise.resolve({
        _id: id,
        _collection: collection,
        _version: 1,
        _createdAt: Date.now(),
        _updatedAt: Date.now(),
        name: 'Test Document'
      });
    });
    
    executeUpdateMock = vi.fn().mockImplementation((collection, id, doc) => {
      return Promise.resolve({
        ...doc,
        _id: id,
        _collection: collection,
        _version: 2,
        _createdAt: Date.now(),
        _updatedAt: Date.now()
      });
    });
    
    executeDeleteMock = vi.fn().mockResolvedValue(undefined);
    
    mockTransaction = {
      getId: vi.fn().mockReturnValue('tx1'),
      getOperations: vi.fn().mockReturnValue([]),
      read: vi.fn().mockReturnThis(),
      write: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      commit: vi.fn().mockResolvedValue({ id: 'tx1', status: 'COMMITTED', operations: [], timestamp: Date.now() }),
      abort: vi.fn(),
      isCommitted: vi.fn().mockReturnValue(false),
      isAborted: vi.fn().mockReturnValue(false)
    } as unknown as Transaction;
    
    createTransactionMock = vi.fn().mockReturnValue(mockTransaction);
    
    collection = new Collection(
      'users',
      executeQueryMock,
      executeCreateMock,
      executeReadMock,
      executeUpdateMock,
      executeDeleteMock,
      createTransactionMock
    );
  });
  
  it('should create a collection with a name', () => {
    expect(collection.getName()).toBe('users');
  });
  
  it('should throw an error if created with an invalid name', () => {
    expect(() => new Collection('', executeQueryMock, executeCreateMock, executeReadMock, executeUpdateMock, executeDeleteMock, createTransactionMock)).toThrow(ImpossibleDBError);
    expect(() => new Collection(null as any, executeQueryMock, executeCreateMock, executeReadMock, executeUpdateMock, executeDeleteMock, createTransactionMock)).toThrow(ImpossibleDBError);
  });
  
  it('should create a query builder for the collection', () => {
    const queryBuilder = collection.query();
    
    expect(queryBuilder).toBeInstanceOf(QueryBuilder);
    expect(queryBuilder.getCollection()).toBe('users');
  });
  
  it('should execute a query', async () => {
    const queryBuilder = collection.query().where('age', '>', 21);
    
    await collection.find(queryBuilder);
    
    expect(executeQueryMock).toHaveBeenCalledWith(
      'users',
      [{ field: 'age', operator: '>', value: 21 }],
      undefined,
      {},
      []
    );
  });
  
  it('should throw an error if executing a query for a different collection', async () => {
    const queryBuilder = new QueryBuilder('products');
    
    await expect(collection.find(queryBuilder)).rejects.toThrow(ImpossibleDBError);
  });
  
  it('should find a document by ID', async () => {
    const doc = await collection.findById('user1');
    
    expect(doc._id).toBe('user1');
    expect(doc._collection).toBe('users');
    expect(executeReadMock).toHaveBeenCalledWith('users', 'user1');
  });
  
  it('should throw an error if finding a document with an invalid ID', async () => {
    await expect(collection.findById('')).rejects.toThrow(ImpossibleDBError);
    await expect(collection.findById(null as any)).rejects.toThrow(ImpossibleDBError);
  });
  
  it('should find a document by ID or return null if not found', async () => {
    executeReadMock.mockResolvedValueOnce({
      _id: 'user1',
      _collection: 'users',
      _version: 1,
      _createdAt: Date.now(),
      _updatedAt: Date.now(),
      name: 'Test Document'
    });
    
    const doc = await collection.findByIdOrNull('user1');
    expect(doc).not.toBeNull();
    expect(doc!._id).toBe('user1');
    
    // Mock a not found error
    executeReadMock.mockRejectedValueOnce(new ImpossibleDBError(ErrorCode.DOCUMENT_NOT_FOUND, 'Document not found'));
    
    const notFoundDoc = await collection.findByIdOrNull('nonexistent');
    expect(notFoundDoc).toBeNull();
    
    // Mock a different error
    executeReadMock.mockRejectedValueOnce(new ImpossibleDBError(ErrorCode.INTERNAL_ERROR, 'Internal error'));
    
    await expect(collection.findByIdOrNull('error')).rejects.toThrow(ImpossibleDBError);
  });
  
  it('should create a document', async () => {
    const doc = await collection.create({ name: 'Alice', age: 30 });
    
    expect(doc._id).toBe('generated-id');
    expect(doc._collection).toBe('users');
    expect(doc._version).toBe(1);
    expect(doc.name).toBe('Alice');
    expect(doc.age).toBe(30);
    expect(executeCreateMock).toHaveBeenCalledWith('users', { name: 'Alice', age: 30 }, undefined);
  });
  
  it('should throw an error if creating an invalid document', async () => {
    await expect(collection.create(null as any)).rejects.toThrow(ImpossibleDBError);
  });
  
  it('should update a document', async () => {
    const doc = await collection.update('user1', { name: 'Updated Name' });
    
    expect(doc._id).toBe('user1');
    expect(doc._collection).toBe('users');
    expect(doc._version).toBe(2);
    expect(doc.name).toBe('Updated Name');
    expect(executeUpdateMock).toHaveBeenCalledWith('users', 'user1', { name: 'Updated Name' }, undefined);
  });
  
  it('should throw an error if updating with an invalid ID or document', async () => {
    await expect(collection.update('', { name: 'Updated Name' })).rejects.toThrow(ImpossibleDBError);
    await expect(collection.update(null as any, { name: 'Updated Name' })).rejects.toThrow(ImpossibleDBError);
    await expect(collection.update('user1', null as any)).rejects.toThrow(ImpossibleDBError);
  });
  
  it('should delete a document', async () => {
    await collection.delete('user1');
    
    expect(executeDeleteMock).toHaveBeenCalledWith('users', 'user1', undefined);
  });
  
  it('should throw an error if deleting with an invalid ID', async () => {
    await expect(collection.delete('')).rejects.toThrow(ImpossibleDBError);
    await expect(collection.delete(null as any)).rejects.toThrow(ImpossibleDBError);
  });
  
  it('should create a transaction', () => {
    const transaction = collection.transaction();
    
    expect(transaction).toBe(mockTransaction);
    expect(createTransactionMock).toHaveBeenCalled();
  });
});
