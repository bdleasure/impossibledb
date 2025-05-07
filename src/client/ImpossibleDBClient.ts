/**
 * ImpossibleDB Client SDK
 * 
 * A simple client library for interacting with ImpossibleDB from web applications.
 * This provides a clean, intuitive API for working with the database.
 */

export interface Document {
    _id?: string;
    _collection?: string;
    _version?: number;
    _createdAt?: number;
    _updatedAt?: number;
    [key: string]: any;
  }
  
  export interface QueryFilter {
    field: string;
    operator: '=' | '!=' | '>' | '>=' | '<' | '<=';
    value: any;
  }
  
  export interface QueryOptions {
    limit?: number;
    offset?: number;
    sort?: { field: string; direction: 'asc' | 'desc' }[];
  }
  
  export class QueryBuilder {
    private filters: QueryFilter[] = [];
    private options: QueryOptions = {};
    
    constructor(
      private client: ImpossibleDBClient,
      private collection: string
    ) {}
    
    /**
     * Adds a filter to the query
     */
    filter(field: string, operator: '=' | '!=' | '>' | '>=' | '<' | '<=', value: any): QueryBuilder {
      this.filters.push({ field, operator, value });
      return this;
    }
    
    /**
     * Sets the maximum number of results to return
     */
    limit(limit: number): QueryBuilder {
      this.options.limit = limit;
      return this;
    }
    
    /**
     * Sets the number of results to skip
     */
    offset(offset: number): QueryBuilder {
      this.options.offset = offset;
      return this;
    }
    
    /**
     * Adds a sort option to the query
     */
    sort(field: string, direction: 'asc' | 'desc' = 'asc'): QueryBuilder {
      if (!this.options.sort) {
        this.options.sort = [];
      }
      this.options.sort.push({ field, direction });
      return this;
    }
    
    /**
     * Executes the query and returns the results
     */
    async execute(): Promise<Document[]> {
      return this.client.executeQuery(this.collection, this.filters, this.options);
    }
  }
  
  export class Collection {
    constructor(
      private client: ImpossibleDBClient,
      private name: string
    ) {}
    
    /**
     * Retrieves a document by ID
     */
    async get(id: string): Promise<Document | null> {
      return this.client.getDocument(this.name, id);
    }
    
    /**
     * Creates or updates a document
     */
    async put(id: string, data: Document): Promise<Document> {
      return this.client.putDocument(this.name, id, data);
    }
    
    /**
     * Deletes a document by ID
     */
    async delete(id: string): Promise<boolean> {
      return this.client.deleteDocument(this.name, id);
    }
    
    /**
     * Creates a query builder for this collection
     */
    query(): QueryBuilder {
      return new QueryBuilder(this.client, this.name);
    }
  }
  
  export class ImpossibleDBClient {
    private baseUrl: string;
    
    /**
     * Creates a new ImpossibleDB client
     * 
     * @param baseUrl The base URL of the ImpossibleDB API
     */
    constructor(baseUrl: string = typeof self !== 'undefined' && 'location' in self ? (self as any).location?.origin : 'https://impossibledb-production.bdleasure.workers.dev') {
      this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    }
    
    /**
     * Gets a reference to a collection
     */
    collection(name: string): Collection {
      return new Collection(this, name);
    }
    
    /**
     * Retrieves a document by ID
     */
    async getDocument(collection: string, id: string): Promise<Document | null> {
      const url = `${this.baseUrl}/api/data/${collection}/${id}`;
      const response = await fetch(url);
      
      if (response.status === 404) {
        return null;
      }
      
      if (!response.ok) {
        throw new Error(`Failed to get document: ${response.statusText}`);
      }
      
      return await response.json();
    }
    
    /**
     * Creates or updates a document
     */
    async putDocument(collection: string, id: string, data: Document): Promise<Document> {
      const url = `${this.baseUrl}/api/data/${collection}/${id}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to put document: ${response.statusText}`);
      }
      
      return await response.json();
    }
    
    /**
     * Deletes a document by ID
     */
    async deleteDocument(collection: string, id: string): Promise<boolean> {
      const url = `${this.baseUrl}/api/data/${collection}/${id}`;
      const response = await fetch(url, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete document: ${response.statusText}`);
      }
      
      const result = await response.json() as Record<string, any>;
      return result.deleted === true;
    }
    
    /**
     * Executes a query against a collection
     */
    async executeQuery(
      collection: string,
      filters: QueryFilter[],
      options: QueryOptions
    ): Promise<Document[]> {
      const url = `${this.baseUrl}/api/data/${collection}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          collection,
          filters,
          options
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to execute query: ${response.statusText}`);
      }
      
      const result = await response.json() as Record<string, any>;
      return result.results || [];
    }
  }
  
  // Default export to make it easy to use
  export default ImpossibleDBClient;
