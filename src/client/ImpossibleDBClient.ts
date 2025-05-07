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
import { HttpClient, RequestOptions } from './HttpClient';

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
  private readonly httpClient: HttpClient;
  
  /**
   * Creates a new ImpossibleDBClient instance
   * 
   * @param config Client configuration
   */
  constructor(config: Partial<ClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.httpClient = new HttpClient(this.config);
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
    const existingCollection = this.collections.get(name);
    if (existingCollection) {
      return existingCollection;
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
    const requestOptions: RequestOptions = {
      timeout: this.config.timeout || 30000
    };
    
    const queryData = {
      filters,
      projection,
      options,
      aggregations
    };
    
    return this.httpClient.post<QueryResult>(
      `collections/${collection}/query`,
      queryData,
      requestOptions
    );
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
    const requestOptions: RequestOptions = {
      timeout: this.config.timeout || 30000
    };
    
    // Generate an ID if one wasn't provided
    if (!document._id) {
      document._id = uuidv4();
    }
    
    return this.httpClient.post<Document>(
      `collections/${collection}/documents`,
      document,
      requestOptions
    );
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
    const requestOptions: RequestOptions = {
      timeout: this.config.timeout || 30000
    };
    
    return this.httpClient.get<Document>(
      `collections/${collection}/documents/${id}`,
      requestOptions
    );
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
    const requestOptions: RequestOptions = {
      timeout: this.config.timeout || 30000
    };
    
    return this.httpClient.put<Document>(
      `collections/${collection}/documents/${id}`,
      document,
      requestOptions
    );
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
    const requestOptions: RequestOptions = {
      timeout: this.config.timeout || 30000
    };
    
    return this.httpClient.delete<void>(
      `collections/${collection}/documents/${id}`,
      requestOptions
    );
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
    const requestOptions: RequestOptions = {
      timeout: (this.config.timeout || 30000) * 2 // Transactions may take longer
    };
    
    return this.httpClient.post<TransactionResult>(
      'transactions',
      { operations },
      requestOptions
    );
  }
}
