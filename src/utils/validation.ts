/**
 * Validation Utility
 * 
 * This file provides validation functions for ImpossibleDB.
 * It helps ensure data integrity and proper input validation.
 */

import { ErrorCode } from '../types';
import { ImpossibleDBError } from './errorHandler';
import { CONFIG } from '../config';

/**
 * Validates a document ID
 * 
 * @param id The document ID to validate
 * @throws ImpossibleDBError if the ID is invalid
 */
export function validateDocumentId(id: string): void {
  if (!id) {
    throw new ImpossibleDBError(
      ErrorCode.INVALID_DOCUMENT,
      'Document ID cannot be empty'
    );
  }
  
  if (typeof id !== 'string') {
    throw new ImpossibleDBError(
      ErrorCode.INVALID_DOCUMENT,
      'Document ID must be a string'
    );
  }
  
  if (id.length > 100) {
    throw new ImpossibleDBError(
      ErrorCode.INVALID_DOCUMENT,
      'Document ID cannot exceed 100 characters'
    );
  }
  
  // Disallow special characters that could cause issues
  if (!/^[a-zA-Z0-9_\-:.]+$/.test(id)) {
    throw new ImpossibleDBError(
      ErrorCode.INVALID_DOCUMENT,
      'Document ID can only contain alphanumeric characters, underscores, hyphens, colons, and periods'
    );
  }
}

/**
 * Validates a collection name
 * 
 * @param collection The collection name to validate
 * @throws ImpossibleDBError if the collection name is invalid
 */
export function validateCollectionName(collection: string): void {
  if (!collection) {
    throw new ImpossibleDBError(
      ErrorCode.INVALID_REQUEST,
      'Collection name cannot be empty'
    );
  }
  
  if (typeof collection !== 'string') {
    throw new ImpossibleDBError(
      ErrorCode.INVALID_REQUEST,
      'Collection name must be a string'
    );
  }
  
  if (collection.length > 50) {
    throw new ImpossibleDBError(
      ErrorCode.INVALID_REQUEST,
      'Collection name cannot exceed 50 characters'
    );
  }
  
  // Only allow alphanumeric characters and underscores
  if (!/^[a-zA-Z0-9_]+$/.test(collection)) {
    throw new ImpossibleDBError(
      ErrorCode.INVALID_REQUEST,
      'Collection name can only contain alphanumeric characters and underscores'
    );
  }
  
  // Disallow reserved collection names
  const reservedNames = ['__collections', '__system', '__metadata', '__index'];
  if (reservedNames.includes(collection)) {
    throw new ImpossibleDBError(
      ErrorCode.INVALID_REQUEST,
      `Collection name '${collection}' is reserved for system use`
    );
  }
}

/**
 * Validates a document object
 * 
 * @param document The document to validate
 * @throws ImpossibleDBError if the document is invalid
 */
export function validateDocument(document: any): void {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new ImpossibleDBError(
      ErrorCode.INVALID_DOCUMENT,
      'Document must be a non-null object'
    );
  }
  
  // Check document size
  const documentSize = JSON.stringify(document).length;
  if (documentSize > CONFIG.MAX_DOCUMENT_SIZE) {
    throw new ImpossibleDBError(
      ErrorCode.DOCUMENT_TOO_LARGE,
      `Document size (${documentSize} bytes) exceeds maximum allowed size (${CONFIG.MAX_DOCUMENT_SIZE} bytes)`
    );
  }
  
  // Validate that there are no reserved field names
  const reservedFields = ['_id', '_collection', '_version', '_createdAt', '_updatedAt'];
  for (const field of reservedFields) {
    if (document[field] !== undefined) {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_DOCUMENT,
        `Document cannot contain reserved field '${field}'`
      );
    }
  }
}

/**
 * Validates query filters
 * 
 * @param filters The filters to validate
 * @throws ImpossibleDBError if the filters are invalid
 */
export function validateQueryFilters(filters: any[]): void {
  if (!Array.isArray(filters)) {
    throw new ImpossibleDBError(
      ErrorCode.INVALID_QUERY,
      'Filters must be an array'
    );
  }
  
  for (const filter of filters) {
    if (!filter || typeof filter !== 'object') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        'Each filter must be an object'
      );
    }
    
    if (!filter.field || typeof filter.field !== 'string') {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        'Filter must have a valid field name'
      );
    }
    
    const validOperators = ['=', '!=', '>', '>=', '<', '<='];
    if (!filter.operator || !validOperators.includes(filter.operator)) {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        `Filter operator must be one of: ${validOperators.join(', ')}`
      );
    }
    
    if (filter.value === undefined) {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        'Filter must have a value'
      );
    }
  }
}

/**
 * Validates query options
 * 
 * @param options The options to validate
 * @throws ImpossibleDBError if the options are invalid
 */
export function validateQueryOptions(options: any): void {
  if (!options || typeof options !== 'object') {
    throw new ImpossibleDBError(
      ErrorCode.INVALID_QUERY,
      'Options must be an object'
    );
  }
  
  if (options.limit !== undefined) {
    if (typeof options.limit !== 'number' || options.limit <= 0) {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        'Limit must be a positive number'
      );
    }
    
    if (options.limit > CONFIG.MAX_QUERY_RESULTS) {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        `Limit cannot exceed ${CONFIG.MAX_QUERY_RESULTS}`
      );
    }
  }
  
  if (options.offset !== undefined) {
    if (typeof options.offset !== 'number' || options.offset < 0) {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        'Offset must be a non-negative number'
      );
    }
  }
  
  if (options.sort !== undefined) {
    if (!Array.isArray(options.sort)) {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_QUERY,
        'Sort must be an array'
      );
    }
    
    for (const sortOption of options.sort) {
      if (!sortOption || typeof sortOption !== 'object') {
        throw new ImpossibleDBError(
          ErrorCode.INVALID_QUERY,
          'Each sort option must be an object'
        );
      }
      
      if (!sortOption.field || typeof sortOption.field !== 'string') {
        throw new ImpossibleDBError(
          ErrorCode.INVALID_QUERY,
          'Sort option must have a valid field name'
        );
      }
      
      if (sortOption.direction !== 'asc' && sortOption.direction !== 'desc') {
        throw new ImpossibleDBError(
          ErrorCode.INVALID_QUERY,
          "Sort direction must be 'asc' or 'desc'"
        );
      }
    }
  }
}
