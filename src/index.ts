/**
 * ImpossibleDB: Main Worker Entry Point
 * 
 * This file serves as the entry point for the Cloudflare Worker that manages
 * routing and coordination between different Durable Objects that make up
 * the ImpossibleDB system.
 */

import { StorageObject } from './objects/StorageObject';
import { ShardRouter } from './routing/router';
import { ConsistentHashRing } from './routing/consistentHash';
import { EdgeLocalityManager } from './routing/localityManager';
import { Env, ErrorCode } from './types';
import { getEnvironment, getConfig } from './config';
import { createLogger } from './utils/logger';
import { ImpossibleDBError, handleError, withErrorHandling } from './utils/errorHandler';
import { validateCollectionName, validateDocumentId } from './utils/validation';

// Create a logger for this module
const logger = createLogger('worker');

// Initialize the routing components
// These will be properly initialized in the fetch handler with environment-specific settings
let hashRing: ConsistentHashRing;
let localityManager: EdgeLocalityManager;
let router: ShardRouter;

/**
 * Initialize the routing components with environment-specific settings
 */
function initializeRouting(env: Env) {
  const environment = getEnvironment(env);
  const config = getConfig(environment);
  
  // Create routing components with configuration
  hashRing = new ConsistentHashRing(config.VIRTUAL_NODES_PER_PHYSICAL);
  localityManager = new EdgeLocalityManager();
  router = new ShardRouter(hashRing, localityManager);
  
  // In production, we would load node configuration from KV storage
  // For now, we'll use some default nodes for development
  if (environment !== 'production' || !env.ROUTING_KV) {
    // Add some example nodes to the hash ring
    hashRing.addNode('node-1');
    hashRing.addNode('node-2');
    hashRing.addNode('node-3');
    
    // Register nodes with locations
    localityManager.registerNode('node-1', 'us-east');
    localityManager.registerNode('node-2', 'us-west');
    localityManager.registerNode('node-3', 'eu-west');
  } else {
    // In production, we would load node configuration from KV storage
    // This would be implemented when we have KV storage set up
  }
  
  return { hashRing, localityManager, router };
}

export default {
  /**
   * Main fetch handler for the worker
   */
  fetch: withErrorHandling(async (request: Request, env: Env): Promise<Response> => {
    // Initialize routing components if not already initialized
    if (!router) {
      const routingComponents = initializeRouting(env);
      hashRing = routingComponents.hashRing;
      localityManager = routingComponents.localityManager;
      router = routingComponents.router;
    }
    
    const url = new URL(request.url);
    const path = url.pathname.split('/').filter(Boolean);
    
    logger.debug('Received request', { method: request.method, path: url.pathname });
    
    // Handle API requests
    if (path[0] === 'api') {
      // For now, we're using a simple approach to determine which shard to use
      // In a real implementation, this would involve the Sharding/Routing layer
      if (path.length >= 3 && path[1] === 'data') {
        // For simple MVP: /api/data/{collection}/{id}
        const collection = path[2];
        const id = path[3];
        
        // Validate collection name
        validateCollectionName(collection);
        
        if (!id && request.method === 'POST') {
          // Handle query request
          return await handleQueryRequest(request, env, collection);
        } else if (id) {
          // Validate document ID
          validateDocumentId(id);
          
          // Handle CRUD requests
          return await handleCrudRequest(request, env, collection, id);
        }
      }
    }
    
    // Handle health check endpoint
    if (path[0] === 'health') {
      const environment = getEnvironment(env);
      const config = getConfig(environment);
      
      return new Response(JSON.stringify({
        status: 'ok',
        version: config.VERSION,
        environment: environment,
        features: config.FEATURES
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Return a simple welcome page if no API route matches
    if (path.length === 0) {
      const environment = getEnvironment(env);
      const config = getConfig(environment);
      
      return new Response(`
        <html>
          <body>
            <h1>ImpossibleDB</h1>
            <p>The Impossibly Fast Global Database Built on Cloudflare Durable Objects</p>
            <p>API is available at /api/data/...</p>
            <p>Version: ${config.VERSION}</p>
            <p>Environment: ${environment}</p>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    // If we get here, no route matched
    logger.warn('Route not found', { method: request.method, path: url.pathname });
    throw new ImpossibleDBError(
      ErrorCode.NOT_FOUND,
      'Route not found'
    );
  })
};

/**
 * Handles CRUD operations (GET, PUT, DELETE) on documents
 */
async function handleCrudRequest(
  request: Request, 
  env: Env, 
  collection: string, 
  id: string
): Promise<Response> {
  try {
    logger.debug('Handling CRUD request', { method: request.method, collection, id });
    
    // Extract client ID from headers or cookies if available
    const clientId = request.headers.get('x-client-id') || 'anonymous';
    
    // Use the router to determine which shard to route to
    const shardId = router.routeRequest(collection, id, clientId);
    
    logger.debug('Routing to shard', { shardId, collection, id, clientId });
    
    // Create a Durable Object ID from the shard ID
    const storageObjectId = env.STORAGE_OBJECT.idFromString(shardId);
    const storageObject = env.STORAGE_OBJECT.get(storageObjectId);
    
    // Forward the request to the appropriate shard
    const shardUrl = new URL(request.url);
    shardUrl.pathname = `/${collection}/${id}`;
    
    const shardRequest = new Request(shardUrl.toString(), request);
    return await storageObject.fetch(shardRequest);
  } catch (error) {
    logger.error('Error handling CRUD request', error as Error, { collection, id });
    throw error;
  }
}

/**
 * Handles query operations on collections
 */
async function handleQueryRequest(
  request: Request, 
  env: Env, 
  collection: string
): Promise<Response> {
  try {
    logger.debug('Handling query request', { collection });
    
    // Parse the request body to get filters
    let body;
    try {
      body = await request.json() as {
        collection: string;
        filters?: { field: string; operator: string; value: any }[];
        options?: { limit?: number; offset?: number; sort?: { field: string; direction: 'asc' | 'desc' }[] };
      };
    } catch (error) {
      logger.warn('Invalid JSON in query request body', { error: (error as Error).message });
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Invalid JSON in request body'
      );
    }
    
    const filters = body.filters || [];
    
    // Use the router to determine which shards to query
    const shardIds = router.getShardsForQuery(collection, filters[0]);
    
    logger.debug('Query shards determined', { collection, shardCount: shardIds.length });
    
    // For MVP, we'll still send the query to a single shard
    // In a full implementation, we would query all relevant shards and aggregate results
    if (shardIds.length > 0) {
      const shardId = shardIds[0]; // Just use the first shard for now
      const storageObjectId = env.STORAGE_OBJECT.idFromString(shardId);
      const storageObject = env.STORAGE_OBJECT.get(storageObjectId);
      
      // Forward the query to the shard
      const shardUrl = new URL(request.url);
      shardUrl.pathname = '/query';
      
      const shardRequest = new Request(shardUrl.toString(), {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(body)
      });
      
      return await storageObject.fetch(shardRequest);
    }
    
    // If no shards found, return empty results
    logger.debug('No shards found for query', { collection });
    return new Response(JSON.stringify({ 
      results: [],
      metadata: {
        total: 0,
        limit: body.options?.limit || getConfig(getEnvironment(env)).MAX_QUERY_RESULTS,
        offset: body.options?.offset || 0
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logger.error('Error handling query request', error as Error, { collection });
    throw error;
  }
}


// Export the Durable Object class
export { StorageObject };
