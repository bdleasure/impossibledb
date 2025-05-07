/**
 * Router Implementation
 * 
 * This file implements the Router interface defined in interfaces.ts.
 * It provides functionality for routing requests to the appropriate shards
 * based on the document ID, collection, and client location.
 */

import { Router, ShardInfo, RoutingTable, NodeInfo, NodeMetrics } from './interfaces';
import { ConsistentHashRing } from './consistentHash';
import { LocalityAwareRouter } from './localityManager';
import { createLogger } from '../utils/logger';
import { CONFIG } from '../config';

const logger = createLogger('Router');

/**
 * Implementation of the Router interface
 */
export class ShardRouter implements Router {
  private consistentHash: ConsistentHashRing;
  private localityManager: LocalityAwareRouter;
  private nodes: Map<string, NodeInfo> = new Map();
  private collections: Map<string, ShardInfo[]> = new Map();
  private routingTableVersion: number = 0;
  private replicaCount: number;
  
  /**
   * Creates a new ShardRouter
   * 
   * @param replicaCount Number of replicas for each document
   */
  constructor(replicaCount = 3) {
    this.consistentHash = new ConsistentHashRing();
    this.localityManager = new LocalityAwareRouter();
    this.replicaCount = replicaCount;
    
    logger.debug('ShardRouter initialized', { replicaCount });
  }
  
  /**
   * Route a request to the appropriate shard
   * 
   * @param collection Collection name
   * @param documentId Document ID
   * @param clientId Optional client ID for locality optimization
   * @returns The shard ID to route to
   */
  routeRequest(collection: string, documentId: string, clientId?: string): string {
    const key = `${collection}:${documentId}`;
    
    // If we have a client ID, try to get the optimal shard
    if (clientId) {
      try {
        return this.getOptimalShard(clientId, collection, documentId);
      } catch (error) {
        logger.warn('Failed to get optimal shard, falling back to primary', error as Error);
      }
    }
    
    // Fall back to primary shard
    try {
      const shardId = this.consistentHash.getNode(key);
      logger.debug('Request routed to primary shard', { collection, documentId, shardId });
      return shardId;
    } catch (error) {
      logger.error('Failed to route request', error as Error);
      throw new Error(`Failed to route request: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get all shards that need to be queried for a collection
   * 
   * @param collection Collection name
   * @param filter Optional filter to determine shards
   * @returns Array of shard IDs
   */
  getShardsForQuery(collection: string, filter?: any): string[] {
    // Get collection shards
    const collectionShards = this.collections.get(collection) || [];
    
    if (collectionShards.length === 0) {
      // If no specific shards for this collection, query all nodes
      logger.debug('No specific shards for collection, querying all nodes', { collection });
      return this.consistentHash.getNodes();
    }
    
    // If we have a filter, we could potentially optimize which shards to query
    // For now, we'll just query all shards for the collection
    const shardIds = collectionShards.map(shard => shard.shardId);
    
    logger.debug('Shards determined for query', { 
      collection, 
      shardCount: shardIds.length,
      filter: filter ? 'yes' : 'no'
    });
    
    return shardIds;
  }
  
  /**
   * Update the routing table
   * 
   * @param routingTable New routing table
   */
  updateRoutingTable(routingTable: RoutingTable): void {
    // Update collections
    this.collections.clear();
    for (const [collection, shards] of Object.entries(routingTable.collections)) {
      this.collections.set(collection, shards);
    }
    
    // Update nodes
    this.nodes.clear();
    for (const [nodeId, nodeInfo] of Object.entries(routingTable.nodes)) {
      this.nodes.set(nodeId, nodeInfo);
      
      // Add node to consistent hash ring
      this.consistentHash.addNode(nodeId);
      
      // Add node to locality manager
      this.localityManager.registerNode(nodeId, nodeInfo.location);
      this.localityManager.updateNodeMetrics(nodeId, nodeInfo.metrics);
    }
    
    // Update routing table version
    this.routingTableVersion = routingTable.version;
    
    logger.debug('Routing table updated', { 
      version: routingTable.version,
      collections: this.collections.size,
      nodes: this.nodes.size
    });
  }
  
  /**
   * Get the primary shard for a document
   * 
   * @param collection Collection name
   * @param documentId Document ID
   * @returns Shard ID
   * @private
   */
  private getPrimaryShard(collection: string, documentId: string): string {
    const key = `${collection}:${documentId}`;
    
    try {
      const shardId = this.consistentHash.getNode(key);
      logger.debug('Primary shard determined', { collection, documentId, shardId });
      return shardId;
    } catch (error) {
      logger.error('Failed to get primary shard', error as Error);
      throw new Error(`Failed to determine primary shard: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get all shards for a document (primary and replicas)
   * 
   * @param collection Collection name
   * @param documentId Document ID
   * @returns Array of shard IDs
   * @private
   */
  private getDocumentShards(collection: string, documentId: string): string[] {
    const allShards = this.consistentHash.getNodes();
    
    if (allShards.length === 0) {
      throw new Error('No shards available');
    }
    
    // If we have fewer shards than the replica count, use all shards
    if (allShards.length <= this.replicaCount) {
      return allShards;
    }
    
    // Get the primary shard
    const primaryShardId = this.getPrimaryShard(collection, documentId);
    const shards = [primaryShardId];
    
    // Get additional shards for replicas
    // This is a simplified approach - in a real implementation, we would
    // use a more sophisticated algorithm to ensure good distribution
    const key = `${collection}:${documentId}`;
    const primaryIndex = allShards.indexOf(primaryShardId);
    
    for (let i = 1; i < this.replicaCount; i++) {
      // Use a different hash for each replica
      const replicaKey = `${key}:replica:${i}`;
      const replicaShardId = this.consistentHash.getNode(replicaKey);
      
      // Ensure we don't add duplicates
      if (!shards.includes(replicaShardId)) {
        shards.push(replicaShardId);
      } else {
        // If we got a duplicate, just use the next shard in the list
        const nextIndex = (primaryIndex + i) % allShards.length;
        const nextShardId = allShards[nextIndex];
        
        if (!shards.includes(nextShardId)) {
          shards.push(nextShardId);
        }
      }
    }
    
    logger.debug('Document shards determined', { 
      collection, 
      documentId, 
      shards,
      replicaCount: this.replicaCount
    });
    
    return shards;
  }
  
  /**
   * Get the optimal shard for a client
   * 
   * @param clientId Client ID
   * @param collection Collection name
   * @param documentId Document ID
   * @returns Shard ID
   * @private
   */
  private getOptimalShard(clientId: string, collection: string, documentId: string): string {
    // Get all shards for the document
    const documentShards = this.getDocumentShards(collection, documentId);
    
    // Use locality manager to determine the optimal shard
    try {
      const optimalShardId = this.localityManager.getOptimalNode(clientId, documentShards);
      
      logger.debug('Optimal shard determined', { 
        clientId, 
        collection, 
        documentId, 
        shardId: optimalShardId 
      });
      
      return optimalShardId;
    } catch (error) {
      logger.error('Failed to get optimal shard', error as Error);
      
      // Fall back to primary shard
      return this.getPrimaryShard(collection, documentId);
    }
  }
  
  /**
   * Register a client's location
   * 
   * @param clientId Client ID
   * @param location Client's location
   */
  registerClient(clientId: string, location: string): void {
    this.localityManager.registerClient(clientId, location);
  }
  
  /**
   * Add a node to the router
   * 
   * @param nodeId Node ID
   * @param info Node information
   */
  addNode(nodeId: string, info: NodeInfo): void {
    // Add to consistent hash ring
    this.consistentHash.addNode(nodeId);
    
    // Add to locality manager
    this.localityManager.registerNode(nodeId, info.location);
    this.localityManager.updateNodeMetrics(nodeId, info.metrics);
    
    // Store node info
    this.nodes.set(nodeId, info);
    
    logger.debug('Node added', { nodeId, info });
  }
  
  /**
   * Remove a node from the router
   * 
   * @param nodeId Node ID
   */
  removeNode(nodeId: string): void {
    // Remove from consistent hash ring
    this.consistentHash.removeNode(nodeId);
    
    // Remove from nodes map
    this.nodes.delete(nodeId);
    
    logger.debug('Node removed', { nodeId });
  }
  
  /**
   * Update node information
   * 
   * @param nodeId Node ID
   * @param info Updated node information
   */
  updateNodeInfo(nodeId: string, info: NodeInfo): void {
    // Update node info
    this.nodes.set(nodeId, info);
    
    // Update locality manager with metrics
    this.localityManager.updateNodeMetrics(nodeId, info.metrics);
    
    logger.debug('Node info updated', { nodeId, info });
  }
  
  /**
   * Get all registered nodes
   * 
   * @returns Map of node IDs to node information
   */
  getNodes(): Map<string, NodeInfo> {
    return new Map(this.nodes);
  }
  
  /**
   * Get information about a specific node
   * 
   * @param nodeId Node ID
   * @returns Node information or undefined if not found
   */
  getNodeInfo(nodeId: string): NodeInfo | undefined {
    return this.nodes.get(nodeId);
  }
  
  /**
   * Get the URL for a node
   * 
   * @param nodeId Node ID
   * @returns Node URL or undefined if not found
   */
  getNodeUrl(nodeId: string): string | undefined {
    const info = this.nodes.get(nodeId);
    if (!info) return undefined;
    
    // In a real implementation, this would construct the URL based on node info
    return `https://${nodeId}.impossibledb.workers.dev`;
  }
  
  /**
   * Set the replica count
   * 
   * @param count New replica count
   */
  setReplicaCount(count: number): void {
    if (count < 1) {
      throw new Error('Replica count must be at least 1');
    }
    
    this.replicaCount = count;
    logger.debug('Replica count updated', { replicaCount: count });
  }
  
  /**
   * Get the current replica count
   * 
   * @returns Current replica count
   */
  getReplicaCount(): number {
    return this.replicaCount;
  }
  
  /**
   * Get the distribution of documents across shards
   * 
   * @param numKeys Number of keys to simulate
   * @returns Map of shard IDs to the number of documents assigned to them
   */
  getDistribution(numKeys: number = 1000): Map<string, number> {
    return this.consistentHash.getDistribution(numKeys);
  }
}
