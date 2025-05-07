/**
 * ShardManager.ts
 * 
 * Implements a Durable Object that manages the distribution and allocation of shards
 * in ImpossibleDB. The ShardManager is responsible for:
 * - Tracking shard assignments to storage objects
 * - Handling shard rebalancing when nodes join or leave
 * - Providing shard location information to clients
 * - Managing shard migration during rebalancing
 */

import { createLogger } from '../utils/logger';
import { ImpossibleDBError, handleError } from '../utils/errorHandler';
import { ErrorCode } from '../types';
import { Router } from '../routing/interfaces';
import { ShardRouter } from '../routing/router';
import { CONFIG } from '../config';

// Create a logger for this module
const logger = createLogger('ShardManager');

/**
 * Shard status enum
 */
enum ShardStatus {
  ACTIVE = 'ACTIVE',
  MIGRATING = 'MIGRATING',
  INACTIVE = 'INACTIVE'
}

/**
 * Shard information
 */
interface ShardInfo {
  id: string;
  primaryNodeId: string;
  replicaNodeIds: string[];
  status: ShardStatus;
  createdAt: number;
  updatedAt: number;
  documentCount?: number;
  sizeBytes?: number;
  collections?: Set<string>;
}

/**
 * Node information
 */
interface NodeInfo {
  id: string;
  url: string;
  region: string;
  status: 'ONLINE' | 'OFFLINE' | 'DRAINING';
  joinedAt: number;
  lastHeartbeatAt: number;
  shardIds: Set<string>;
  capacity: {
    maxShards: number;
    maxSizeBytes: number;
    cpuUtilization: number;
    memoryUtilization: number;
  };
}

/**
 * ShardManager Durable Object
 */
export class ShardManager implements DurableObject {
  private state: DurableObjectState;
  private shards: Map<string, ShardInfo> = new Map();
  private nodes: Map<string, NodeInfo> = new Map();
  private router: Router;
  
  constructor(state: DurableObjectState) {
    this.state = state;
    this.router = new ShardRouter();
    
    this.state.blockConcurrencyWhile(async () => {
      await this.loadState();
    });
    
    logger.debug('ShardManager initialized');
  }
  
  /**
   * Loads the shard and node state from storage
   */
  private async loadState(): Promise<void> {
    try {
      // Load shards
      const shardEntries = await this.state.storage.list<ShardInfo>({ prefix: 'shard:' });
      for (const [key, shard] of shardEntries) {
        const shardId = key.substring(6); // Remove 'shard:' prefix
        this.shards.set(shardId, shard);
      }
      
      // Load nodes
      const nodeEntries = await this.state.storage.list<NodeInfo>({ prefix: 'node:' });
      for (const [key, node] of nodeEntries) {
        const nodeId = key.substring(5); // Remove 'node:' prefix
        // Convert array to Set for shardIds
        node.shardIds = new Set(Array.from(node.shardIds));
        this.nodes.set(nodeId, node);
      }
      
      logger.debug('State loaded', { 
        shardCount: this.shards.size,
        nodeCount: this.nodes.size
      });
    } catch (error) {
      logger.error('Failed to load state', error as Error);
      throw new ImpossibleDBError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to initialize shard manager'
      );
    }
  }
  
  /**
   * Saves a shard to storage
   */
  private async saveShard(shardId: string, shard: ShardInfo): Promise<void> {
    try {
      await this.state.storage.put(`shard:${shardId}`, shard);
      this.shards.set(shardId, shard);
      logger.debug('Shard saved', { shardId });
    } catch (error) {
      logger.error('Failed to save shard', error as Error);
      throw new ImpossibleDBError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to save shard state',
        { originalError: (error as Error).message }
      );
    }
  }
  
  /**
   * Saves a node to storage
   */
  private async saveNode(nodeId: string, node: NodeInfo): Promise<void> {
    try {
      await this.state.storage.put(`node:${nodeId}`, node);
      this.nodes.set(nodeId, node);
      logger.debug('Node saved', { nodeId });
    } catch (error) {
      logger.error('Failed to save node', error as Error);
      throw new ImpossibleDBError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to save node state',
        { originalError: (error as Error).message }
      );
    }
  }
  
  /**
   * Handles incoming HTTP requests to the Durable Object
   */
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname.split('/').filter(Boolean);
      
      logger.debug('Received request', { method: request.method, path: url.pathname });
      
      // Basic routing
      if (request.method === 'GET' && path[0] === 'healthcheck') {
        return new Response(JSON.stringify({ 
          status: 'ok',
          shardCount: this.shards.size,
          nodeCount: this.nodes.size
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Shard operations
      if (path[0] === 'shards') {
        if (request.method === 'GET' && path.length === 1) {
          return this.handleListShards(request);
        } else if (request.method === 'GET' && path.length === 2) {
          return this.handleGetShard(path[1]);
        } else if (request.method === 'POST' && path.length === 1) {
          return this.handleCreateShard(request);
        } else if (request.method === 'PUT' && path.length === 2) {
          return this.handleUpdateShard(path[1], request);
        }
      }
      
      // Node operations
      if (path[0] === 'nodes') {
        if (request.method === 'GET' && path.length === 1) {
          return this.handleListNodes(request);
        } else if (request.method === 'GET' && path.length === 2) {
          return this.handleGetNode(path[1]);
        } else if (request.method === 'POST' && path.length === 1) {
          return this.handleRegisterNode(request);
        } else if (request.method === 'PUT' && path.length === 2 && path[2] === 'heartbeat') {
          return this.handleNodeHeartbeat(path[1], request);
        }
      }
      
      // Lookup operations
      if (path[0] === 'lookup') {
        if (request.method === 'GET' && path.length === 3) {
          const collection = path[1];
          const documentId = path[2];
          return this.handleLookupShard(collection, documentId);
        }
      }
      
      logger.warn('Route not found', { method: request.method, path: url.pathname });
      return new Response(JSON.stringify({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Route not found'
        }
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return handleError(error);
    }
  }
  
  /**
   * Handles a request to list all shards
   */
  private handleListShards(request: Request): Response {
    const shardList = Array.from(this.shards.values()).map(shard => ({
      id: shard.id,
      primaryNodeId: shard.primaryNodeId,
      replicaNodeIds: shard.replicaNodeIds,
      status: shard.status,
      documentCount: shard.documentCount || 0,
      sizeBytes: shard.sizeBytes || 0
    }));
    
    return new Response(JSON.stringify({
      shards: shardList,
      count: shardList.length
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  /**
   * Handles a request to get a specific shard
   */
  private handleGetShard(shardId: string): Response {
    const shard = this.shards.get(shardId);
    if (!shard) {
      logger.warn('Shard not found', { shardId });
      throw new ImpossibleDBError(
        ErrorCode.NOT_FOUND,
        `Shard not found: ${shardId}`
      );
    }
    
    return new Response(JSON.stringify(shard), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  /**
   * Handles a request to create a new shard
   */
  private async handleCreateShard(request: Request): Promise<Response> {
    let requestBody;
    try {
      requestBody = await request.json() as {
        id?: string;
        primaryNodeId?: string;
      };
    } catch (error) {
      logger.warn('Invalid JSON in request body', { error: (error as Error).message });
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Invalid JSON in request body'
      );
    }
    
    // Generate a shard ID if not provided
    const shardId = requestBody.id || `shard-${crypto.randomUUID()}`;
    
    // Check if shard already exists
    if (this.shards.has(shardId)) {
      throw new ImpossibleDBError(
        ErrorCode.CONFLICT,
        `Shard already exists: ${shardId}`
      );
    }
    
    // Find a node to assign the shard to if not specified
    let primaryNodeId = requestBody.primaryNodeId;
    if (!primaryNodeId) {
      primaryNodeId = this.findBestNodeForShard();
      if (!primaryNodeId) {
        throw new ImpossibleDBError(
          ErrorCode.INTERNAL_ERROR,
          'No available nodes to assign shard'
        );
      }
    }
    
    // Check if the node exists
    const node = this.nodes.get(primaryNodeId);
    if (!node) {
      throw new ImpossibleDBError(
        ErrorCode.NOT_FOUND,
        `Node not found: ${primaryNodeId}`
      );
    }
    
    // Create the shard
    const now = Date.now();
    const shard: ShardInfo = {
      id: shardId,
      primaryNodeId,
      replicaNodeIds: [],
      status: ShardStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
      documentCount: 0,
      sizeBytes: 0,
      collections: new Set()
    };
    
    // Save the shard
    await this.saveShard(shardId, shard);
    
    // Update the node
    node.shardIds.add(shardId);
    await this.saveNode(primaryNodeId, node);
    
    return new Response(JSON.stringify(shard), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  /**
   * Handles a request to update a shard
   */
  private async handleUpdateShard(shardId: string, request: Request): Promise<Response> {
    const shard = this.shards.get(shardId);
    if (!shard) {
      logger.warn('Shard not found', { shardId });
      throw new ImpossibleDBError(
        ErrorCode.NOT_FOUND,
        `Shard not found: ${shardId}`
      );
    }
    
    let requestBody;
    try {
      requestBody = await request.json() as Partial<ShardInfo>;
    } catch (error) {
      logger.warn('Invalid JSON in request body', { error: (error as Error).message });
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Invalid JSON in request body'
      );
    }
    
    // Update allowed fields
    if (requestBody.status) {
      shard.status = requestBody.status;
    }
    
    if (requestBody.documentCount !== undefined) {
      shard.documentCount = requestBody.documentCount;
    }
    
    if (requestBody.sizeBytes !== undefined) {
      shard.sizeBytes = requestBody.sizeBytes;
    }
    
    // Update collections if provided
    if (requestBody.collections) {
      shard.collections = new Set(Array.from(requestBody.collections));
    }
    
    shard.updatedAt = Date.now();
    
    // Save the updated shard
    await this.saveShard(shardId, shard);
    
    return new Response(JSON.stringify(shard), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  /**
   * Handles a request to list all nodes
   */
  private handleListNodes(request: Request): Response {
    const nodeList = Array.from(this.nodes.values()).map(node => ({
      id: node.id,
      url: node.url,
      region: node.region,
      status: node.status,
      joinedAt: node.joinedAt,
      lastHeartbeatAt: node.lastHeartbeatAt,
      shardCount: node.shardIds.size,
      capacity: node.capacity
    }));
    
    return new Response(JSON.stringify({
      nodes: nodeList,
      count: nodeList.length
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  /**
   * Handles a request to get a specific node
   */
  private handleGetNode(nodeId: string): Response {
    const node = this.nodes.get(nodeId);
    if (!node) {
      logger.warn('Node not found', { nodeId });
      throw new ImpossibleDBError(
        ErrorCode.NOT_FOUND,
        `Node not found: ${nodeId}`
      );
    }
    
    return new Response(JSON.stringify(node), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  /**
   * Handles a request to register a new node
   */
  private async handleRegisterNode(request: Request): Promise<Response> {
    let requestBody;
    try {
      requestBody = await request.json() as {
        id?: string;
        url: string;
        region: string;
        capacity: {
          maxShards: number;
          maxSizeBytes: number;
          cpuUtilization: number;
          memoryUtilization: number;
        };
      };
    } catch (error) {
      logger.warn('Invalid JSON in request body', { error: (error as Error).message });
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Invalid JSON in request body'
      );
    }
    
    // Validate required fields
    if (!requestBody.url) {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Node URL is required'
      );
    }
    
    if (!requestBody.region) {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Node region is required'
      );
    }
    
    // Generate a node ID if not provided
    const nodeId = requestBody.id || `node-${crypto.randomUUID()}`;
    
    // Check if node already exists
    if (this.nodes.has(nodeId)) {
      throw new ImpossibleDBError(
        ErrorCode.CONFLICT,
        `Node already exists: ${nodeId}`
      );
    }
    
    // Create the node
    const now = Date.now();
    const node: NodeInfo = {
      id: nodeId,
      url: requestBody.url,
      region: requestBody.region,
      status: 'ONLINE',
      joinedAt: now,
      lastHeartbeatAt: now,
      shardIds: new Set(),
      capacity: requestBody.capacity || {
        maxShards: 10, // Default max shards per node
        maxSizeBytes: 1024 * 1024 * 1024, // 1GB default max size
        cpuUtilization: 0,
        memoryUtilization: 0
      }
    };
    
    // Save the node
    await this.saveNode(nodeId, node);
    
    // Trigger shard rebalancing asynchronously
    this.rebalanceShards().catch(error => {
      logger.error('Error rebalancing shards', error as Error);
    });
    
    return new Response(JSON.stringify(node), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  /**
   * Handles a node heartbeat
   */
  private async handleNodeHeartbeat(nodeId: string, request: Request): Promise<Response> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      logger.warn('Node not found', { nodeId });
      throw new ImpossibleDBError(
        ErrorCode.NOT_FOUND,
        `Node not found: ${nodeId}`
      );
    }
    
    let requestBody;
    try {
      requestBody = await request.json() as {
        status?: 'ONLINE' | 'OFFLINE' | 'DRAINING';
        capacity?: {
          cpuUtilization: number;
          memoryUtilization: number;
        };
      };
    } catch (error) {
      logger.warn('Invalid JSON in request body', { error: (error as Error).message });
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Invalid JSON in request body'
      );
    }
    
    // Update node status if provided
    if (requestBody.status) {
      node.status = requestBody.status;
    }
    
    // Update capacity metrics if provided
    if (requestBody.capacity) {
      node.capacity.cpuUtilization = requestBody.capacity.cpuUtilization;
      node.capacity.memoryUtilization = requestBody.capacity.memoryUtilization;
    }
    
    // Update heartbeat timestamp
    node.lastHeartbeatAt = Date.now();
    
    // Save the updated node
    await this.saveNode(nodeId, node);
    
    return new Response(JSON.stringify({ acknowledged: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  /**
   * Handles a request to lookup the shard for a document
   */
  private handleLookupShard(collection: string, documentId: string): Response {
    // Use the router to determine the shard ID
    const shardId = this.router.routeRequest(collection, documentId);
    
    // Get the shard info
    const shard = this.shards.get(shardId);
    if (!shard) {
      logger.warn('Shard not found', { shardId });
      throw new ImpossibleDBError(
        ErrorCode.NOT_FOUND,
        `Shard not found: ${shardId}`
      );
    }
    
    // Get the node info
    const node = this.nodes.get(shard.primaryNodeId);
    if (!node) {
      logger.warn('Node not found', { nodeId: shard.primaryNodeId });
      throw new ImpossibleDBError(
        ErrorCode.NOT_FOUND,
        `Node not found: ${shard.primaryNodeId}`
      );
    }
    
    return new Response(JSON.stringify({
      collection,
      documentId,
      shardId,
      nodeId: node.id,
      nodeUrl: node.url,
      status: shard.status
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  /**
   * Finds the best node to assign a new shard to
   */
  private findBestNodeForShard(): string | undefined {
    // Filter online nodes
    const onlineNodes = Array.from(this.nodes.values())
      .filter(node => node.status === 'ONLINE');
    
    if (onlineNodes.length === 0) {
      return undefined;
    }
    
    // Find the node with the fewest shards
    return onlineNodes.reduce((bestNodeId, node) => {
      const bestNode = this.nodes.get(bestNodeId);
      if (!bestNode || node.shardIds.size < bestNode.shardIds.size) {
        return node.id;
      }
      return bestNodeId;
    }, onlineNodes[0].id);
  }
  
  /**
   * Rebalances shards across nodes
   */
  private async rebalanceShards(): Promise<void> {
    logger.debug('Starting shard rebalancing');
    
    // This is a placeholder for the actual rebalancing logic
    // In a real implementation, this would:
    // 1. Calculate the ideal distribution of shards
    // 2. Identify shards that need to be moved
    // 3. Initiate shard migration for each shard that needs to be moved
    
    logger.debug('Shard rebalancing completed');
  }
}
