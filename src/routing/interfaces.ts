/**
 * Routing Module Interfaces
 * 
 * This file defines the interfaces for the routing/sharding layer of ImpossibleDB.
 * These interfaces should be implemented in the corresponding files:
 * - consistentHash.ts
 * - localityManager.ts
 * - router.ts
 */

/**
 * Interface for the consistent hashing algorithm
 * To be implemented in: src/routing/consistentHash.ts
 */
export interface ConsistentHash {
    /**
     * Add a node to the hash ring
     * @param nodeId Unique identifier for the node
     */
    addNode(nodeId: string): void;
    
    /**
     * Remove a node from the hash ring
     * @param nodeId Unique identifier for the node
     */
    removeNode(nodeId: string): void;
    
    /**
     * Get the node responsible for a given key
     * @param key The key to hash
     * @returns The node ID responsible for the key
     */
    getNode(key: string): string;
    
    /**
     * Get all nodes in the hash ring
     * @returns Array of node IDs
     */
    getNodes(): string[];
  }
  
  /**
   * Interface for locality management
   * To be implemented in: src/routing/localityManager.ts
   */
  export interface LocalityManager {
    /**
     * Register a client's location
     * @param clientId Unique identifier for the client
     * @param location Client's geographic location or edge location
     */
    registerClient(clientId: string, location: string): void;
    
    /**
     * Get the optimal node for a client based on locality
     * @param clientId Unique identifier for the client
     * @param possibleNodes Array of possible node IDs to choose from
     * @returns The optimal node ID
     */
    getOptimalNode(clientId: string, possibleNodes: string[]): string;
    
    /**
     * Update node performance metrics
     * @param nodeId Unique identifier for the node
     * @param metrics Performance metrics for the node
     */
    updateNodeMetrics(nodeId: string, metrics: NodeMetrics): void;
  }
  
  /**
   * Performance metrics for a node
   */
  export interface NodeMetrics {
    latency: number;
    loadFactor: number;
    availability: number;
  }
  
  /**
   * Interface for the router
   * To be implemented in: src/routing/router.ts
   */
  export interface Router {
    /**
     * Route a request to the appropriate shard
     * @param collection Collection name
     * @param documentId Document ID
     * @param clientId Optional client ID for locality optimization
     * @returns The shard ID to route to
     */
    routeRequest(collection: string, documentId: string, clientId?: string): string;
    
    /**
     * Get all shards that need to be queried for a collection
     * @param collection Collection name
     * @param filter Optional filter to determine shards
     * @returns Array of shard IDs
     */
    getShardsForQuery(collection: string, filter?: any): string[];
    
    /**
     * Update the routing table
     * @param routingTable New routing table
     */
    updateRoutingTable(routingTable: RoutingTable): void;
  }
  
  /**
   * Routing table structure
   */
  export interface RoutingTable {
    collections: Record<string, ShardInfo[]>;
    nodes: Record<string, NodeInfo>;
    version: number;
  }
  
  /**
   * Information about a shard
   */
  export interface ShardInfo {
    shardId: string;
    keyRange: [string, string]; // Start and end of key range
    nodeId: string;
  }
  
  /**
   * Information about a node
   */
  export interface NodeInfo {
    nodeId: string;
    location: string;
    metrics: NodeMetrics;
    status: 'active' | 'inactive' | 'recovering';
  }