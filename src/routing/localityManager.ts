/**
 * Locality Manager Implementation
 * 
 * This file implements the LocalityManager interface defined in interfaces.ts.
 * It provides functionality for optimizing data access based on client locality,
 * helping to reduce latency by routing requests to the closest available node.
 */

import { LocalityManager, NodeMetrics } from './interfaces';
import { createLogger } from '../utils/logger';
import { CONFIG } from '../config';

const logger = createLogger('LocalityManager');

/**
 * Client location information
 */
interface ClientLocation {
  clientId: string;
  location: string;
  lastSeen: number;
}

/**
 * Node performance and location information
 */
interface NodePerformance {
  nodeId: string;
  location: string;
  metrics: NodeMetrics;
  lastUpdated: number;
}

/**
 * Implementation of the LocalityManager interface
 */
export class LocalityAwareRouter implements LocalityManager {
  private clients: Map<string, ClientLocation> = new Map();
  private nodes: Map<string, NodePerformance> = new Map();
  private locationDistances: Map<string, Map<string, number>> = new Map();
  
  /**
   * Creates a new LocalityAwareRouter
   */
  constructor() {
    // Initialize with some common location distances (in milliseconds of latency)
    this.initializeLocationDistances();
    logger.debug('LocalityAwareRouter initialized');
  }
  
  /**
   * Register a client's location
   * 
   * @param clientId Unique identifier for the client
   * @param location Client's geographic location or edge location
   */
  registerClient(clientId: string, location: string): void {
    this.clients.set(clientId, {
      clientId,
      location,
      lastSeen: Date.now()
    });
    
    logger.debug('Client registered', { clientId, location });
  }
  
  /**
   * Get the optimal node for a client based on locality
   * 
   * @param clientId Unique identifier for the client
   * @param possibleNodes Array of possible node IDs to choose from
   * @returns The optimal node ID
   */
  getOptimalNode(clientId: string, possibleNodes: string[]): string {
    if (possibleNodes.length === 0) {
      throw new Error('No possible nodes provided');
    }
    
    if (possibleNodes.length === 1) {
      return possibleNodes[0];
    }
    
    // Get client location
    const clientLocation = this.clients.get(clientId);
    
    // If client location is unknown, use load balancing
    if (!clientLocation) {
      logger.debug('Client location unknown, using load balancing', { clientId });
      return this.getNodeByLoad(possibleNodes);
    }
    
    // Get nodes in the same location as the client
    const nodesInSameLocation = possibleNodes.filter(nodeId => {
      const node = this.nodes.get(nodeId);
      return node && node.location === clientLocation.location;
    });
    
    // If there are nodes in the same location, choose the one with the best metrics
    if (nodesInSameLocation.length > 0) {
      logger.debug('Found nodes in same location as client', { 
        clientId, 
        location: clientLocation.location,
        nodeCount: nodesInSameLocation.length
      });
      return this.getNodeByMetrics(nodesInSameLocation);
    }
    
    // Otherwise, find the closest location with available nodes
    logger.debug('No nodes in same location as client, finding closest', { 
      clientId, 
      location: clientLocation.location
    });
    return this.getClosestNode(clientLocation.location, possibleNodes);
  }
  
  /**
   * Update node performance metrics
   * 
   * @param nodeId Unique identifier for the node
   * @param metrics Performance metrics for the node
   */
  updateNodeMetrics(nodeId: string, metrics: NodeMetrics): void {
    const node = this.nodes.get(nodeId);
    
    if (node) {
      node.metrics = metrics;
      node.lastUpdated = Date.now();
    } else {
      logger.warn('Attempted to update metrics for unknown node', { nodeId });
    }
    
    logger.debug('Node metrics updated', { nodeId, metrics });
  }
  
  /**
   * Register a node with its location
   * 
   * @param nodeId Unique identifier for the node
   * @param location Node's geographic location or edge location
   */
  registerNode(nodeId: string, location: string): void {
    this.nodes.set(nodeId, {
      nodeId,
      location,
      metrics: {
        latency: 0,
        loadFactor: 0,
        availability: 1
      },
      lastUpdated: Date.now()
    });
    
    logger.debug('Node registered', { nodeId, location });
  }
  
  /**
   * Get all registered nodes
   * 
   * @returns Map of node IDs to their performance information
   */
  getNodes(): Map<string, NodePerformance> {
    return new Map(this.nodes);
  }
  
  /**
   * Get all registered clients
   * 
   * @returns Map of client IDs to their location information
   */
  getClients(): Map<string, ClientLocation> {
    return new Map(this.clients);
  }
  
  /**
   * Clean up stale client registrations
   * 
   * @param maxAge Maximum age in milliseconds before a client is considered stale
   */
  cleanupStaleClients(maxAge: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [clientId, client] of this.clients.entries()) {
      if (now - client.lastSeen > maxAge) {
        this.clients.delete(clientId);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      logger.debug('Cleaned up stale clients', { removedCount });
    }
  }
  
  /**
   * Initialize the location distance matrix
   */
  private initializeLocationDistances(): void {
    // This is a simplified example with a few regions
    // In a real implementation, this would be more comprehensive
    const locations = ['us-east', 'us-west', 'eu-west', 'ap-east'];
    
    // Create distance matrix (values represent approximate latency in ms)
    const distances: Record<string, Record<string, number>> = {
      'us-east': { 'us-east': 0, 'us-west': 70, 'eu-west': 100, 'ap-east': 250 },
      'us-west': { 'us-east': 70, 'us-west': 0, 'eu-west': 140, 'ap-east': 180 },
      'eu-west': { 'us-east': 100, 'us-west': 140, 'eu-west': 0, 'ap-east': 280 },
      'ap-east': { 'us-east': 250, 'us-west': 180, 'eu-west': 280, 'ap-east': 0 }
    };
    
    // Convert to Map structure
    for (const location of locations) {
      const distanceMap = new Map<string, number>();
      
      for (const [targetLocation, distance] of Object.entries(distances[location])) {
        distanceMap.set(targetLocation, distance);
      }
      
      this.locationDistances.set(location, distanceMap);
    }
  }
  
  /**
   * Get the distance between two locations
   * 
   * @param locationA First location
   * @param locationB Second location
   * @returns Distance between locations (in ms of latency)
   */
  private getLocationDistance(locationA: string, locationB: string): number {
    // If locations are the same, distance is 0
    if (locationA === locationB) {
      return 0;
    }
    
    // Check if we have a distance in our matrix
    const distancesFromA = this.locationDistances.get(locationA);
    if (distancesFromA && distancesFromA.has(locationB)) {
      return distancesFromA.get(locationB)!;
    }
    
    // If we don't have a distance, use a default high value
    return 300; // Default high latency
  }
  
  /**
   * Get the node with the best metrics from a list of nodes
   * 
   * @param nodeIds Array of node IDs to choose from
   * @returns The node ID with the best metrics
   */
  private getNodeByMetrics(nodeIds: string[]): string {
    if (nodeIds.length === 0) {
      throw new Error('No nodes provided');
    }
    
    if (nodeIds.length === 1) {
      return nodeIds[0];
    }
    
    // Calculate a score for each node based on its metrics
    // Lower score is better
    const nodeScores = nodeIds.map(nodeId => {
      const node = this.nodes.get(nodeId);
      
      if (!node) {
        return { nodeId, score: Infinity };
      }
      
      // Calculate score based on latency, load factor, and availability
      // This is a simplified scoring function
      const latencyScore = node.metrics.latency / CONFIG.LATENCY_THRESHOLD_MS;
      const loadScore = node.metrics.loadFactor / CONFIG.LOAD_FACTOR_THRESHOLD;
      const availabilityScore = 1 - node.metrics.availability;
      
      const score = latencyScore + loadScore + availabilityScore;
      
      return { nodeId, score };
    });
    
    // Sort by score (ascending)
    nodeScores.sort((a, b) => a.score - b.score);
    
    return nodeScores[0].nodeId;
  }
  
  /**
   * Get the node with the lowest load from a list of nodes
   * 
   * @param nodeIds Array of node IDs to choose from
   * @returns The node ID with the lowest load
   */
  private getNodeByLoad(nodeIds: string[]): string {
    if (nodeIds.length === 0) {
      throw new Error('No nodes provided');
    }
    
    if (nodeIds.length === 1) {
      return nodeIds[0];
    }
    
    // Find the node with the lowest load factor
    let bestNodeId = nodeIds[0];
    let bestLoadFactor = Infinity;
    
    for (const nodeId of nodeIds) {
      const node = this.nodes.get(nodeId);
      
      if (node && node.metrics.loadFactor < bestLoadFactor) {
        bestNodeId = nodeId;
        bestLoadFactor = node.metrics.loadFactor;
      }
    }
    
    return bestNodeId;
  }
  
  /**
   * Get the closest node to a location from a list of nodes
   * 
   * @param location Location to find the closest node to
   * @param nodeIds Array of node IDs to choose from
   * @returns The node ID closest to the location
   */
  private getClosestNode(location: string, nodeIds: string[]): string {
    if (nodeIds.length === 0) {
      throw new Error('No nodes provided');
    }
    
    if (nodeIds.length === 1) {
      return nodeIds[0];
    }
    
    // Calculate distance to each node
    const nodeDistances = nodeIds.map(nodeId => {
      const node = this.nodes.get(nodeId);
      
      if (!node) {
        return { nodeId, distance: Infinity };
      }
      
      const distance = this.getLocationDistance(location, node.location);
      
      return { nodeId, distance };
    });
    
    // Sort by distance (ascending)
    nodeDistances.sort((a, b) => a.distance - b.distance);
    
    // If there are multiple nodes at the same closest distance,
    // choose the one with the best metrics
    const closestDistance = nodeDistances[0].distance;
    const closestNodes = nodeDistances
      .filter(node => node.distance === closestDistance)
      .map(node => node.nodeId);
    
    if (closestNodes.length === 1) {
      return closestNodes[0];
    }
    
    return this.getNodeByMetrics(closestNodes);
  }
}
