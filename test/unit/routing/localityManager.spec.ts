/**
 * Locality Manager Tests
 * 
 * This file contains tests for the EdgeLocalityManager implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EdgeLocalityManager } from '../../../src/routing/localityManager';
import { NodeMetrics } from '../../../src/routing/interfaces';

describe('EdgeLocalityManager', () => {
  let localityManager: EdgeLocalityManager;
  
  beforeEach(() => {
    localityManager = new EdgeLocalityManager();
    
    // Register some test nodes
    localityManager.registerNode('node1', 'us-east');
    localityManager.registerNode('node2', 'us-west');
    localityManager.registerNode('node3', 'eu-west');
  });
  
  it('should register client locations', () => {
    localityManager.registerClient('client1', 'us-east');
    localityManager.registerClient('client2', 'eu-west');
    
    // We don't have a direct way to test this, but we can test the behavior
    // by checking if getOptimalNode returns the expected results
    const usEastNodes = ['node1', 'node2', 'node3'];
    const euWestNodes = ['node1', 'node2', 'node3'];
    
    expect(localityManager.getOptimalNode('client1', usEastNodes)).toBe('node1');
    expect(localityManager.getOptimalNode('client2', euWestNodes)).toBe('node3');
  });
  
  it('should return the first node if client location is unknown', () => {
    const nodes = ['node1', 'node2', 'node3'];
    expect(localityManager.getOptimalNode('unknown-client', nodes)).toBe('node1');
  });
  
  it('should return the provided node if only one option is available', () => {
    localityManager.registerClient('client1', 'us-east');
    
    const singleNode = ['node2'];
    expect(localityManager.getOptimalNode('client1', singleNode)).toBe('node2');
  });
  
  it('should throw an error if no nodes are provided', () => {
    expect(() => {
      localityManager.getOptimalNode('client1', []);
    }).toThrow('No possible nodes provided');
  });
  
  it('should update node metrics and affect node selection', () => {
    // Register clients
    localityManager.registerClient('client1', 'us-east');
    localityManager.registerClient('client2', 'us-east');
    
    // Initially, node1 should be preferred for us-east
    const nodes = ['node1', 'node2', 'node3'];
    expect(localityManager.getOptimalNode('client1', nodes)).toBe('node1');
    
    // Update metrics to make node1 less desirable
    const poorMetrics: NodeMetrics = {
      latency: 500, // High latency
      loadFactor: 0.9, // High load
      availability: 0.8 // Lower availability
    };
    
    localityManager.updateNodeMetrics('node1', poorMetrics);
    
    // Now a different node should be preferred
    // Since node2 and node3 have default metrics, one of them should be chosen
    const newPreferredNode = localityManager.getOptimalNode('client2', nodes);
    expect(newPreferredNode).not.toBe('node1');
  });
  
  it('should handle node removal', () => {
    // Register a client
    localityManager.registerClient('client1', 'us-east');
    
    // Initially, node1 should be preferred for us-east
    const initialNodes = ['node1', 'node2', 'node3'];
    expect(localityManager.getOptimalNode('client1', initialNodes)).toBe('node1');
    
    // Remove node1
    localityManager.removeNode('node1');
    
    // Now, with node1 removed, a different node should be returned
    const remainingNodes = ['node1', 'node2', 'node3']; // We still pass all nodes
    const newPreferredNode = localityManager.getOptimalNode('client1', remainingNodes);
    
    // Since node1 is removed from internal tracking, it shouldn't be selected
    // even though it's in the provided array
    expect(newPreferredNode).not.toBe('node1');
  });
  
  it('should get all known locations', () => {
    const locations = localityManager.getLocations();
    expect(locations).toContain('us-east');
    expect(locations).toContain('us-west');
    expect(locations).toContain('eu-west');
    expect(locations.length).toBe(3);
  });
  
  it('should get nodes for a specific location', () => {
    const usEastNodes = localityManager.getNodesForLocation('us-east');
    expect(usEastNodes).toContain('node1');
    expect(usEastNodes.length).toBe(1);
    
    const euWestNodes = localityManager.getNodesForLocation('eu-west');
    expect(euWestNodes).toContain('node3');
    expect(euWestNodes.length).toBe(1);
  });
  
  it('should return empty array for unknown location', () => {
    const nodes = localityManager.getNodesForLocation('unknown-location');
    expect(nodes).toEqual([]);
  });
});
