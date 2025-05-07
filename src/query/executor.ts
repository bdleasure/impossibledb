/**
 * Query Executor
 * 
 * This module is responsible for executing query plans by sending requests to the
 * appropriate shards and processing the results.
 */

import { QueryPlan, ShardTarget } from './planner';
import { Document, QueryResult, ErrorCode } from '../types';
import { ImpossibleDBError } from '../utils/errorHandler';
import { createLogger } from '../utils/logger';
import { CONFIG } from '../config';

// Type declarations for setTimeout and clearTimeout in Cloudflare Workers environment
declare function setTimeout(callback: () => void, ms: number): number;
declare function clearTimeout(id: number): void;

const logger = createLogger('QueryExecutor');

/**
 * Result from querying a single shard
 */
interface ShardQueryResult {
  shardId: string;
  results: Document[];
  total: number;
  error?: Error;
}

/**
 * Options for executing a query
 */
export interface ExecutionOptions {
  // Timeout for the entire query execution (in milliseconds)
  timeout?: number;
  
  // Maximum number of retries for failed shard requests
  maxRetries?: number;
  
  // Whether to continue execution if some shards fail
  continueOnError?: boolean;
}

/**
 * Default execution options
 */
const DEFAULT_EXECUTION_OPTIONS: ExecutionOptions = {
  timeout: CONFIG.REQUEST_TIMEOUT,
  maxRetries: CONFIG.MAX_RETRIES,
  continueOnError: true
};

/**
 * Executes a query plan and returns the results
 * 
 * @param plan The query plan to execute
 * @param fetchShardData Function to fetch data from a shard
 * @param options Execution options
 * @returns The query results
 */
export async function executeQueryPlan(
  plan: QueryPlan,
  fetchShardData: (target: ShardTarget) => Promise<ShardQueryResult>,
  options: ExecutionOptions = {}
): Promise<QueryResult> {
  const execOptions = { ...DEFAULT_EXECUTION_OPTIONS, ...options };
  
  logger.debug('Executing query plan', { 
    collection: plan.collection,
    targetCount: plan.targets.length,
    timeout: execOptions.timeout
  });
  
  // Create a promise that rejects after the timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    if (execOptions.timeout) {
      // In Cloudflare Workers, we can just use setTimeout directly
      const timeoutId = setTimeout(() => {
        reject(new ImpossibleDBError(
          ErrorCode.QUERY_TIMEOUT,
          `Query execution timed out after ${execOptions.timeout}ms`
        ));
      }, execOptions.timeout);
    }
  });
  
  try {
    // Execute the query on all shards
    const shardResultsPromise = plan.parallel
      ? executeParallel(plan.targets, fetchShardData, execOptions as Required<ExecutionOptions>)
      : executeSequential(plan.targets, fetchShardData, execOptions as Required<ExecutionOptions>);
    
    // Race against the timeout
    const shardResults = await Promise.race([shardResultsPromise, timeoutPromise]);
    
    // Merge the results from all shards
    return mergeResults(shardResults, plan);
  } catch (error) {
    logger.error('Error executing query plan', error as Error, {
      collection: plan.collection
    });
    
    if ((error as ImpossibleDBError).code === ErrorCode.QUERY_TIMEOUT) {
      throw error;
    }
    
    throw new ImpossibleDBError(
      ErrorCode.INTERNAL_ERROR,
      'Error executing query',
      { originalError: (error as Error).message }
    );
  }
}

/**
 * Executes queries on multiple shards in parallel
 * 
 * @param targets The shard targets to query
 * @param fetchShardData Function to fetch data from a shard
 * @param options Execution options
 * @returns Results from all shards
 */
async function executeParallel(
  targets: ShardTarget[],
  fetchShardData: (target: ShardTarget) => Promise<ShardQueryResult>,
  options: Required<ExecutionOptions>
): Promise<ShardQueryResult[]> {
  logger.debug('Executing parallel queries', { targetCount: targets.length });
  
  // Create a promise for each shard with retry logic
  const shardPromises = targets.map(target => 
    executeWithRetry(target, fetchShardData, options.maxRetries)
  );
  
  // Wait for all promises to settle
  const results = await Promise.allSettled(shardPromises);
  
  // Process the results
  const shardResults: ShardQueryResult[] = [];
  let hasErrors = false;
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      shardResults.push(result.value);
    } else {
      hasErrors = true;
      logger.warn('Shard query failed', { 
        error: result.reason,
        shardId: targets[index].shardId
      });
      
      // Add an error result if continueOnError is true
      if (options.continueOnError) {
        shardResults.push({
          shardId: targets[index].shardId,
          results: [],
          total: 0,
          error: result.reason
        });
      }
    }
  });
  
  // If we have errors and continueOnError is false, throw an error
  if (hasErrors && !options.continueOnError) {
    throw new ImpossibleDBError(
      ErrorCode.INTERNAL_ERROR,
      'One or more shard queries failed'
    );
  }
  
  return shardResults;
}

/**
 * Executes queries on multiple shards sequentially
 * 
 * @param targets The shard targets to query
 * @param fetchShardData Function to fetch data from a shard
 * @param options Execution options
 * @returns Results from all shards
 */
async function executeSequential(
  targets: ShardTarget[],
  fetchShardData: (target: ShardTarget) => Promise<ShardQueryResult>,
  options: Required<ExecutionOptions>
): Promise<ShardQueryResult[]> {
  logger.debug('Executing sequential queries', { targetCount: targets.length });
  
  const shardResults: ShardQueryResult[] = [];
  
  for (const target of targets) {
    try {
      const result = await executeWithRetry(target, fetchShardData, options.maxRetries);
      shardResults.push(result);
    } catch (error) {
      logger.warn('Shard query failed', { 
        error: error as Error,
        shardId: target.shardId
      });
      
      // Add an error result if continueOnError is true
      if (options.continueOnError) {
        shardResults.push({
          shardId: target.shardId,
          results: [],
          total: 0,
          error: error as Error
        });
      } else {
        throw error;
      }
    }
  }
  
  return shardResults;
}

/**
 * Executes a query on a single shard with retry logic
 * 
 * @param target The shard target to query
 * @param fetchShardData Function to fetch data from a shard
 * @param maxRetries Maximum number of retries
 * @returns Results from the shard
 */
async function executeWithRetry(
  target: ShardTarget,
  fetchShardData: (target: ShardTarget) => Promise<ShardQueryResult>,
  maxRetries: number
): Promise<ShardQueryResult> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchShardData(target);
    } catch (error) {
      lastError = error as Error;
      
      // If this was the last attempt, don't wait
      if (attempt === maxRetries) {
        break;
      }
      
      // Exponential backoff
      const backoff = CONFIG.RETRY_BACKOFF_MS * Math.pow(2, attempt);
      logger.debug('Retrying shard query', {
        shardId: target.shardId,
        attempt: attempt + 1,
        maxRetries,
        backoff
      });
      
      // In Cloudflare Workers, we can just use setTimeout directly
      await new Promise<void>(resolve => {
        setTimeout(resolve, backoff);
      });
    }
  }
  
  throw lastError || new Error('Unknown error executing shard query');
}

/**
 * Merges results from multiple shards into a single result set
 * 
 * @param shardResults Results from all shards
 * @param plan The query plan that was executed
 * @returns Merged query results
 */
function mergeResults(shardResults: ShardQueryResult[], plan: QueryPlan): QueryResult {
  logger.debug('Merging results', { 
    shardCount: shardResults.length,
    requiresMerge: plan.requiresMerge
  });
  
  // If we don't need to merge results, just return the first shard's results
  if (!plan.requiresMerge && shardResults.length === 1) {
    const result = shardResults[0];
    return {
      results: result.results,
      metadata: {
        total: result.total,
        limit: plan.options.limit || CONFIG.MAX_QUERY_RESULTS,
        offset: plan.options.offset || 0
      }
    };
  }
  
  // Combine all results
  let allResults: Document[] = [];
  let totalResults = 0;
  
  shardResults.forEach(result => {
    allResults = allResults.concat(result.results);
    totalResults += result.total;
  });
  
  // Apply sorting if needed
  if (plan.options.sort && plan.options.sort.length > 0) {
    allResults = sortResults(allResults, plan.options.sort);
  }
  
  // Apply projection if needed
  if (plan.projection && plan.projection.length > 0) {
    allResults = applyProjection(allResults, plan.projection);
  }
  
  // Apply pagination
  const offset = plan.options.offset || 0;
  const limit = plan.options.limit || CONFIG.MAX_QUERY_RESULTS;
  
  const paginatedResults = allResults.slice(offset, offset + limit);
  
  return {
    results: paginatedResults,
    metadata: {
      total: totalResults,
      limit,
      offset
    }
  };
}

/**
 * Sorts results according to the sort options
 * 
 * @param results The results to sort
 * @param sort The sort options
 * @returns Sorted results
 */
function sortResults(
  results: Document[],
  sort: { field: string; direction: 'asc' | 'desc' }[]
): Document[] {
  return [...results].sort((a, b) => {
    for (const { field, direction } of sort) {
      const aValue = getNestedValue(a, field);
      const bValue = getNestedValue(b, field);
      
      if (aValue === bValue) continue;
      
      const comparison = aValue < bValue ? -1 : 1;
      return direction === 'asc' ? comparison : -comparison;
    }
    
    return 0;
  });
}

/**
 * Applies projection to results, keeping only the specified fields
 * 
 * @param results The results to project
 * @param projection The fields to keep
 * @returns Projected results
 */
function applyProjection(results: Document[], projection: string[]): Document[] {
  return results.map(doc => {
    const projected: Document = {
      _id: doc._id,
      _collection: doc._collection,
      _version: doc._version,
      _createdAt: doc._createdAt,
      _updatedAt: doc._updatedAt
    };
    
    // Add the projected fields
    for (const field of projection) {
      const value = getNestedValue(doc, field);
      if (value !== undefined) {
        setNestedValue(projected, field, value);
      }
    }
    
    return projected;
  });
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

/**
 * Sets a nested value in an object using dot notation
 * 
 * @param obj The object to set the value in
 * @param path The path to the value using dot notation
 * @param value The value to set
 */
function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  const last = parts.pop()!;
  
  let current = obj;
  for (const part of parts) {
    if (current[part] === undefined) {
      current[part] = {};
    }
    current = current[part];
  }
  
  current[last] = value;
}
