/**
 * ImpossibleDB Configuration
 * 
 * This file contains configuration constants used throughout the ImpossibleDB system.
 * Centralizing configuration here makes it easier to adjust settings across environments.
 */

// Determine environment
export type EnvironmentType = 'development' | 'production' | 'test';

// Default to development, can be overridden by environment bindings in wrangler.toml
export const ENVIRONMENT: EnvironmentType = 'development';

// This function will be used to get the environment from the env object at runtime
export function getEnvironment(env?: Record<string, any>): EnvironmentType {
  if (env && typeof env.ENVIRONMENT === 'string') {
    const envValue = env.ENVIRONMENT.toLowerCase();
    if (envValue === 'production' || envValue === 'development' || envValue === 'test') {
      return envValue as EnvironmentType;
    }
  }
  return ENVIRONMENT;
}

// General configuration
export const CONFIG = {
  // Version information
  VERSION: '0.1.0',
  
  // Default limits
  MAX_DOCUMENT_SIZE: 1024 * 1024, // 1MB
  MAX_BATCH_SIZE: 100,
  MAX_QUERY_RESULTS: 1000,
  
  // Timeouts (in milliseconds)
  REQUEST_TIMEOUT: 30000, // 30 seconds
  TRANSACTION_TIMEOUT: 10000, // 10 seconds
  
  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_BACKOFF_MS: 100, // Base backoff time in ms
  
  // Routing configuration
  VIRTUAL_NODES_PER_PHYSICAL: 100,
  LOCALITY_REFRESH_INTERVAL: 60 * 60 * 1000, // 1 hour
  
  // Logging
  LOG_LEVEL: 'debug', // Will be overridden by environment-specific config
  
  // Cache settings
  CACHE_TTL: 60, // 60 seconds
  
  // Performance thresholds
  LATENCY_THRESHOLD_MS: 100,
  LOAD_FACTOR_THRESHOLD: 0.8,
  
  // Feature flags
  FEATURES: {
    ENABLE_TRANSACTIONS: true,
    ENABLE_QUERY_OPTIMIZATION: true,
    ENABLE_AUTOMATIC_SHARDING: true,
    ENABLE_LOCALITY_AWARENESS: true
  }
};

// Environment-specific configuration
export const ENV_CONFIG = {
  development: {
    LOG_LEVEL: 'debug',
    CACHE_TTL: 5, // 5 seconds in development
    FEATURES: {
      ...CONFIG.FEATURES,
      ENABLE_DETAILED_LOGGING: true
    }
  },
  production: {
    LOG_LEVEL: 'info',
    CACHE_TTL: 60, // 60 seconds in production
    FEATURES: {
      ...CONFIG.FEATURES,
      ENABLE_DETAILED_LOGGING: false
    }
  },
  test: {
    LOG_LEVEL: 'debug',
    CACHE_TTL: 0, // No caching in tests
    FEATURES: {
      ...CONFIG.FEATURES,
      ENABLE_DETAILED_LOGGING: true
    }
  }
};


/**
 * Get the configuration for a specific environment
 * This function should be called at runtime with the current environment
 */
export function getConfig(environment: EnvironmentType = ENVIRONMENT) {
  return {
    ...CONFIG,
    ...(ENV_CONFIG[environment] || ENV_CONFIG.development)
  };
}

// Default configuration (will be properly initialized at runtime)
export const CURRENT_CONFIG = getConfig();

// Export specific constants for convenience
export const LOG_LEVEL = CURRENT_CONFIG.LOG_LEVEL;
export const FEATURES = CURRENT_CONFIG.FEATURES;
