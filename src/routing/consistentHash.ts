/**
 * Consistent Hashing Implementation
 * 
 * This file implements the ConsistentHash interface defined in interfaces.ts.
 * It provides a consistent hashing algorithm for distributing data across nodes
 * in a way that minimizes redistribution when nodes are added or removed.
 */

import { ConsistentHash } from './interfaces';
import { createLogger } from '../utils/logger';
import { CONFIG } from '../config';

const logger = createLogger('ConsistentHash');

/**
 * Implementation of the ConsistentHash interface
 */
export class ConsistentHashRing implements ConsistentHash {
  private ring: Map<number, string> = new Map();
  private sortedKeys: number[] = [];
  private nodes: Set<string> = new Set();
  private virtualNodesPerPhysical: number;
  
  /**
   * Creates a new ConsistentHashRing
   * 
   * @param virtualNodesPerPhysical Number of virtual nodes per physical node
   */
  constructor(virtualNodesPerPhysical = CONFIG.VIRTUAL_NODES_PER_PHYSICAL) {
    this.virtualNodesPerPhysical = virtualNodesPerPhysical;
    logger.debug('ConsistentHashRing initialized', { virtualNodesPerPhysical });
  }
  
  /**
   * Add a node to the hash ring
   * 
   * @param nodeId Unique identifier for the node
   */
  addNode(nodeId: string): void {
    if (this.nodes.has(nodeId)) {
      logger.warn('Node already exists in hash ring', { nodeId });
      return;
    }
    
    this.nodes.add(nodeId);
    
    // Add virtual nodes
    for (let i = 0; i < this.virtualNodesPerPhysical; i++) {
      const virtualNodeId = `${nodeId}:${i}`;
      const hash = this.hash(virtualNodeId);
      this.ring.set(hash, nodeId);
    }
    
    // Update sorted keys
    this.updateSortedKeys();
    
    logger.debug('Node added to hash ring', { 
      nodeId, 
      virtualNodes: this.virtualNodesPerPhysical,
      totalNodes: this.nodes.size,
      ringSize: this.ring.size
    });
  }
  
  /**
   * Remove a node from the hash ring
   * 
   * @param nodeId Unique identifier for the node
   */
  removeNode(nodeId: string): void {
    if (!this.nodes.has(nodeId)) {
      logger.warn('Node does not exist in hash ring', { nodeId });
      return;
    }
    
    this.nodes.delete(nodeId);
    
    // Remove virtual nodes
    for (let i = 0; i < this.virtualNodesPerPhysical; i++) {
      const virtualNodeId = `${nodeId}:${i}`;
      const hash = this.hash(virtualNodeId);
      this.ring.delete(hash);
    }
    
    // Update sorted keys
    this.updateSortedKeys();
    
    logger.debug('Node removed from hash ring', { 
      nodeId, 
      totalNodes: this.nodes.size,
      ringSize: this.ring.size
    });
  }
  
  /**
   * Get the node responsible for a given key
   * 
   * @param key The key to hash
   * @returns The node ID responsible for the key
   */
  getNode(key: string): string {
    if (this.ring.size === 0) {
      throw new Error('Hash ring is empty');
    }
    
    const hash = this.hash(key);
    
    // Find the first node with a hash greater than or equal to the key hash
    for (const ringHash of this.sortedKeys) {
      if (hash <= ringHash) {
        return this.ring.get(ringHash)!;
      }
    }
    
    // If we get here, the key's hash is greater than all nodes,
    // so we wrap around to the first node
    return this.ring.get(this.sortedKeys[0])!;
  }
  
  /**
   * Get all nodes in the hash ring
   * 
   * @returns Array of node IDs
   */
  getNodes(): string[] {
    return Array.from(this.nodes);
  }
  
  /**
   * Get the distribution of keys across nodes
   * 
   * @param numKeys Number of keys to simulate
   * @returns Map of node IDs to the number of keys assigned to them
   */
  getDistribution(numKeys: number = 1000): Map<string, number> {
    const distribution = new Map<string, number>();
    
    // Initialize counts
    for (const nodeId of this.nodes) {
      distribution.set(nodeId, 0);
    }
    
    // Simulate keys
    for (let i = 0; i < numKeys; i++) {
      const key = `key-${i}`;
      const nodeId = this.getNode(key);
      distribution.set(nodeId, (distribution.get(nodeId) || 0) + 1);
    }
    
    return distribution;
  }
  
  /**
   * Update the sorted keys array
   */
  private updateSortedKeys(): void {
    this.sortedKeys = Array.from(this.ring.keys()).sort((a, b) => a - b);
  }
  
  /**
   * Hash a string to a number
   * 
   * @param str String to hash
   * @returns 32-bit hash value
   */
  private hash(str: string): number {
    let hash = 0;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash);
  }
}
