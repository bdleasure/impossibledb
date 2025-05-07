/**
 * Transaction Tests
 * 
 * This file contains tests for the Transaction class.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Transaction } from '../../../src/client/Transaction';
import { TransactionOperationType, TransactionStatus, ErrorCode } from '../../../src/types';
import { ImpossibleDBError } from '../../../src/utils/errorHandler';

describe('Transaction', () => {
  let transaction: Transaction;
  let executeTransactionMock: any;
  
  beforeEach(() => {
    executeTransactionMock = vi.fn().mockResolvedValue({
      id: 'tx1',
      status: TransactionStatus.COMMITTED,
      operations: [],
      timestamp: Date.now()
    });
    
    transaction = new Transaction('tx1', executeTransactionMock);
  });
  
  it('should create a transaction with an ID', () => {
    expect(transaction.getId()).toBe('tx1');
    expect(transaction.getOperations()).toEqual([]);
    expect(transaction.isCommitted()).toBe(false);
    expect(transaction.isAborted()).toBe(false);
  });
  
  it('should throw an error if created with an invalid ID', () => {
    expect(() => new Transaction('', executeTransactionMock)).toThrow(ImpossibleDBError);
    expect(() => new Transaction(null as any, executeTransactionMock)).toThrow(ImpossibleDBError);
  });
  
  it('should add a read operation', () => {
    transaction.read('users', 'user1');
    
    expect(transaction.getOperations()).toEqual([
      {
        type: TransactionOperationType.READ,
        collection: 'users',
        documentId: 'user1'
      }
    ]);
  });
  
  it('should throw an error if read is called with invalid parameters', () => {
    expect(() => transaction.read('', 'user1')).toThrow(ImpossibleDBError);
    expect(() => transaction.read('users', '')).toThrow(ImpossibleDBError);
    expect(() => transaction.read(null as any, 'user1')).toThrow(ImpossibleDBError);
    expect(() => transaction.read('users', null as any)).toThrow(ImpossibleDBError);
  });
  
  it('should add a write operation', () => {
    transaction.write('users', 'user1', { name: 'Alice' });
    
    expect(transaction.getOperations()).toEqual([
      {
        type: TransactionOperationType.WRITE,
        collection: 'users',
        documentId: 'user1',
        data: {
          name: 'Alice',
          _id: 'user1',
          _collection: 'users'
        }
      }
    ]);
  });
  
  it('should throw an error if write is called with invalid parameters', () => {
    expect(() => transaction.write('', 'user1', { name: 'Alice' })).toThrow(ImpossibleDBError);
    expect(() => transaction.write('users', '', { name: 'Alice' })).toThrow(ImpossibleDBError);
    expect(() => transaction.write('users', 'user1', null as any)).toThrow(ImpossibleDBError);
    expect(() => transaction.write(null as any, 'user1', { name: 'Alice' })).toThrow(ImpossibleDBError);
    expect(() => transaction.write('users', null as any, { name: 'Alice' })).toThrow(ImpossibleDBError);
  });
  
  it('should add a delete operation', () => {
    transaction.delete('users', 'user1');
    
    expect(transaction.getOperations()).toEqual([
      {
        type: TransactionOperationType.DELETE,
        collection: 'users',
        documentId: 'user1'
      }
    ]);
  });
  
  it('should throw an error if delete is called with invalid parameters', () => {
    expect(() => transaction.delete('', 'user1')).toThrow(ImpossibleDBError);
    expect(() => transaction.delete('users', '')).toThrow(ImpossibleDBError);
    expect(() => transaction.delete(null as any, 'user1')).toThrow(ImpossibleDBError);
    expect(() => transaction.delete('users', null as any)).toThrow(ImpossibleDBError);
  });
  
  it('should chain operations', () => {
    transaction
      .read('users', 'user1')
      .write('users', 'user2', { name: 'Bob' })
      .delete('users', 'user3');
    
    expect(transaction.getOperations()).toHaveLength(3);
    expect(transaction.getOperations()[0].type).toBe(TransactionOperationType.READ);
    expect(transaction.getOperations()[1].type).toBe(TransactionOperationType.WRITE);
    expect(transaction.getOperations()[2].type).toBe(TransactionOperationType.DELETE);
  });
  
  it('should commit a transaction', async () => {
    transaction
      .read('users', 'user1')
      .write('users', 'user2', { name: 'Bob' });
    
    const result = await transaction.commit();
    
    expect(result.id).toBe('tx1');
    expect(result.status).toBe(TransactionStatus.COMMITTED);
    expect(executeTransactionMock).toHaveBeenCalledWith([
      {
        type: TransactionOperationType.READ,
        collection: 'users',
        documentId: 'user1'
      },
      {
        type: TransactionOperationType.WRITE,
        collection: 'users',
        documentId: 'user2',
        data: {
          name: 'Bob',
          _id: 'user2',
          _collection: 'users'
        }
      }
    ]);
    expect(transaction.isCommitted()).toBe(true);
    expect(transaction.isAborted()).toBe(false);
  });
  
  it('should throw an error if committing an empty transaction', async () => {
    await expect(transaction.commit()).rejects.toThrow(ImpossibleDBError);
  });
  
  it('should throw an error if committing a transaction that has already been committed', async () => {
    transaction.read('users', 'user1');
    await transaction.commit();
    
    await expect(transaction.commit()).rejects.toThrow(ImpossibleDBError);
  });
  
  it('should throw an error if committing a transaction that has been aborted', async () => {
    transaction.read('users', 'user1');
    transaction.abort();
    
    await expect(transaction.commit()).rejects.toThrow(ImpossibleDBError);
  });
  
  it('should abort a transaction', () => {
    transaction.read('users', 'user1');
    transaction.abort();
    
    expect(transaction.isAborted()).toBe(true);
    expect(transaction.isCommitted()).toBe(false);
  });
  
  it('should throw an error if aborting a transaction that has already been committed', async () => {
    transaction.read('users', 'user1');
    await transaction.commit();
    
    expect(() => transaction.abort()).toThrow(ImpossibleDBError);
  });
  
  it('should throw an error if aborting a transaction that has already been aborted', () => {
    transaction.read('users', 'user1');
    transaction.abort();
    
    expect(() => transaction.abort()).toThrow(ImpossibleDBError);
  });
  
  it('should throw an error if adding operations after commit', async () => {
    transaction.read('users', 'user1');
    await transaction.commit();
    
    expect(() => transaction.read('users', 'user2')).toThrow(ImpossibleDBError);
    expect(() => transaction.write('users', 'user2', { name: 'Bob' })).toThrow(ImpossibleDBError);
    expect(() => transaction.delete('users', 'user2')).toThrow(ImpossibleDBError);
  });
  
  it('should throw an error if adding operations after abort', () => {
    transaction.read('users', 'user1');
    transaction.abort();
    
    expect(() => transaction.read('users', 'user2')).toThrow(ImpossibleDBError);
    expect(() => transaction.write('users', 'user2', { name: 'Bob' })).toThrow(ImpossibleDBError);
    expect(() => transaction.delete('users', 'user2')).toThrow(ImpossibleDBError);
  });
  
  it('should mark transaction as aborted if commit fails', async () => {
    executeTransactionMock.mockRejectedValue(new Error('Commit failed'));
    
    transaction.read('users', 'user1');
    
    await expect(transaction.commit()).rejects.toThrow('Commit failed');
    expect(transaction.isCommitted()).toBe(true);
    expect(transaction.isAborted()).toBe(true);
  });
});
