/**
 * Router Tests
 * 
 * This file contains tests for the ShardRouter implementation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShardRouter } from '../../../src/routing/router';
import { ConsistentHashRing } from '../../../src/routing/consistentHash';
import { EdgeLocalityManager } from '../../../src/routing/localityManager';
import { RoutingTable, NodeMetrics } from '../../../src/routing/interfaces';

// Mock the ConsistentHashRing and EdgeLocalityManager
vi.mock('../../../src/routing/consistentHash', () => {
  return {
    ConsistentHashRing: vi.fn().mockImplementation(() => ({
      addNode: vi.fn(),
      removeNode: vi.fn(),
      getNode: vi.fn().mockImplementation((key: string) => {
        // Simple deterministic mock implementation
        if (key.includes('user')) return 'node1';
        if (key.includes('product')) return 'node2';
        return 'node3';
      }),
      getNodes: vi.fn().mockReturnValue(['node1', 'node2', 'node3'])
    }))
  };
});

vi.mock('../../../src/routing/localityManager', () => {
  return {
    EdgeLocalityManager: vi.fn().mockImplementation(() => ({
      registerClient: vi.fn(),
      getOptimalNode: vi.fn().mockImplementation((clientId: string, nodes: string[]) => {
        // Simple deterministic mock implementation
        if (clientId.includes('us')) return nodes.find(n => n === 'node1') || nodes[0];
        if (clientId.includes('eu')) return nodes.find(n => n === 'node3') || nodes[0];
        return nodes[0];
      }),
      updateNodeMetrics: vi.fn(),
      registerNode: vi.fn(),
      removeNode: vi.fn()
    }))
  };
});

describe('ShardRouter', () => {
  let router: ShardRouter;
  let mockHashRing: ConsistentHashRing;
  let mockLocalityManager: EdgeLocalityManager;
  
  beforeEach(() => {
    // Clear mocks
    vi.clearAllMocks();
    
    // Create new instances
    mockHashRing = new ConsistentHashRing();
    mockLocalityManager = new EdgeLocalityManager();
    router = new ShardRouter(mockHashRing, mockLocalityManager);
  });
  
  it('should route requests based on collection and document ID', () => {
    const shardId = router.routeRequest('users', 'user123');
    
    // The mock hash ring will return 'node1' for anything with 'user'
    expect(shardId).toContain('shard-');
    
    // Different collection should route to different shard
    const productShardId = router.routeRequest('products', 'product456');
    expect(productShardId).not.toBe(shardId);
  });
  
  it('should consider client location when routing requests', () => {
    const usClientShardId = router.routeRequest('users', 'user123', 'client-us');
    const euClientShardId = router.routeRequest('users', 'user123', 'client-eu');
    
    // Since we're using the same collection and ID, the base shard should be the same
    // But the client location should influence the final routing decision
    expect(usClientShardId).not.toBe(euClientShardId);
  });
  
  it('should return all shards for a collection query', () => {
    const shards = router.getShardsForQuery('users');
    
    // Should return a shard for each node
    expect(shards.length).toBe(3);
    shards.forEach(shard => {
      expect(shard).toContain('shard-');
    });
  });
  
  it('should update the routing table', () => {
    const newRoutingTable: RoutingTable = {
      collections: {
        'users': [
          {
            shardId: 'shard-1',
            keyRange: ['a', 'm'],
            nodeId: 'node1'
          },
          {
            shardId: 'shard-2',
            keyRange: ['n', 'z'],
            nodeId: 'node2'
          }
        ]
      },
      nodes: {
        'node1': {
          nodeId: 'node1',
          location: 'us-east',
          metrics: { latency: 10, loadFactor: 0.5, availability: 1.0 },
          status: 'active'
        },
        'node2': {
          nodeId: 'node2',
          location: 'us-west',
          metrics: { latency: 20, loadFactor: 0.3, availability: 1.0 },
          status: 'active'
        }
      },
      version: 1
    };
    
    router.updateRoutingTable(newRoutingTable);
    
    // Test that the routing table was updated by checking routing behavior
    const shardId = router.routeRequest('users', 'alice');
    expect(shardId).toBe('shard-1'); // 'alice' starts with 'a', should go to shard-1
    
    const shardId2 = router.routeRequest('users', 'zack');
    expect(shardId2).toBe('shard-2'); // 'zack' starts with 'z', should go to shard-2
  });
  
  it('should not update routing table if version is older', () => {
    // First update with version 2
    const routingTable1: RoutingTable = {
      collections: { 'test': [] },
      nodes: { 'node1': { nodeId: 'node1', location: 'us-east', metrics: { latency: 10, loadFactor: 0.5, availability: 1.0 }, status: 'active' } },
      version: 2
    };
    
    router.updateRoutingTable(routingTable1);
    
    // Then try to update with version 1
    const routingTable2: RoutingTable = {
      collections: { 'different': [] },
      nodes: { 'node2': { nodeId: 'node2', location: 'eu-west', metrics: { latency: 20, loadFactor: 0.3, availability: 1.0 }, status: 'active' } },
      version: 1
    };
    
    router.updateRoutingTable(routingTable2);
    
    // The routing table should still be the first one
    expect(router.getRoutingTable()).toEqual(routingTable1);
  });
  
  it('should filter shards based on ID filter', () => {
    // Set up a routing table with key ranges
    const routingTable: RoutingTable = {
      collections: {
        'users': [
          {
            shardId: 'shard-1',
            keyRange: ['a', 'm'],
            nodeId: 'node1'
          },
          {
            shardId: 'shard-2',
            keyRange: ['n', 'z'],
            nodeId: 'node2'
          }
        ]
      },
      nodes: {
        'node1': {
          nodeId: 'node1',
          location: 'us-east',
          metrics: { latency: 10, loadFactor: 0.5, availability: 1.0 },
          status: 'active'
        },
        'node2': {
          nodeId: 'node2',
          location: 'us-west',
          metrics: { latency: 20, loadFactor: 0.3, availability: 1.0 },
          status: 'active'
        }
      },
      version: 1
    };
    
    router.updateRoutingTable(routingTable);
    
    // Query with a filter that matches only one shard
    const shards = router.getShardsForQuery('users', { field: '_id', operator: '=', value: 'alice' });
    expect(shards).toEqual(['shard-1']);
    
    // Query with a filter that matches a different shard
    const shards2 = router.getShardsForQuery('users', { field: '_id', operator: '=', value: 'zack' });
    expect(shards2).toEqual(['shard-2']);
  });
  
  it('should generate deterministic shard IDs', () => {
    // This test verifies that the same inputs always produce the same shard ID
    const shardId1 = router.routeRequest('users', 'user123');
    const shardId2 = router.routeRequest('users', 'user123');
    
    expect(shardId1).toBe(shardId2);
    
    // Different inputs should produce different shard IDs
    const shardId3 = router.routeRequest('users', 'user456');
    expect(shardId3).not.toBe(shardId1);
  });
});
