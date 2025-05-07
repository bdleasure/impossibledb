/**
 * ImpossibleDB Client
 * 
 * This module provides the main client interface for interacting with ImpossibleDB.
 * It allows for creating and accessing collections, as well as managing database
 * configuration and connections.
 */

import { Collection, CreateOptions, UpdateOptions, DeleteOptions } from './Collection';
import { Transaction, TransactionResult } from './Transaction';
import { Document, QueryFilter, QueryOptions, QueryResult, ErrorCode, TransactionOperation } from '../types';
import { ImpossibleDBError } from '../utils/errorHandler';
import { AggregationSpec } from '../query/aggregator';
import { v4 as uuidv4 } from 'uuid';

/**
 * Client configuration options
 */
export interface ClientConfig {
  // The endpoint URL for the ImpossibleDB server
  endpoint: string;
  
  // API key for authentication (if required)
  apiKey?: string;
  
  // Request timeout in milliseconds
  timeout?: number;
  
  // Maximum number of retries for failed requests
  maxRetries?: number;
  
  // Whether to use HTTPS for requests
  useHttps?: boolean;
}

/**
 * Default client configuration
 */
const DEFAULT_CONFIG: ClientConfig = {
  endpoint: 'localhost:8787',
  timeout: 30000,
  maxRetries: 3,
  useHttps: true
};

/**
 * ImpossibleDB client for interacting with the database
 */
export class ImpossibleDBClient {
  private readonly config: ClientConfig;
  private readonly collections: Map<string, Collection> = new Map();
  
  /**
   * Creates a new ImpossibleDBClient instance
   * 
   * @param config Client configuration
   */
  constructor(config: Partial<ClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Gets the client configuration
   * 
   * @returns The client configuration
   */
  getConfig(): ClientConfig {
    return { ...this.config };
  }
  
  /**
   * Gets a collection by name, creating it if it doesn't exist
   * 
   * @param name The name of the collection
   * @returns The collection
   */
  collection(name: string): Collection {
    if (!name || typeof name !== 'string') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Collection name is required and must be a string'
      );
    }
    
    // Return the cached collection if it exists
    if (this.collections.has(name)) {
      return this.collections.get(name)!;
    }
    
    // Create a new collection
    const collection = new Collection(
      name,
      this.executeQuery.bind(this),
      this.executeCreate.bind(this),
      this.executeRead.bind(this),
      this.executeUpdate.bind(this),
      this.executeDelete.bind(this),
      () => this.createTransaction()
    );
    
    // Cache the collection
    this.collections.set(name, collection);
    
    return collection;
  }
  
  /**
   * Creates a new transaction
   * 
   * @returns A new Transaction instance
   */
  createTransaction(): Transaction {
    const transactionId = uuidv4();
    return new Transaction(transactionId, this.executeTransaction.bind(this));
  }
  
  /**
   * Executes a query
   * 
   * @param collection The collection to query
   * @param filters The query filters
   * @param projection The fields to include in the results
   * @param options Query options
   * @param aggregations Aggregation specifications
   * @returns The query results
   */
  private async executeQuery(
    collection: string,
    filters: QueryFilter[],
    projection?: string[],
    options?: QueryOptions,
    aggregations?: AggregationSpec[]
  ): Promise<QueryResult> {
    // In a real implementation, this would make a request to the server
    // For now, we'll just return a mock result
    return {
      results: [],
      metadata: {
        total: 0,
        limit: options?.limit || 10,
        offset: options?.offset || 0
      }
    };
  }
  
  /**
   * Creates a document
   * 
   * @param collection The collection to create the document in
   * @param document The document to create
   * @param options Options for creating the document
   * @returns The created document
   */
  private async executeCreate(
    collection: string,
    document: Partial<Document>,
    options?: CreateOptions
  ): Promise<Document> {
    // In a real implementation, this would make a request to the server
    // For now, we'll just return a mock result
    const now = Date.now();
    return {
      ...document,
      _id: document._id || uuidv4(),
      _collection: collection,
      _version: 1,
      _createdAt: now,
      _updatedAt: now
    } as Document;
  }
  
  /**
   * Reads a document
   * 
   * @param collection The collection to read from
   * @param id The ID of the document to read
   * @returns The document
   */
  private async executeRead(
    collection: string,
    id: string
  ): Promise<Document> {
    // In a real implementation, this would make a request to the server
    // For now, we'll just return a mock result
    const now = Date.now();
    return {
      _id: id,
      _collection: collection,
      _version: 1,
      _createdAt: now,
      _updatedAt: now
    } as Document;
  }
  
  /**
   * Updates a document
   * 
   * @param collection The collection to update
   * @param id The ID of the document to update
   * @param document The document fields to update
   * @param options Options for updating the document
   * @returns The updated document
   */
  private async executeUpdate(
    collection: string,
    id: string,
    document: Partial<Document>,
    options?: UpdateOptions
  ): Promise<Document> {
    // In a real implementation, this would make a request to the server
    // For now, we'll just return a mock result
    const now = Date.now();
    return {
      ...document,
      _id: id,
      _collection: collection,
      _version: 2,
      _createdAt: now - 1000, // Pretend it was created 1 second ago
      _updatedAt: now
    } as Document;
  }
  
  /**
   * Deletes a document
   * 
   * @param collection The collection to delete from
   * @param id The ID of the document to delete
   * @param options Options for deleting the document
   */
  private async executeDelete(
    collection: string,
    id: string,
    options?: DeleteOptions
  ): Promise<void> {
    // In a real implementation, this would make a request to the server
    // For now, we'll just return a mock result
    return Promise.resolve();
  }
  
  /**
   * Executes a transaction
   * 
   * @param operations The operations to execute
   * @returns The transaction result
   */
  private async executeTransaction(
    operations: TransactionOperation[]
  ): Promise<TransactionResult> {
    // In a real implementation, this would make a request to the server
    // For now, we'll just return a mock result
    return {
      id: uuidv4(),
      status: 'COMMITTED',
      operations,
      timestamp: Date.now()
    } as TransactionResult;
  }
}
