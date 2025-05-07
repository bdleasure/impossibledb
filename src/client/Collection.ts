/**
 * Collection
 * 
 * This module provides a high-level API for working with collections in the database.
 * It allows for creating, reading, updating, and deleting documents, as well as
 * querying the collection using the QueryBuilder.
 */

import { Document, QueryFilter, QueryOptions, QueryResult, ErrorCode } from '../types';
import { ImpossibleDBError } from '../utils/errorHandler';
import { QueryBuilder } from './QueryBuilder';
import { AggregationSpec } from '../query/aggregator';
import { Transaction } from './Transaction';

/**
 * Options for creating a document
 */
export interface CreateOptions {
  // If true and a document with the same ID already exists, throw an error
  failIfExists?: boolean;
}

/**
 * Options for updating a document
 */
export interface UpdateOptions {
  // If true and the document doesn't exist, create it
  upsert?: boolean;
  
  // If provided, only update if the document's version matches
  expectedVersion?: number;
}

/**
 * Options for deleting a document
 */
export interface DeleteOptions {
  // If true and the document doesn't exist, throw an error
  failIfNotExists?: boolean;
}

/**
 * Collection class for working with a collection of documents
 */
export class Collection {
  private readonly name: string;
  private readonly executeQuery: (
    collection: string,
    filters: QueryFilter[],
    projection?: string[],
    options?: QueryOptions,
    aggregations?: AggregationSpec[]
  ) => Promise<QueryResult>;
  private readonly executeCreate: (
    collection: string,
    document: Partial<Document>,
    options?: CreateOptions
  ) => Promise<Document>;
  private readonly executeRead: (
    collection: string,
    id: string
  ) => Promise<Document>;
  private readonly executeUpdate: (
    collection: string,
    id: string,
    document: Partial<Document>,
    options?: UpdateOptions
  ) => Promise<Document>;
  private readonly executeDelete: (
    collection: string,
    id: string,
    options?: DeleteOptions
  ) => Promise<void>;
  private readonly createTransaction: () => Transaction;
  
  /**
   * Creates a new Collection instance
   * 
   * @param name The name of the collection
   * @param executeQuery Function to execute queries
   * @param executeCreate Function to create documents
   * @param executeRead Function to read documents
   * @param executeUpdate Function to update documents
   * @param executeDelete Function to delete documents
   * @param createTransaction Function to create a transaction
   */
  constructor(
    name: string,
    executeQuery: (
      collection: string,
      filters: QueryFilter[],
      projection?: string[],
      options?: QueryOptions,
      aggregations?: AggregationSpec[]
    ) => Promise<QueryResult>,
    executeCreate: (
      collection: string,
      document: Partial<Document>,
      options?: CreateOptions
    ) => Promise<Document>,
    executeRead: (
      collection: string,
      id: string
    ) => Promise<Document>,
    executeUpdate: (
      collection: string,
      id: string,
      document: Partial<Document>,
      options?: UpdateOptions
    ) => Promise<Document>,
    executeDelete: (
      collection: string,
      id: string,
      options?: DeleteOptions
    ) => Promise<void>,
    createTransaction: () => Transaction
  ) {
    if (!name || typeof name !== 'string') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Collection name is required and must be a string'
      );
    }
    
    this.name = name;
    this.executeQuery = executeQuery;
    this.executeCreate = executeCreate;
    this.executeRead = executeRead;
    this.executeUpdate = executeUpdate;
    this.executeDelete = executeDelete;
    this.createTransaction = createTransaction;
  }
  
  /**
   * Gets the name of the collection
   * 
   * @returns The collection name
   */
  getName(): string {
    return this.name;
  }
  
  /**
   * Creates a new query builder for this collection
   * 
   * @returns A new QueryBuilder instance
   */
  query(): QueryBuilder {
    return new QueryBuilder(this.name);
  }
  
  /**
   * Executes a query on this collection
   * 
   * @param queryBuilder The query builder to execute
   * @returns The query results
   */
  async find(queryBuilder: QueryBuilder): Promise<QueryResult> {
    if (queryBuilder.getCollection() !== this.name) {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        `Query builder is for collection "${queryBuilder.getCollection()}", but this collection is "${this.name}"`
      );
    }
    
    return queryBuilder.execute(this.executeQuery);
  }
  
  /**
   * Finds a document by ID
   * 
   * @param id The ID of the document to find
   * @returns The document, or throws if not found
   */
  async findById(id: string): Promise<Document> {
    if (!id || typeof id !== 'string') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Document ID is required and must be a string'
      );
    }
    
    return this.executeRead(this.name, id);
  }
  
  /**
   * Finds a document by ID, or returns null if not found
   * 
   * @param id The ID of the document to find
   * @returns The document, or null if not found
   */
  async findByIdOrNull(id: string): Promise<Document | null> {
    try {
      return await this.findById(id);
    } catch (error) {
      if (error instanceof ImpossibleDBError && error.code === ErrorCode.DOCUMENT_NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }
  
  /**
   * Creates a new document
   * 
   * @param document The document to create
   * @param options Options for creating the document
   * @returns The created document
   */
  async create(document: Partial<Document>, options?: CreateOptions): Promise<Document> {
    if (!document || typeof document !== 'object') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_DOCUMENT,
        'Document must be an object'
      );
    }
    
    return this.executeCreate(this.name, document, options);
  }
  
  /**
   * Updates a document by ID
   * 
   * @param id The ID of the document to update
   * @param document The document fields to update
   * @param options Options for updating the document
   * @returns The updated document
   */
  async update(id: string, document: Partial<Document>, options?: UpdateOptions): Promise<Document> {
    if (!id || typeof id !== 'string') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Document ID is required and must be a string'
      );
    }
    
    if (!document || typeof document !== 'object') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_DOCUMENT,
        'Document must be an object'
      );
    }
    
    return this.executeUpdate(this.name, id, document, options);
  }
  
  /**
   * Deletes a document by ID
   * 
   * @param id The ID of the document to delete
   * @param options Options for deleting the document
   */
  async delete(id: string, options?: DeleteOptions): Promise<void> {
    if (!id || typeof id !== 'string') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Document ID is required and must be a string'
      );
    }
    
    return this.executeDelete(this.name, id, options);
  }
  
  /**
   * Starts a new transaction
   * 
   * @returns A new Transaction instance
   */
  transaction(): Transaction {
    return this.createTransaction();
  }
}
