/**
 * Query System Tests
 * 
 * This file contains tests for the query system components:
 * - Parser
 * - Planner
 * - Executor
 * - Aggregator
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseQuery, QueryExpression, LogicalOperator } from '../../../src/query/parser';
import { createQueryPlan, optimizeQueryPlan } from '../../../src/query/planner';
import { executeQueryPlan } from '../../../src/query/executor';
import { aggregate, AggregationOperation, AggregationSpec } from '../../../src/query/aggregator';
import { Document, QueryFilter } from '../../../src/types';

describe('Query Parser', () => {
  it('should parse a simple query', () => {
    const filters: QueryFilter[] = [
      { field: 'age', operator: '>', value: 21 }
    ];
    
    const result = parseQuery('users', filters);
    
    expect(result.collection).toBe('users');
    expect(result.expression.conditions.length).toBe(1);
    expect(result.expression.conditions[0].field).toBe('age');
    expect(result.expression.conditions[0].operator).toBe('>');
    expect(result.expression.conditions[0].value).toBe(21);
    expect(result.expression.logicalOperator).toBe(LogicalOperator.AND);
  });
  
  it('should parse a query with multiple filters', () => {
    const filters: QueryFilter[] = [
      { field: 'age', operator: '>', value: 21 },
      { field: 'active', operator: '=', value: true }
    ];
    
    const result = parseQuery('users', filters);
    
    expect(result.collection).toBe('users');
    expect(result.expression.conditions.length).toBe(2);
    expect(result.expression.conditions[0].field).toBe('age');
    expect(result.expression.conditions[1].field).toBe('active');
  });
  
  it('should parse a query with options', () => {
    const filters: QueryFilter[] = [
      { field: 'age', operator: '>', value: 21 }
    ];
    
    const options = {
      limit: 10,
      offset: 20,
      sort: [{ field: 'name', direction: 'asc' as const }]
    };
    
    const result = parseQuery('users', filters, undefined, options);
    
    expect(result.options.limit).toBe(10);
    expect(result.options.offset).toBe(20);
    expect(result.options.sort![0].field).toBe('name');
    expect(result.options.sort![0].direction).toBe('asc');
  });
  
  it('should parse a query with projection', () => {
    const filters: QueryFilter[] = [
      { field: 'age', operator: '>', value: 21 }
    ];
    
    const projection = ['name', 'email', 'age'];
    
    const result = parseQuery('users', filters, projection);
    
    expect(result.projection).toEqual(['name', 'email', 'age']);
  });
  
  it('should handle empty filters', () => {
    const result = parseQuery('users');
    
    expect(result.collection).toBe('users');
    expect(result.expression.conditions.length).toBe(0);
  });
});

describe('Query Planner', () => {
  it('should create a query plan for a single shard', () => {
    const parsedQuery = parseQuery('users', [
      { field: 'age', operator: '>', value: 21 }
    ]);
    
    const shardIds = ['shard1'];
    
    const plan = createQueryPlan(parsedQuery, shardIds);
    
    expect(plan.collection).toBe('users');
    expect(plan.targets.length).toBe(1);
    expect(plan.targets[0].shardId).toBe('shard1');
    expect(plan.targets[0].filters.length).toBe(1);
    expect(plan.parallel).toBe(true);
    expect(plan.requiresMerge).toBe(false);
  });
  
  it('should create a query plan for multiple shards', () => {
    const parsedQuery = parseQuery('users', [
      { field: 'age', operator: '>', value: 21 }
    ]);
    
    const shardIds = ['shard1', 'shard2', 'shard3'];
    
    const plan = createQueryPlan(parsedQuery, shardIds);
    
    expect(plan.collection).toBe('users');
    expect(plan.targets.length).toBe(3);
    expect(plan.targets.map(t => t.shardId)).toEqual(['shard1', 'shard2', 'shard3']);
    expect(plan.parallel).toBe(true);
    expect(plan.requiresMerge).toBe(true);
  });
  
  it('should optimize a query plan', () => {
    const parsedQuery = parseQuery('users', [
      { field: 'age', operator: '>', value: 21 }
    ]);
    
    const shardIds = ['shard1', 'shard2', 'shard3'];
    
    const plan = createQueryPlan(parsedQuery, shardIds);
    const optimizedPlan = optimizeQueryPlan(plan);
    
    // Currently, optimization doesn't change the plan, but we should still test it
    expect(optimizedPlan.targets.length).toBe(plan.targets.length);
  });
});

describe('Query Executor', () => {
  it('should execute a query plan and return results', async () => {
    const parsedQuery = parseQuery('users', [
      { field: 'age', operator: '>', value: 21 }
    ]);
    
    const shardIds = ['shard1'];
    const plan = createQueryPlan(parsedQuery, shardIds);
    
    // Mock function to fetch data from a shard
    const fetchShardData = vi.fn().mockResolvedValue({
      shardId: 'shard1',
      results: [
        { _id: '1', _collection: 'users', _version: 1, _createdAt: 1, _updatedAt: 1, name: 'Alice', age: 25 },
        { _id: '2', _collection: 'users', _version: 1, _createdAt: 1, _updatedAt: 1, name: 'Bob', age: 30 }
      ],
      total: 2
    });
    
    const result = await executeQueryPlan(plan, fetchShardData);
    
    expect(result.results.length).toBe(2);
    expect(result.metadata.total).toBe(2);
    expect(fetchShardData).toHaveBeenCalledTimes(1);
  });
  
  it('should merge results from multiple shards', async () => {
    const parsedQuery = parseQuery('users', [
      { field: 'age', operator: '>', value: 21 }
    ]);
    
    const shardIds = ['shard1', 'shard2'];
    const plan = createQueryPlan(parsedQuery, shardIds);
    
    // Mock function to fetch data from shards
    const fetchShardData = vi.fn()
      .mockImplementationOnce(() => Promise.resolve({
        shardId: 'shard1',
        results: [
          { _id: '1', _collection: 'users', _version: 1, _createdAt: 1, _updatedAt: 1, name: 'Alice', age: 25 }
        ],
        total: 1
      }))
      .mockImplementationOnce(() => Promise.resolve({
        shardId: 'shard2',
        results: [
          { _id: '2', _collection: 'users', _version: 1, _createdAt: 1, _updatedAt: 1, name: 'Bob', age: 30 }
        ],
        total: 1
      }));
    
    const result = await executeQueryPlan(plan, fetchShardData);
    
    expect(result.results.length).toBe(2);
    expect(result.metadata.total).toBe(2);
    expect(fetchShardData).toHaveBeenCalledTimes(2);
  });
  
  it('should apply sorting to merged results', async () => {
    const parsedQuery = parseQuery('users', [
      { field: 'age', operator: '>', value: 21 }
    ], undefined, {
      sort: [{ field: 'age', direction: 'desc' }]
    });
    
    const shardIds = ['shard1', 'shard2'];
    const plan = createQueryPlan(parsedQuery, shardIds);
    
    // Mock function to fetch data from shards
    const fetchShardData = vi.fn()
      .mockImplementationOnce(() => Promise.resolve({
        shardId: 'shard1',
        results: [
          { _id: '1', _collection: 'users', _version: 1, _createdAt: 1, _updatedAt: 1, name: 'Alice', age: 25 }
        ],
        total: 1
      }))
      .mockImplementationOnce(() => Promise.resolve({
        shardId: 'shard2',
        results: [
          { _id: '2', _collection: 'users', _version: 1, _createdAt: 1, _updatedAt: 1, name: 'Bob', age: 30 }
        ],
        total: 1
      }));
    
    const result = await executeQueryPlan(plan, fetchShardData);
    
    expect(result.results.length).toBe(2);
    expect(result.results[0].name).toBe('Bob'); // Bob has higher age, should be first
    expect(result.results[1].name).toBe('Alice');
  });
});

describe('Query Aggregator', () => {
  let testData: Document[];
  
  beforeEach(() => {
    testData = [
      { _id: '1', _collection: 'users', _version: 1, _createdAt: 1, _updatedAt: 1, name: 'Alice', age: 25, active: true, department: 'Engineering' },
      { _id: '2', _collection: 'users', _version: 1, _createdAt: 1, _updatedAt: 1, name: 'Bob', age: 30, active: true, department: 'Marketing' },
      { _id: '3', _collection: 'users', _version: 1, _createdAt: 1, _updatedAt: 1, name: 'Charlie', age: 35, active: false, department: 'Engineering' },
      { _id: '4', _collection: 'users', _version: 1, _createdAt: 1, _updatedAt: 1, name: 'Dave', age: 40, active: true, department: 'Marketing' },
      { _id: '5', _collection: 'users', _version: 1, _createdAt: 1, _updatedAt: 1, name: 'Eve', age: 45, active: false, department: 'Engineering' }
    ];
  });
  
  it('should perform count aggregation', () => {
    const specs: AggregationSpec[] = [
      { operation: AggregationOperation.COUNT }
    ];
    
    const results = aggregate(testData, specs);
    
    expect(results.length).toBe(1);
    expect(results[0].operation).toBe(AggregationOperation.COUNT);
    expect(results[0].value).toBe(5);
  });
  
  it('should perform count aggregation with field', () => {
    const specs: AggregationSpec[] = [
      { operation: AggregationOperation.COUNT, field: 'active' }
    ];
    
    const results = aggregate(testData, specs);
    
    expect(results.length).toBe(1);
    expect(results[0].operation).toBe(AggregationOperation.COUNT);
    expect(results[0].field).toBe('active');
    expect(results[0].value).toBe(5); // All documents have the 'active' field
  });
  
  it('should perform sum aggregation', () => {
    const specs: AggregationSpec[] = [
      { operation: AggregationOperation.SUM, field: 'age' }
    ];
    
    const results = aggregate(testData, specs);
    
    expect(results.length).toBe(1);
    expect(results[0].operation).toBe(AggregationOperation.SUM);
    expect(results[0].field).toBe('age');
    expect(results[0].value).toBe(25 + 30 + 35 + 40 + 45);
  });
  
  it('should perform average aggregation', () => {
    const specs: AggregationSpec[] = [
      { operation: AggregationOperation.AVG, field: 'age' }
    ];
    
    const results = aggregate(testData, specs);
    
    expect(results.length).toBe(1);
    expect(results[0].operation).toBe(AggregationOperation.AVG);
    expect(results[0].field).toBe('age');
    expect(results[0].value).toBe((25 + 30 + 35 + 40 + 45) / 5);
  });
  
  it('should perform min aggregation', () => {
    const specs: AggregationSpec[] = [
      { operation: AggregationOperation.MIN, field: 'age' }
    ];
    
    const results = aggregate(testData, specs);
    
    expect(results.length).toBe(1);
    expect(results[0].operation).toBe(AggregationOperation.MIN);
    expect(results[0].field).toBe('age');
    expect(results[0].value).toBe(25);
  });
  
  it('should perform max aggregation', () => {
    const specs: AggregationSpec[] = [
      { operation: AggregationOperation.MAX, field: 'age' }
    ];
    
    const results = aggregate(testData, specs);
    
    expect(results.length).toBe(1);
    expect(results[0].operation).toBe(AggregationOperation.MAX);
    expect(results[0].field).toBe('age');
    expect(results[0].value).toBe(45);
  });
  
  it('should perform group by aggregation', () => {
    const specs: AggregationSpec[] = [
      { operation: AggregationOperation.GROUP_BY, groupBy: ['department'] }
    ];
    
    const results = aggregate(testData, specs);
    
    expect(results.length).toBe(1);
    expect(results[0].operation).toBe(AggregationOperation.GROUP_BY);
    expect(results[0].value).toBe(2); // 2 departments
    expect(results[0].groups).toBeDefined();
    
    const engineeringKey = Object.keys(results[0].groups!).find(key => 
      results[0].groups![key].department === 'Engineering'
    );
    
    const marketingKey = Object.keys(results[0].groups!).find(key => 
      results[0].groups![key].department === 'Marketing'
    );
    
    expect(engineeringKey).toBeDefined();
    expect(marketingKey).toBeDefined();
    expect(results[0].groups![engineeringKey!].count).toBe(3);
    expect(results[0].groups![marketingKey!].count).toBe(2);
  });
  
  it('should perform multiple aggregations', () => {
    const specs: AggregationSpec[] = [
      { operation: AggregationOperation.COUNT },
      { operation: AggregationOperation.AVG, field: 'age' },
      { operation: AggregationOperation.GROUP_BY, groupBy: ['active'] }
    ];
    
    const results = aggregate(testData, specs);
    
    expect(results.length).toBe(3);
    expect(results[0].operation).toBe(AggregationOperation.COUNT);
    expect(results[1].operation).toBe(AggregationOperation.AVG);
    expect(results[2].operation).toBe(AggregationOperation.GROUP_BY);
  });
});
