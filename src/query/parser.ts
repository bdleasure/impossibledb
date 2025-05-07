/**
 * Query Parser
 * 
 * This module is responsible for parsing query expressions into a structured format
 * that can be processed by the query planner and executor. It converts the query
 * filters, projections, and options into a standardized internal representation.
 */

import { QueryFilter, QueryOptions, ErrorCode } from '../types';
import { ImpossibleDBError } from '../utils/errorHandler';
import { createLogger } from '../utils/logger';

const logger = createLogger('QueryParser');

/**
 * Supported query operators
 * These match the operators defined in the QueryFilter interface
 */
export type QueryOperator = '=' | '!=' | '>' | '>=' | '<' | '<=';

/**
 * Extended query operators for future use
 * These will be implemented in a future version
 */
export enum ExtendedQueryOperator {
  IN = 'in',
  NOT_IN = 'not_in',
  CONTAINS = 'contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with'
}

/**
 * Logical operators for combining filters
 */
export enum LogicalOperator {
  AND = 'AND',
  OR = 'OR'
}

/**
 * Represents a parsed query condition
 */
export interface QueryCondition {
  field: string;
  operator: QueryOperator;
  value: any;
}

/**
 * Represents a parsed query expression
 */
export interface QueryExpression {
  conditions: QueryCondition[];
  logicalOperator: LogicalOperator;
  subExpressions?: QueryExpression[];
}

/**
 * Represents a parsed query with all components
 */
export interface ParsedQuery {
  collection: string;
  expression: QueryExpression;
  projection?: string[];
  options: QueryOptions;
}

/**
 * Parses query filters into a structured query expression
 * 
 * @param filters Array of query filters
 * @returns A structured query expression
 */
export function parseFilters(filters: QueryFilter[]): QueryExpression {
  logger.debug('Parsing query filters', { filterCount: filters.length });
  
  if (!filters || filters.length === 0) {
    return {
      conditions: [],
      logicalOperator: LogicalOperator.AND
    };
  }
  
  const conditions: QueryCondition[] = filters.map(filter => {
    // Validate the operator
    const validOperators: QueryOperator[] = ['=', '!=', '>', '>=', '<', '<='];
    if (!validOperators.includes(filter.operator)) {
      logger.warn('Invalid query operator', { operator: filter.operator });
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        `Invalid query operator: ${filter.operator}`
      );
    }
    
    return {
      field: filter.field,
      operator: filter.operator as QueryOperator,
      value: filter.value
    };
  });
  
  return {
    conditions,
    logicalOperator: LogicalOperator.AND
  };
}

/**
 * Parses a complete query into a structured format
 * 
 * @param collection Collection name
 * @param filters Query filters
 * @param projection Fields to include in the results
 * @param options Query options (sorting, pagination)
 * @returns A parsed query object
 */
export function parseQuery(
  collection: string,
  filters: QueryFilter[] = [],
  projection?: string[],
  options: QueryOptions = {}
): ParsedQuery {
  logger.debug('Parsing query', { 
    collection, 
    filterCount: filters.length,
    hasProjection: !!projection,
    options
  });
  
  // Validate collection name
  if (!collection || typeof collection !== 'string') {
    logger.warn('Invalid collection name', { collection });
    throw new ImpossibleDBError(
      ErrorCode.INVALID_QUERY,
      'Collection name is required and must be a string'
    );
  }
  
  // Parse filters into expression
  const expression = parseFilters(filters);
  
  // Validate projection if provided
  if (projection && !Array.isArray(projection)) {
    logger.warn('Invalid projection', { projection });
    throw new ImpossibleDBError(
      ErrorCode.INVALID_QUERY,
      'Projection must be an array of field names'
    );
  }
  
  // Validate options
  validateQueryOptions(options);
  
  return {
    collection,
    expression,
    projection,
    options
  };
}

/**
 * Validates query options
 * 
 * @param options Query options to validate
 * @throws ImpossibleDBError if options are invalid
 */
function validateQueryOptions(options: QueryOptions): void {
  // Validate limit
  if (options.limit !== undefined) {
    if (typeof options.limit !== 'number' || options.limit < 0) {
      logger.warn('Invalid limit option', { limit: options.limit });
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        'Limit must be a non-negative number'
      );
    }
  }
  
  // Validate offset
  if (options.offset !== undefined) {
    if (typeof options.offset !== 'number' || options.offset < 0) {
      logger.warn('Invalid offset option', { offset: options.offset });
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        'Offset must be a non-negative number'
      );
    }
  }
  
  // Validate sort
  if (options.sort !== undefined) {
    if (!Array.isArray(options.sort)) {
      logger.warn('Invalid sort option', { sort: options.sort });
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        'Sort must be an array of sort specifications'
      );
    }
    
    for (const sortSpec of options.sort) {
      if (!sortSpec.field || typeof sortSpec.field !== 'string') {
        logger.warn('Invalid sort field', { sortSpec });
        throw new ImpossibleDBError(
          ErrorCode.INVALID_QUERY,
          'Sort field must be a non-empty string'
        );
      }
      
      if (sortSpec.direction !== 'asc' && sortSpec.direction !== 'desc') {
        logger.warn('Invalid sort direction', { direction: sortSpec.direction });
        throw new ImpossibleDBError(
          ErrorCode.INVALID_QUERY,
          'Sort direction must be "asc" or "desc"'
        );
      }
    }
  }
}

/**
 * Converts a parsed query expression back to filter array
 * (Useful for sending queries to storage objects)
 * 
 * @param expression Query expression to convert
 * @returns Array of query filters
 */
export function expressionToFilters(expression: QueryExpression): QueryFilter[] {
  return expression.conditions.map(condition => ({
    field: condition.field,
    operator: condition.operator,
    value: condition.value
  }));
}

/**
 * Stringifies a query expression for debugging or logging
 * 
 * @param expression Query expression to stringify
 * @returns String representation of the expression
 */
export function stringifyExpression(expression: QueryExpression): string {
  if (expression.conditions.length === 0) {
    return '(empty)';
  }
  
  const conditionStrings = expression.conditions.map(condition => 
    `${condition.field} ${condition.operator} ${JSON.stringify(condition.value)}`
  );
  
  return conditionStrings.join(` ${expression.logicalOperator} `);
}
