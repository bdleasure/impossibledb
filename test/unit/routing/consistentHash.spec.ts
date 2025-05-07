/**
 * Consistent Hash Tests
 * 
 * This file contains tests for the ConsistentHashRing implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConsistentHashRing } from '../../../src/routing/consistentHash';

describe('ConsistentHashRing', () => {
  let hashRing: ConsistentHashRing;
  
  beforeEach(() => {
    // Create a new hash ring with fewer virtual nodes for testing
    hashRing = new ConsistentHashRing(10);
  });
  
  it('should add nodes to the ring', () => {
    hashRing.addNode('node1');
    hashRing.addNode('node2');
    
    const nodes = hashRing.getNodes();
    expect(nodes).toHaveLength(2);
    expect(nodes).toContain('node1');
    expect(nodes).toContain('node2');
  });
  
  it('should remove nodes from the ring', () => {
    hashRing.addNode('node1');
    hashRing.addNode('node2');
    hashRing.removeNode('node1');
    
    const nodes = hashRing.getNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes).toContain('node2');
    expect(nodes).not.toContain('node1');
  });
  
  it('should throw an error when getting a node with empty ring', () => {
    expect(() => {
      hashRing.getNode('someKey');
    }).toThrow('No nodes available in the hash ring');
  });
  
  it('should consistently map keys to the same node', () => {
    hashRing.addNode('node1');
    hashRing.addNode('node2');
    hashRing.addNode('node3');
    
    const key = 'testKey';
    const node = hashRing.getNode(key);
    
    // The same key should always map to the same node
    for (let i = 0; i < 10; i++) {
      expect(hashRing.getNode(key)).toBe(node);
    }
  });
  
  it('should distribute keys evenly across nodes', () => {
    hashRing.addNode('node1');
    hashRing.addNode('node2');
    hashRing.addNode('node3');
    
    const distribution: Record<string, number> = {
      'node1': 0,
      'node2': 0,
      'node3': 0
    };
    
    // Generate a large number of keys and check distribution
    const keyCount = 10000;
    for (let i = 0; i < keyCount; i++) {
      const key = `key-${i}`;
      const node = hashRing.getNode(key);
      distribution[node]++;
    }
    
    // Each node should get approximately 1/3 of the keys
    // Allow for some variance (within 10% of expected)
    const expectedPerNode = keyCount / 3;
    const variance = expectedPerNode * 0.1;
    
    Object.values(distribution).forEach(count => {
      expect(count).toBeGreaterThan(expectedPerNode - variance);
      expect(count).toBeLessThan(expectedPerNode + variance);
    });
  });
  
  it('should minimize key redistribution when adding nodes', () => {
    // Start with two nodes
    hashRing.addNode('node1');
    hashRing.addNode('node2');
    
    // Map a set of keys to nodes
    const keys = Array.from({ length: 1000 }, (_, i) => `key-${i}`);
    const initialMapping = new Map<string, string>();
    
    keys.forEach(key => {
      initialMapping.set(key, hashRing.getNode(key));
    });
    
    // Add a third node
    hashRing.addNode('node3');
    
    // Count how many keys got remapped
    let remappedCount = 0;
    keys.forEach(key => {
      const newNode = hashRing.getNode(key);
      if (initialMapping.get(key) !== newNode) {
        remappedCount++;
      }
    });
    
    // In theory, only about 1/3 of the keys should be remapped
    // Allow for some variance
    expect(remappedCount).toBeLessThan(keys.length / 2);
  });
  
  it('should handle duplicate node additions gracefully', () => {
    hashRing.addNode('node1');
    hashRing.addNode('node1'); // Add the same node again
    
    const nodes = hashRing.getNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes).toContain('node1');
  });
  
  it('should handle removal of non-existent nodes gracefully', () => {
    hashRing.addNode('node1');
    hashRing.removeNode('node2'); // Remove a node that doesn't exist
    
    const nodes = hashRing.getNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes).toContain('node1');
  });
});
