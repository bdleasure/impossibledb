/**
 * ImpossibleDB Common Types
 * 
 * This file contains common TypeScript interfaces and types used throughout the ImpossibleDB system.
 */

/**
 * Document interface representing a stored document
 */
export interface Document {
  _id: string;
  _collection: string;
  _version: number;
  _createdAt: number;
  _updatedAt: number;
  [key: string]: any;
}

/**
 * Query filter for filtering documents
 */
export interface QueryFilter {
  field: string;
  operator: '=' | '!=' | '>' | '>=' | '<' | '<=';
  value: any;
}

/**
 * Query options for pagination and sorting
 */
export interface QueryOptions {
  limit?: number;
  offset?: number;
  sort?: { field: string; direction: 'asc' | 'desc' }[];
}

/**
 * Query result interface
 */
export interface QueryResult {
  results: Document[];
  metadata: {
    total: number;
    limit: number;
    offset: number;
  };
}

/**
 * Error codes for standardized error handling
 */
export enum ErrorCode {
  // General errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  
  // Document errors
  DOCUMENT_NOT_FOUND = 'DOCUMENT_NOT_FOUND',
  DOCUMENT_ALREADY_EXISTS = 'DOCUMENT_ALREADY_EXISTS',
  DOCUMENT_TOO_LARGE = 'DOCUMENT_TOO_LARGE',
  INVALID_DOCUMENT = 'INVALID_DOCUMENT',
  
  // Query errors
  INVALID_QUERY = 'INVALID_QUERY',
  QUERY_TIMEOUT = 'QUERY_TIMEOUT',
  
  // Transaction errors
  TRANSACTION_CONFLICT = 'TRANSACTION_CONFLICT',
  TRANSACTION_TIMEOUT = 'TRANSACTION_TIMEOUT',
  TRANSACTION_ABORTED = 'TRANSACTION_ABORTED',
  
  // Routing errors
  NO_SHARDS_AVAILABLE = 'NO_SHARDS_AVAILABLE',
  SHARD_NOT_FOUND = 'SHARD_NOT_FOUND',
  
  // System errors
  SYSTEM_OVERLOADED = 'SYSTEM_OVERLOADED',
  MAINTENANCE_MODE = 'MAINTENANCE_MODE'
}

/**
 * Standard error response
 */
export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: any;
  };
}

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log entry structure
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: Record<string, any>;
}

/**
 * Performance metrics for nodes
 */
export interface NodeMetrics {
  latency: number;
  loadFactor: number;
  availability: number;
}

/**
 * Worker environment interface
 */
export interface Env {
  // Durable Object namespace bindings
  STORAGE_OBJECT: DurableObjectNamespace;
  
  // Environment variables
  ENVIRONMENT?: string;
  
  // KV namespace bindings (for future use)
  CONFIG_KV?: KVNamespace;
  ROUTING_KV?: KVNamespace;
}

/**
 * Transaction operation types
 */
export enum TransactionOperationType {
  READ = 'READ',
  WRITE = 'WRITE',
  DELETE = 'DELETE'
}

/**
 * Transaction operation
 */
export interface TransactionOperation {
  type: TransactionOperationType;
  collection: string;
  documentId: string;
  data?: any;
}

/**
 * Transaction status
 */
export enum TransactionStatus {
  PENDING = 'PENDING',
  COMMITTED = 'COMMITTED',
  ABORTED = 'ABORTED',
  TIMED_OUT = 'TIMED_OUT'
}

/**
 * Transaction record
 */
export interface Transaction {
  id: string;
  operations: TransactionOperation[];
  status: TransactionStatus;
  timestamp: number;
  expiresAt: number;
}
