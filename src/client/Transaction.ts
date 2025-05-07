/**
 * Transaction
 * 
 * This module provides a transaction API for performing multiple operations
 * atomically across multiple collections and documents.
 */

import { Document, TransactionOperation, TransactionOperationType, TransactionStatus, ErrorCode } from '../types';
import { ImpossibleDBError } from '../utils/errorHandler';
import { CreateOptions, UpdateOptions, DeleteOptions } from './Collection';

/**
 * Transaction result
 */
export interface TransactionResult {
  id: string;
  status: TransactionStatus;
  operations: TransactionOperation[];
  timestamp: number;
}

/**
 * Transaction class for performing multiple operations atomically
 */
export class Transaction {
  private readonly id: string;
  private readonly operations: TransactionOperation[] = [];
  private readonly executeTransaction: (operations: TransactionOperation[]) => Promise<TransactionResult>;
  private committed = false;
  private aborted = false;
  
  /**
   * Creates a new Transaction instance
   * 
   * @param id The transaction ID
   * @param executeTransaction Function to execute the transaction
   */
  constructor(
    id: string,
    executeTransaction: (operations: TransactionOperation[]) => Promise<TransactionResult>
  ) {
    if (!id || typeof id !== 'string') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Transaction ID is required and must be a string'
      );
    }
    
    this.id = id;
    this.executeTransaction = executeTransaction;
  }
  
  /**
   * Gets the transaction ID
   * 
   * @returns The transaction ID
   */
  getId(): string {
    return this.id;
  }
  
  /**
   * Gets the operations in this transaction
   * 
   * @returns The operations
   */
  getOperations(): TransactionOperation[] {
    return [...this.operations];
  }
  
  /**
   * Adds a read operation to the transaction
   * 
   * @param collection The collection to read from
   * @param documentId The ID of the document to read
   * @returns This transaction instance for chaining
   */
  read(collection: string, documentId: string): Transaction {
    this.ensureNotFinalized();
    
    if (!collection || typeof collection !== 'string') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Collection name is required and must be a string'
      );
    }
    
    if (!documentId || typeof documentId !== 'string') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Document ID is required and must be a string'
      );
    }
    
    this.operations.push({
      type: TransactionOperationType.READ,
      collection,
      documentId
    });
    
    return this;
  }
  
  /**
   * Adds a write operation to the transaction
   * 
   * @param collection The collection to write to
   * @param documentId The ID of the document to write
   * @param data The document data to write
   * @param options Options for the write operation
   * @returns This transaction instance for chaining
   */
  write(
    collection: string,
    documentId: string,
    data: Partial<Document>,
    options?: CreateOptions | UpdateOptions
  ): Transaction {
    this.ensureNotFinalized();
    
    if (!collection || typeof collection !== 'string') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Collection name is required and must be a string'
      );
    }
    
    if (!documentId || typeof documentId !== 'string') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Document ID is required and must be a string'
      );
    }
    
    if (!data || typeof data !== 'object') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_DOCUMENT,
        'Document data must be an object'
      );
    }
    
    this.operations.push({
      type: TransactionOperationType.WRITE,
      collection,
      documentId,
      data: {
        ...data,
        _id: documentId,
        _collection: collection
      }
    });
    
    return this;
  }
  
  /**
   * Adds a delete operation to the transaction
   * 
   * @param collection The collection to delete from
   * @param documentId The ID of the document to delete
   * @param options Options for the delete operation
   * @returns This transaction instance for chaining
   */
  delete(
    collection: string,
    documentId: string,
    options?: DeleteOptions
  ): Transaction {
    this.ensureNotFinalized();
    
    if (!collection || typeof collection !== 'string') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Collection name is required and must be a string'
      );
    }
    
    if (!documentId || typeof documentId !== 'string') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Document ID is required and must be a string'
      );
    }
    
    this.operations.push({
      type: TransactionOperationType.DELETE,
      collection,
      documentId
    });
    
    return this;
  }
  
  /**
   * Commits the transaction
   * 
   * @returns The transaction result
   */
  async commit(): Promise<TransactionResult> {
    this.ensureNotFinalized();
    
    if (this.operations.length === 0) {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Cannot commit an empty transaction'
      );
    }
    
    this.committed = true;
    
    try {
      return await this.executeTransaction(this.operations);
    } catch (error) {
      // If the transaction fails, mark it as aborted
      this.aborted = true;
      throw error;
    }
  }
  
  /**
   * Aborts the transaction
   */
  abort(): void {
    this.ensureNotFinalized();
    this.aborted = true;
  }
  
  /**
   * Checks if the transaction has been committed
   * 
   * @returns True if the transaction has been committed
   */
  isCommitted(): boolean {
    return this.committed;
  }
  
  /**
   * Checks if the transaction has been aborted
   * 
   * @returns True if the transaction has been aborted
   */
  isAborted(): boolean {
    return this.aborted;
  }
  
  /**
   * Ensures that the transaction has not been finalized (committed or aborted)
   * 
   * @throws If the transaction has been finalized
   */
  private ensureNotFinalized(): void {
    if (this.committed) {
      throw new ImpossibleDBError(
        ErrorCode.TRANSACTION_ABORTED,
        'Transaction has already been committed'
      );
    }
    
    if (this.aborted) {
      throw new ImpossibleDBError(
        ErrorCode.TRANSACTION_ABORTED,
        'Transaction has been aborted'
      );
    }
  }
}
