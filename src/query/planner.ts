/**
 * Query Planner
 * 
 * This module is responsible for planning the execution of queries across multiple shards.
 * It determines which shards need to be queried and how to combine the results.
 */

import { ParsedQuery, QueryExpression, expressionToFilters } from './parser';
import { QueryFilter, QueryOptions, ErrorCode } from '../types';
import { ImpossibleDBError } from '../utils/errorHandler';
import { createLogger } from '../utils/logger';
import { CONFIG } from '../config';

const logger = createLogger('QueryPlanner');

/**
 * Represents a shard that needs to be queried
 */
export interface ShardTarget {
  shardId: string;
  filters: QueryFilter[];
  options: QueryOptions;
}

/**
 * Represents a query execution plan
 */
export interface QueryPlan {
  // The collection being queried
  collection: string;
  
  // The shards that need to be queried
  targets: ShardTarget[];
  
  // Whether the query can be executed in parallel
  parallel: boolean;
  
  // Whether results need to be merged across shards
  requiresMerge: boolean;
  
  // Fields to include in the results (projection)
  projection?: string[];
  
  // Original query options
  options: QueryOptions;
}

/**
 * Creates a query plan for a parsed query
 * 
 * @param parsedQuery The parsed query to plan
 * @param shardIds Array of shard IDs that could contain relevant data
 * @returns A query execution plan
 */
export function createQueryPlan(parsedQuery: ParsedQuery, shardIds: string[]): QueryPlan {
  logger.debug('Creating query plan', { 
    collection: parsedQuery.collection,
    shardCount: shardIds.length
  });
  
  if (!shardIds || shardIds.length === 0) {
    logger.warn('No shards available for query');
    throw new ImpossibleDBError(
      ErrorCode.NO_SHARDS_AVAILABLE,
      'No shards available to execute the query'
    );
  }
  
  // Convert the query expression back to filters for each shard
  const filters = expressionToFilters(parsedQuery.expression);
  
  // Create a target for each shard
  const targets: ShardTarget[] = shardIds.map(shardId => ({
    shardId,
    filters,
    // Clone the options but remove limit/offset as we'll apply those after merging
    options: {
      ...parsedQuery.options,
      // If sorting is required, we need to get all results from each shard
      // to perform the final sort across all shards
      limit: parsedQuery.options.sort ? undefined : parsedQuery.options.limit,
      offset: undefined // Offset is applied after merging results
    }
  }));
  
  // Determine if the query can be executed in parallel
  // Currently, all queries can be executed in parallel
  const parallel = true;
  
  // Determine if results need to be merged
  // If we're querying multiple shards or using sorting, we need to merge
  const requiresMerge = targets.length > 1 || !!parsedQuery.options.sort;
  
  return {
    collection: parsedQuery.collection,
    targets,
    parallel,
    requiresMerge,
    projection: parsedQuery.projection,
    options: parsedQuery.options
  };
}

/**
 * Optimizes a query plan to minimize the number of shards that need to be queried
 * 
 * @param plan The initial query plan
 * @returns An optimized query plan
 */
export function optimizeQueryPlan(plan: QueryPlan): QueryPlan {
  logger.debug('Optimizing query plan', { 
    collection: plan.collection,
    initialTargetCount: plan.targets.length
  });
  
  // Currently, we don't have enough information to optimize the plan
  // In the future, we could use metadata about the shards to determine
  // which ones are likely to contain relevant data
  
  // For now, just return the original plan
  return plan;
}

/**
 * Estimates the cost of executing a query plan
 * 
 * @param plan The query plan to estimate
 * @returns An estimated cost (higher is more expensive)
 */
export function estimateQueryCost(plan: QueryPlan): number {
  // Basic cost model: 1 cost unit per shard
  let cost = plan.targets.length;
  
  // Additional cost for merging results
  if (plan.requiresMerge) {
    cost *= 1.5;
  }
  
  // Additional cost for sorting
  if (plan.options.sort && plan.options.sort.length > 0) {
    cost *= 1.2 * plan.options.sort.length;
  }
  
  logger.debug('Estimated query cost', { 
    collection: plan.collection,
    cost,
    targetCount: plan.targets.length
  });
  
  return cost;
}

/**
 * Maximum allowed cost for a query plan
 * This is a heuristic value that can be adjusted based on performance testing
 */
export const MAX_QUERY_COST = 100;

/**
 * Checks if a query plan exceeds the maximum allowed cost
 * 
 * @param plan The query plan to check
 * @returns True if the plan is too expensive, false otherwise
 */
export function isQueryPlanTooExpensive(plan: QueryPlan): boolean {
  const cost = estimateQueryCost(plan);
  return cost > MAX_QUERY_COST;
}

/**
 * Splits a query plan into smaller, more manageable plans
 * 
 * @param plan The query plan to split
 * @param maxTargetsPerPlan Maximum number of targets per plan
 * @returns An array of smaller query plans
 */
export function splitQueryPlan(plan: QueryPlan, maxTargetsPerPlan: number = 5): QueryPlan[] {
  if (plan.targets.length <= maxTargetsPerPlan) {
    return [plan];
  }
  
  logger.debug('Splitting query plan', { 
    collection: plan.collection,
    targetCount: plan.targets.length,
    maxTargetsPerPlan
  });
  
  const plans: QueryPlan[] = [];
  
  // Split the targets into chunks
  for (let i = 0; i < plan.targets.length; i += maxTargetsPerPlan) {
    const chunkTargets = plan.targets.slice(i, i + maxTargetsPerPlan);
    
    plans.push({
      ...plan,
      targets: chunkTargets
    });
  }
  
  return plans;
}
