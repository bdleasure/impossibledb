/**
 * Query Builder
 * 
 * This module provides a fluent API for building queries in the client SDK.
 * It allows for chaining methods to create complex queries with filters,
 * sorting, pagination, and projections.
 */

import { QueryFilter, QueryOptions, QueryResult, ErrorCode } from '../types';
import { ImpossibleDBError } from '../utils/errorHandler';
import { AggregationOperation, AggregationSpec } from '../query/aggregator';

/**
 * QueryBuilder class for building database queries
 */
export class QueryBuilder {
  private readonly collection: string;
  private filters: QueryFilter[] = [];
  private projectionFields: string[] | undefined;
  private queryOptions: QueryOptions = {};
  private aggregations: AggregationSpec[] = [];
  
  /**
   * Creates a new QueryBuilder instance
   * 
   * @param collection The collection to query
   */
  constructor(collection: string) {
    if (!collection || typeof collection !== 'string') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        'Collection name is required and must be a string'
      );
    }
    
    this.collection = collection;
  }
  
  /**
   * Adds a filter to the query
   * 
   * @param field The field to filter on
   * @param operator The operator to use
   * @param value The value to compare against
   * @returns The QueryBuilder instance for chaining
   */
  where(field: string, operator: '=' | '!=' | '>' | '>=' | '<' | '<=', value: any): QueryBuilder {
    this.filters.push({ field, operator, value });
    return this;
  }
  
  /**
   * Adds an equality filter to the query
   * 
   * @param field The field to filter on
   * @param value The value to compare against
   * @returns The QueryBuilder instance for chaining
   */
  equals(field: string, value: any): QueryBuilder {
    return this.where(field, '=', value);
  }
  
  /**
   * Adds a not-equals filter to the query
   * 
   * @param field The field to filter on
   * @param value The value to compare against
   * @returns The QueryBuilder instance for chaining
   */
  notEquals(field: string, value: any): QueryBuilder {
    return this.where(field, '!=', value);
  }
  
  /**
   * Adds a greater-than filter to the query
   * 
   * @param field The field to filter on
   * @param value The value to compare against
   * @returns The QueryBuilder instance for chaining
   */
  greaterThan(field: string, value: number | Date): QueryBuilder {
    return this.where(field, '>', value);
  }
  
  /**
   * Adds a greater-than-or-equal filter to the query
   * 
   * @param field The field to filter on
   * @param value The value to compare against
   * @returns The QueryBuilder instance for chaining
   */
  greaterThanOrEqual(field: string, value: number | Date): QueryBuilder {
    return this.where(field, '>=', value);
  }
  
  /**
   * Adds a less-than filter to the query
   * 
   * @param field The field to filter on
   * @param value The value to compare against
   * @returns The QueryBuilder instance for chaining
   */
  lessThan(field: string, value: number | Date): QueryBuilder {
    return this.where(field, '<', value);
  }
  
  /**
   * Adds a less-than-or-equal filter to the query
   * 
   * @param field The field to filter on
   * @param value The value to compare against
   * @returns The QueryBuilder instance for chaining
   */
  lessThanOrEqual(field: string, value: number | Date): QueryBuilder {
    return this.where(field, '<=', value);
  }
  
  /**
   * Sets the fields to include in the results
   * 
   * @param fields The fields to include
   * @returns The QueryBuilder instance for chaining
   */
  select(...fields: string[]): QueryBuilder {
    this.projectionFields = fields;
    return this;
  }
  
  /**
   * Sets the maximum number of results to return
   * 
   * @param limit The maximum number of results
   * @returns The QueryBuilder instance for chaining
   */
  limit(limit: number): QueryBuilder {
    if (typeof limit !== 'number' || limit < 0) {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        'Limit must be a non-negative number'
      );
    }
    
    this.queryOptions.limit = limit;
    return this;
  }
  
  /**
   * Sets the number of results to skip
   * 
   * @param offset The number of results to skip
   * @returns The QueryBuilder instance for chaining
   */
  offset(offset: number): QueryBuilder {
    if (typeof offset !== 'number' || offset < 0) {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        'Offset must be a non-negative number'
      );
    }
    
    this.queryOptions.offset = offset;
    return this;
  }
  
  /**
   * Adds a sort specification to the query
   * 
   * @param field The field to sort by
   * @param direction The sort direction ('asc' or 'desc')
   * @returns The QueryBuilder instance for chaining
   */
  sort(field: string, direction: 'asc' | 'desc' = 'asc'): QueryBuilder {
    if (!field || typeof field !== 'string') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        'Sort field must be a non-empty string'
      );
    }
    
    if (!this.queryOptions.sort) {
      this.queryOptions.sort = [];
    }
    
    this.queryOptions.sort.push({ field, direction });
    return this;
  }
  
  /**
   * Adds an ascending sort specification to the query
   * 
   * @param field The field to sort by
   * @returns The QueryBuilder instance for chaining
   */
  sortAsc(field: string): QueryBuilder {
    return this.sort(field, 'asc');
  }
  
  /**
   * Adds a descending sort specification to the query
   * 
   * @param field The field to sort by
   * @returns The QueryBuilder instance for chaining
   */
  sortDesc(field: string): QueryBuilder {
    return this.sort(field, 'desc');
  }
  
  /**
   * Adds a count aggregation to the query
   * 
   * @param field Optional field to count (if not provided, counts all documents)
   * @returns The QueryBuilder instance for chaining
   */
  count(field?: string): QueryBuilder {
    this.aggregations.push({
      operation: AggregationOperation.COUNT,
      field
    });
    
    return this;
  }
  
  /**
   * Adds a sum aggregation to the query
   * 
   * @param field The field to sum
   * @returns The QueryBuilder instance for chaining
   */
  sum(field: string): QueryBuilder {
    if (!field || typeof field !== 'string') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        'Sum field must be a non-empty string'
      );
    }
    
    this.aggregations.push({
      operation: AggregationOperation.SUM,
      field
    });
    
    return this;
  }
  
  /**
   * Adds an average aggregation to the query
   * 
   * @param field The field to average
   * @returns The QueryBuilder instance for chaining
   */
  avg(field: string): QueryBuilder {
    if (!field || typeof field !== 'string') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        'Average field must be a non-empty string'
      );
    }
    
    this.aggregations.push({
      operation: AggregationOperation.AVG,
      field
    });
    
    return this;
  }
  
  /**
   * Adds a min aggregation to the query
   * 
   * @param field The field to find the minimum value of
   * @returns The QueryBuilder instance for chaining
   */
  min(field: string): QueryBuilder {
    if (!field || typeof field !== 'string') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        'Min field must be a non-empty string'
      );
    }
    
    this.aggregations.push({
      operation: AggregationOperation.MIN,
      field
    });
    
    return this;
  }
  
  /**
   * Adds a max aggregation to the query
   * 
   * @param field The field to find the maximum value of
   * @returns The QueryBuilder instance for chaining
   */
  max(field: string): QueryBuilder {
    if (!field || typeof field !== 'string') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        'Max field must be a non-empty string'
      );
    }
    
    this.aggregations.push({
      operation: AggregationOperation.MAX,
      field
    });
    
    return this;
  }
  
  /**
   * Adds a group by aggregation to the query
   * 
   * @param fields The fields to group by
   * @returns The QueryBuilder instance for chaining
   */
  groupBy(...fields: string[]): QueryBuilder {
    if (!fields || fields.length === 0) {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        'Group by fields are required'
      );
    }
    
    this.aggregations.push({
      operation: AggregationOperation.GROUP_BY,
      groupBy: fields
    });
    
    return this;
  }
  
  /**
   * Gets the collection name
   * 
   * @returns The collection name
   */
  getCollection(): string {
    return this.collection;
  }
  
  /**
   * Gets the query filters
   * 
   * @returns The query filters
   */
  getFilters(): QueryFilter[] {
    return [...this.filters];
  }
  
  /**
   * Gets the projection fields
   * 
   * @returns The projection fields, or undefined if no projection
   */
  getProjection(): string[] | undefined {
    return this.projectionFields ? [...this.projectionFields] : undefined;
  }
  
  /**
   * Gets the query options
   * 
   * @returns The query options
   */
  getOptions(): QueryOptions {
    return { ...this.queryOptions };
  }
  
  /**
   * Gets the aggregation specifications
   * 
   * @returns The aggregation specifications
   */
  getAggregations(): AggregationSpec[] {
    return [...this.aggregations];
  }
  
  /**
   * Builds the query parameters for execution
   * 
   * @returns The query parameters
   */
  build(): {
    collection: string;
    filters: QueryFilter[];
    projection?: string[];
    options: QueryOptions;
    aggregations: AggregationSpec[];
  } {
    return {
      collection: this.collection,
      filters: this.getFilters(),
      projection: this.getProjection(),
      options: this.getOptions(),
      aggregations: this.getAggregations()
    };
  }
  
  /**
   * Executes the query using the provided executor function
   * 
   * @param executor Function to execute the query
   * @returns The query results
   */
  async execute<T extends QueryResult>(
    executor: (
      collection: string,
      filters: QueryFilter[],
      projection?: string[],
      options?: QueryOptions,
      aggregations?: AggregationSpec[]
    ) => Promise<T>
  ): Promise<T> {
    const { collection, filters, projection, options, aggregations } = this.build();
    return executor(collection, filters, projection, options, aggregations);
  }
}
