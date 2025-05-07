/**
 * StorageObject.ts
 * 
 * Implements a single Durable Object that handles one data shard in ImpossibleDB.
 * Each StorageObject is responsible for:
 * - Basic CRUD operations on JSON documents
 * - Maintaining consistency within its own shard
 * - Simple query processing for its documents
 */

import { Document, QueryFilter, QueryOptions, QueryResult, ErrorCode } from '../types';
import { createLogger } from '../utils/logger';
import { ImpossibleDBError, handleError } from '../utils/errorHandler';
import { validateDocument, validateDocumentId, validateCollectionName, validateQueryFilters, validateQueryOptions } from '../utils/validation';
import { CONFIG } from '../config';

// Create a logger for this module
const logger = createLogger('StorageObject');
  
export class StorageObject implements DurableObject {
  private state: DurableObjectState;
  private collections: Map<string, Set<string>> = new Map();
  
  constructor(state: DurableObjectState) {
    this.state = state;
    this.state.blockConcurrencyWhile(async () => {
      await this.loadCollectionIndex();
    });
    
    logger.debug('StorageObject initialized');
  }
  
  /**
   * Loads the collection index into memory for faster lookups
   */
  private async loadCollectionIndex(): Promise<void> {
    try {
      const index = await this.state.storage.get<Record<string, string[]>>('__collections');
      if (index) {
        Object.entries(index).forEach(([collection, ids]) => {
          this.collections.set(collection, new Set(ids));
        });
        logger.debug('Collection index loaded', { collectionCount: this.collections.size });
      } else {
        logger.debug('No collection index found, initializing empty index');
      }
    } catch (error) {
      logger.error('Failed to load collection index', error as Error);
      throw new ImpossibleDBError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to initialize storage object'
      );
    }
  }
  
  /**
   * Saves the collection index back to persistent storage
   */
  private async saveCollectionIndex(): Promise<void> {
    try {
      const index: Record<string, string[]> = {};
      this.collections.forEach((ids, collection) => {
        index[collection] = Array.from(ids);
      });
      await this.state.storage.put('__collections', index);
      logger.debug('Collection index saved', { collectionCount: this.collections.size });
    } catch (error) {
      logger.error('Failed to save collection index', error as Error);
      throw new ImpossibleDBError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to update collection index'
      );
    }
  }
  
  /**
   * Handles incoming HTTP requests to the Durable Object
   */
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname.split('/').filter(Boolean);
      
      logger.debug('Received request', { method: request.method, path: url.pathname });
      
      // Basic routing
      if (request.method === 'GET' && path[0] === 'healthcheck') {
        return new Response(JSON.stringify({ 
          status: 'ok',
          collections: Array.from(this.collections.keys()),
          documentCount: Array.from(this.collections.values())
            .reduce((total, ids) => total + ids.size, 0)
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // CRUD operations
      if (path.length >= 2) {
        const collection = path[0];
        const id = path[1];
        
        // Validate collection name and document ID
        validateCollectionName(collection);
        validateDocumentId(id);
        
        if (request.method === 'GET') {
          return await this.handleGet(collection, id);
        } else if (request.method === 'PUT') {
          return await this.handlePut(collection, id, request);
        } else if (request.method === 'DELETE') {
          return await this.handleDelete(collection, id);
        }
      }
      
      // Query operation
      if (request.method === 'POST' && path[0] === 'query') {
        return await this.handleQuery(request);
      }
      
      logger.warn('Route not found', { method: request.method, path: url.pathname });
      return new Response(JSON.stringify({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Route not found'
        }
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return handleError(error);
    }
  }
  
  /**
   * Handles GET requests to retrieve a document
   */
  private async handleGet(collection: string, id: string): Promise<Response> {
    logger.debug('Handling GET request', { collection, id });
    
    const key = `${collection}:${id}`;
    const document = await this.state.storage.get<Document>(key);
    
    if (!document) {
      logger.debug('Document not found', { collection, id });
      throw new ImpossibleDBError(
        ErrorCode.DOCUMENT_NOT_FOUND,
        `Document not found: ${collection}/${id}`
      );
    }
    
    logger.debug('Document retrieved successfully', { collection, id });
    return new Response(JSON.stringify(document), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  /**
   * Handles PUT requests to create or update a document
   */
  private async handlePut(collection: string, id: string, request: Request): Promise<Response> {
    logger.debug('Handling PUT request', { collection, id });
    
    let body;
    try {
      body = await request.json();
    } catch (error) {
      logger.warn('Invalid JSON in request body', { error: (error as Error).message });
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Invalid JSON in request body'
      );
    }
    
    // Validate the document
    validateDocument(body);
    
    const key = `${collection}:${id}`;
    const now = Date.now();
    
    // Check if document already exists
    const existingDoc = await this.state.storage.get<Document>(key);
    const currentVersion = existingDoc?._version || 0;
    const isNew = !existingDoc;

    // Create/update the document
    // First create a clean document without reserved fields
    const cleanBody: Record<string, any> = {};
    for (const [key, value] of Object.entries(body as Record<string, any>)) {
      if (!['_id', '_collection', '_version', '_createdAt', '_updatedAt'].includes(key)) {
        cleanBody[key] = value;
      }
    }
    
    // Then create the document with metadata
    const document: Document = {
      ...cleanBody,
      _id: id,
      _collection: collection,
      _version: currentVersion + 1,
      _createdAt: existingDoc?._createdAt || now,
      _updatedAt: now
    };
    
    try {
      // Save the document
      await this.state.storage.put(key, document);
      
      // Update the collection index
      if (!this.collections.has(collection)) {
        this.collections.set(collection, new Set());
      }
      this.collections.get(collection)!.add(id);
      await this.saveCollectionIndex();
      
      logger.debug('Document saved successfully', { 
        collection, 
        id, 
        isNew, 
        version: document._version 
      });
      
      return new Response(JSON.stringify(document), {
        headers: { 'Content-Type': 'application/json' },
        status: isNew ? 201 : 200
      });
    } catch (error) {
      logger.error('Failed to save document', error as Error, { collection, id });
      throw new ImpossibleDBError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to save document',
        { originalError: (error as Error).message }
      );
    }
  }
  
  /**
   * Handles DELETE requests to remove a document
   */
  private async handleDelete(collection: string, id: string): Promise<Response> {
    logger.debug('Handling DELETE request', { collection, id });
    
    const key = `${collection}:${id}`;
    const document = await this.state.storage.get<Document>(key);
    
    if (!document) {
      logger.debug('Document not found for deletion', { collection, id });
      throw new ImpossibleDBError(
        ErrorCode.DOCUMENT_NOT_FOUND,
        `Document not found: ${collection}/${id}`
      );
    }
    
    try {
      // Delete the document
      await this.state.storage.delete(key);
      
      // Update the collection index
      const collectionSet = this.collections.get(collection);
      if (collectionSet) {
        collectionSet.delete(id);
        if (collectionSet.size === 0) {
          this.collections.delete(collection);
        }
        await this.saveCollectionIndex();
      }
      
      logger.debug('Document deleted successfully', { collection, id });
      return new Response(JSON.stringify({ 
        deleted: true,
        id,
        collection
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      logger.error('Failed to delete document', error as Error, { collection, id });
      throw new ImpossibleDBError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to delete document',
        { originalError: (error as Error).message }
      );
    }
  }
  
  /**
   * Handles POST requests for querying documents
   */
  private async handleQuery(request: Request): Promise<Response> {
    logger.debug('Handling query request');
    
    let requestBody;
    try {
      requestBody = await request.json() as {
        collection: string;
        filters?: QueryFilter[];
        options?: QueryOptions;
      };
    } catch (error) {
      logger.warn('Invalid JSON in query request body', { error: (error as Error).message });
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Invalid JSON in request body'
      );
    }
    
    const { collection, filters, options } = requestBody;
    
    // Validate inputs
    if (!collection) {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Collection is required'
      );
    }
    
    validateCollectionName(collection);
    
    if (filters) {
      validateQueryFilters(filters);
    }
    
    if (options) {
      validateQueryOptions(options);
    }
    
    // Apply default options
    const queryOptions: QueryOptions = {
      limit: options?.limit || CONFIG.MAX_QUERY_RESULTS,
      offset: options?.offset || 0,
      sort: options?.sort
    };
    
    logger.debug('Processing query', { 
      collection, 
      filterCount: filters?.length || 0,
      options: queryOptions
    });
    
    const collectionSet = this.collections.get(collection);
    if (!collectionSet || collectionSet.size === 0) {
      logger.debug('Collection empty or not found', { collection });
      return new Response(JSON.stringify({ 
        results: [],
        metadata: {
          total: 0,
          limit: queryOptions.limit,
          offset: queryOptions.offset || 0
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    try {
      // Fetch all documents in the collection
      const keys = Array.from(collectionSet).map(id => `${collection}:${id}`);
      const documents = await this.state.storage.get<Document>(keys);
      
      // Filter the documents based on the provided filters
      let results = Object.values(documents).filter(doc => doc !== null);
      const totalBeforeFilters = results.length;
      
      if (filters && filters.length > 0) {
        results = this.applyFilters(results, filters);
      }
      
      const totalAfterFilters = results.length;
      
      // Apply sorting if provided
      if (queryOptions.sort) {
        results = this.applySorting(results, queryOptions.sort);
      }
      
      // Calculate total before pagination
      const total = results.length;
      
      // Apply offset and limit
      if (queryOptions.offset) {
        results = results.slice(queryOptions.offset);
      }
      
      if (queryOptions.limit) {
        results = results.slice(0, queryOptions.limit);
      }
      
      logger.debug('Query completed', { 
        collection,
        totalDocuments: totalBeforeFilters,
        matchedFilters: totalAfterFilters,
        returnedResults: results.length
      });
      
      // Return results with metadata
      const queryResult: QueryResult = {
        results,
        metadata: {
          total,
          limit: queryOptions.limit || CONFIG.MAX_QUERY_RESULTS,
          offset: queryOptions.offset || 0
        }
      };
      
      return new Response(JSON.stringify(queryResult), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      logger.error('Error executing query', error as Error, { collection });
      throw new ImpossibleDBError(
        ErrorCode.INTERNAL_ERROR,
        'Error executing query',
        { originalError: (error as Error).message }
      );
    }
  }
  
    /**
     * Applies filters to a list of documents
     */
    private applyFilters(documents: Document[], filters: QueryFilter[]): Document[] {
      return documents.filter(doc => {
        return filters.every(filter => {
          const { field, operator, value } = filter;
          const fieldValue = this.getNestedValue(doc, field);
          
          switch (operator) {
            case '=': return fieldValue === value;
            case '!=': return fieldValue !== value;
            case '>': return fieldValue > value;
            case '>=': return fieldValue >= value;
            case '<': return fieldValue < value;
            case '<=': return fieldValue <= value;
            default: return true;
          }
        });
      });
    }
  
    /**
     * Gets a nested value from an object using dot notation
     */
    private getNestedValue(obj: any, path: string): any {
      return path.split('.').reduce((prev, curr) => {
        return prev && prev[curr] !== undefined ? prev[curr] : undefined;
      }, obj);
    }
  
    /**
     * Applies sorting to a list of documents
     */
    private applySorting(documents: Document[], sort: { field: string; direction: 'asc' | 'desc' }[]): Document[] {
      return [...documents].sort((a, b) => {
        for (const { field, direction } of sort) {
          const aValue = this.getNestedValue(a, field);
          const bValue = this.getNestedValue(b, field);
          
          if (aValue === bValue) continue;
          
          const comparison = aValue < bValue ? -1 : 1;
          return direction === 'asc' ? comparison : -comparison;
        }
        
        return 0;
      });
    }
  }
