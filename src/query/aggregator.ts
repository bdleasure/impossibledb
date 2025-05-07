/**
 * Query Aggregator
 * 
 * This module is responsible for aggregating query results from multiple shards,
 * performing operations like grouping, counting, and calculating statistics.
 */

import { Document, QueryResult, ErrorCode } from '../types';
import { ImpossibleDBError } from '../utils/errorHandler';
import { createLogger } from '../utils/logger';

const logger = createLogger('QueryAggregator');

/**
 * Supported aggregation operations
 */
export enum AggregationOperation {
  COUNT = 'count',
  SUM = 'sum',
  AVG = 'avg',
  MIN = 'min',
  MAX = 'max',
  GROUP_BY = 'groupBy'
}

/**
 * Aggregation specification
 */
export interface AggregationSpec {
  operation: AggregationOperation;
  field?: string;
  groupBy?: string[];
}

/**
 * Result of an aggregation operation
 */
export interface AggregationResult {
  operation: AggregationOperation;
  field?: string;
  value: any;
  groups?: Record<string, any>;
}

/**
 * Performs aggregation operations on query results
 * 
 * @param results The query results to aggregate
 * @param specs The aggregation specifications
 * @returns The aggregation results
 */
export function aggregate(results: Document[], specs: AggregationSpec[]): AggregationResult[] {
  logger.debug('Performing aggregation', { 
    documentCount: results.length,
    aggregationCount: specs.length
  });
  
  return specs.map(spec => {
    try {
      switch (spec.operation) {
        case AggregationOperation.COUNT:
          return countAggregation(results, spec);
        case AggregationOperation.SUM:
          return sumAggregation(results, spec);
        case AggregationOperation.AVG:
          return avgAggregation(results, spec);
        case AggregationOperation.MIN:
          return minAggregation(results, spec);
        case AggregationOperation.MAX:
          return maxAggregation(results, spec);
        case AggregationOperation.GROUP_BY:
          return groupByAggregation(results, spec);
        default:
          throw new ImpossibleDBError(
            ErrorCode.INVALID_QUERY,
            `Unsupported aggregation operation: ${spec.operation}`
          );
      }
    } catch (error) {
      logger.warn('Error performing aggregation', { 
        error: error as Error,
        operation: spec.operation,
        field: spec.field
      });
      
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        `Error performing ${spec.operation} aggregation${spec.field ? ` on field ${spec.field}` : ''}`,
        { originalError: (error as Error).message }
      );
    }
  });
}

/**
 * Performs a count aggregation
 * 
 * @param results The documents to count
 * @param spec The aggregation specification
 * @returns The aggregation result
 */
function countAggregation(results: Document[], spec: AggregationSpec): AggregationResult {
  // If a field is specified, count non-null values for that field
  if (spec.field) {
    const count = results.filter(doc => getNestedValue(doc, spec.field!) !== undefined).length;
    return {
      operation: AggregationOperation.COUNT,
      field: spec.field,
      value: count
    };
  }
  
  // Otherwise, count all documents
  return {
    operation: AggregationOperation.COUNT,
    value: results.length
  };
}

/**
 * Performs a sum aggregation
 * 
 * @param results The documents to sum
 * @param spec The aggregation specification
 * @returns The aggregation result
 */
function sumAggregation(results: Document[], spec: AggregationSpec): AggregationResult {
  if (!spec.field) {
    throw new ImpossibleDBError(
      ErrorCode.INVALID_QUERY,
      'Field is required for sum aggregation'
    );
  }
  
  const sum = results.reduce((total, doc) => {
    const value = getNestedValue(doc, spec.field!);
    if (typeof value === 'number') {
      return total + value;
    }
    return total;
  }, 0);
  
  return {
    operation: AggregationOperation.SUM,
    field: spec.field,
    value: sum
  };
}

/**
 * Performs an average aggregation
 * 
 * @param results The documents to average
 * @param spec The aggregation specification
 * @returns The aggregation result
 */
function avgAggregation(results: Document[], spec: AggregationSpec): AggregationResult {
  if (!spec.field) {
    throw new ImpossibleDBError(
      ErrorCode.INVALID_QUERY,
      'Field is required for avg aggregation'
    );
  }
  
  let sum = 0;
  let count = 0;
  
  results.forEach(doc => {
    const value = getNestedValue(doc, spec.field!);
    if (typeof value === 'number') {
      sum += value;
      count++;
    }
  });
  
  const avg = count > 0 ? sum / count : 0;
  
  return {
    operation: AggregationOperation.AVG,
    field: spec.field,
    value: avg
  };
}

/**
 * Performs a min aggregation
 * 
 * @param results The documents to find the minimum value from
 * @param spec The aggregation specification
 * @returns The aggregation result
 */
function minAggregation(results: Document[], spec: AggregationSpec): AggregationResult {
  if (!spec.field) {
    throw new ImpossibleDBError(
      ErrorCode.INVALID_QUERY,
      'Field is required for min aggregation'
    );
  }
  
  let min: number | undefined;
  
  results.forEach(doc => {
    const value = getNestedValue(doc, spec.field!);
    if (typeof value === 'number') {
      if (min === undefined || value < min) {
        min = value;
      }
    }
  });
  
  return {
    operation: AggregationOperation.MIN,
    field: spec.field,
    value: min !== undefined ? min : null
  };
}

/**
 * Performs a max aggregation
 * 
 * @param results The documents to find the maximum value from
 * @param spec The aggregation specification
 * @returns The aggregation result
 */
function maxAggregation(results: Document[], spec: AggregationSpec): AggregationResult {
  if (!spec.field) {
    throw new ImpossibleDBError(
      ErrorCode.INVALID_QUERY,
      'Field is required for max aggregation'
    );
  }
  
  let max: number | undefined;
  
  results.forEach(doc => {
    const value = getNestedValue(doc, spec.field!);
    if (typeof value === 'number') {
      if (max === undefined || value > max) {
        max = value;
      }
    }
  });
  
  return {
    operation: AggregationOperation.MAX,
    field: spec.field,
    value: max !== undefined ? max : null
  };
}

/**
 * Performs a group by aggregation
 * 
 * @param results The documents to group
 * @param spec The aggregation specification
 * @returns The aggregation result
 */
function groupByAggregation(results: Document[], spec: AggregationSpec): AggregationResult {
  if (!spec.groupBy || spec.groupBy.length === 0) {
    throw new ImpossibleDBError(
      ErrorCode.INVALID_QUERY,
      'groupBy fields are required for groupBy aggregation'
    );
  }
  
  const groups: Record<string, any> = {};
  
  results.forEach(doc => {
    // Create a group key based on the groupBy fields
    const groupValues = spec.groupBy!.map(field => {
      const value = getNestedValue(doc, field);
      return value !== undefined ? String(value) : 'null';
    });
    
    const groupKey = groupValues.join(':');
    
    // Initialize the group if it doesn't exist
    if (!groups[groupKey]) {
      groups[groupKey] = {
        count: 0,
        documents: []
      };
      
      // Add the group by field values
      spec.groupBy!.forEach((field, index) => {
        const value = getNestedValue(doc, field);
        groups[groupKey][field] = value;
      });
    }
    
    // Add the document to the group
    groups[groupKey].count++;
    groups[groupKey].documents.push(doc);
  });
  
  return {
    operation: AggregationOperation.GROUP_BY,
    value: Object.keys(groups).length,
    groups
  };
}

/**
 * Applies aggregations to a query result
 * 
 * @param queryResult The query result to aggregate
 * @param specs The aggregation specifications
 * @returns The query result with aggregations
 */
export function applyAggregations(
  queryResult: QueryResult,
  specs: AggregationSpec[]
): QueryResult & { aggregations: AggregationResult[] } {
  if (!specs || specs.length === 0) {
    return {
      ...queryResult,
      aggregations: []
    };
  }
  
  logger.debug('Applying aggregations to query result', { 
    resultCount: queryResult.results.length,
    aggregationCount: specs.length
  });
  
  const aggregations = aggregate(queryResult.results, specs);
  
  return {
    ...queryResult,
    aggregations
  };
}

/**
 * Gets a nested value from an object using dot notation
 * 
 * @param obj The object to get the value from
 * @param path The path to the value using dot notation
 * @returns The value at the path, or undefined if not found
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((prev, curr) => {
    return prev && prev[curr] !== undefined ? prev[curr] : undefined;
  }, obj);
}
