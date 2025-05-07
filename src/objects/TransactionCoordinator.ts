/**
 * TransactionCoordinator.ts
 * 
 * Implements a Durable Object that coordinates distributed transactions in ImpossibleDB.
 * The TransactionCoordinator is responsible for:
 * - Managing the two-phase commit protocol
 * - Ensuring transaction atomicity across multiple shards
 * - Handling transaction timeouts and recovery
 */

import { createLogger } from '../utils/logger';
import { ImpossibleDBError, handleError } from '../utils/errorHandler';
import { ErrorCode, TransactionOperation, TransactionStatus } from '../types';
import { CONFIG } from '../config';

// Create a logger for this module
const logger = createLogger('TransactionCoordinator');

/**
 * Transaction state
 */
interface TransactionState {
  id: string;
  status: 'PENDING' | 'PREPARING' | 'PREPARED' | 'COMMITTING' | 'COMMITTED' | 'ABORTING' | 'ABORTED';
  operations: TransactionOperation[];
  participants: string[];
  preparedParticipants: Set<string>;
  committedParticipants: Set<string>;
  abortedParticipants: Set<string>;
  startedAt: number;
  expiresAt: number;
  preparedAt?: number;
  committedAt?: number;
  abortedAt?: number;
  error?: string;
}

/**
 * TransactionCoordinator Durable Object
 */
export class TransactionCoordinator implements DurableObject {
  private state: DurableObjectState;
  private transactions: Map<string, TransactionState> = new Map();
  private transactionTimeouts: Map<string, number> = new Map();
  
  constructor(state: DurableObjectState) {
    this.state = state;
    
    this.state.blockConcurrencyWhile(async () => {
      await this.loadState();
    });
    
    logger.debug('TransactionCoordinator initialized');
  }
  
  /**
   * Loads the transaction state from storage
   */
  private async loadState(): Promise<void> {
    try {
      // Load transactions
      const transactionEntries = await this.state.storage.list<TransactionState>({ prefix: 'tx:' });
      
      for (const [key, transaction] of transactionEntries) {
        const txId = key.substring(3); // Remove 'tx:' prefix
        
        // Convert arrays to Sets
        transaction.preparedParticipants = new Set(Array.from(transaction.preparedParticipants));
        transaction.committedParticipants = new Set(Array.from(transaction.committedParticipants));
        transaction.abortedParticipants = new Set(Array.from(transaction.abortedParticipants));
        
        this.transactions.set(txId, transaction);
        
        // Set up timeouts for active transactions
        if (transaction.status === 'PENDING' || transaction.status === 'PREPARING' || transaction.status === 'PREPARED') {
          this.scheduleTransactionTimeout(txId, transaction);
        }
      }
      
      logger.debug('State loaded', { transactionCount: this.transactions.size });
    } catch (error) {
      logger.error('Failed to load state', error as Error);
      throw new ImpossibleDBError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to initialize transaction coordinator'
      );
    }
  }
  
  /**
   * Saves a transaction to storage
   */
  private async saveTransaction(txId: string, transaction: TransactionState): Promise<void> {
    try {
      // Convert Sets to arrays for storage
      const storageTransaction = {
        ...transaction,
        preparedParticipants: Array.from(transaction.preparedParticipants),
        committedParticipants: Array.from(transaction.committedParticipants),
        abortedParticipants: Array.from(transaction.abortedParticipants)
      };
      
      await this.state.storage.put(`tx:${txId}`, storageTransaction);
      this.transactions.set(txId, transaction);
      logger.debug('Transaction saved', { txId, status: transaction.status });
    } catch (error) {
      logger.error('Failed to save transaction', error as Error);
      throw new ImpossibleDBError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to save transaction state',
        { originalError: (error as Error).message }
      );
    }
  }
  
  /**
   * Schedules a timeout for a transaction
   */
  private scheduleTransactionTimeout(txId: string, transaction: TransactionState): void {
    const now = Date.now();
    const timeRemaining = Math.max(0, transaction.expiresAt - now);
    
    if (timeRemaining > 0) {
      const timeoutId = setTimeout(() => {
        this.handleTransactionTimeout(txId).catch(error => {
          logger.error('Error handling transaction timeout', error as Error);
        });
      }, timeRemaining);
      
      this.transactionTimeouts.set(txId, timeoutId as unknown as number);
      logger.debug('Transaction timeout scheduled', { txId, timeRemaining });
    } else {
      // Transaction already expired
      this.handleTransactionTimeout(txId).catch(error => {
        logger.error('Error handling expired transaction', error as Error);
      });
    }
  }
  
  /**
   * Handles a transaction timeout
   */
  private async handleTransactionTimeout(txId: string): Promise<void> {
    logger.warn('Transaction timed out', { txId });
    
    const transaction = this.transactions.get(txId);
    if (!transaction) {
      logger.warn('Transaction not found for timeout handling', { txId });
      return;
    }
    
    // Clear the timeout
    this.clearTransactionTimeout(txId);
    
    // If the transaction is still in progress, abort it
    if (transaction.status === 'PENDING' || transaction.status === 'PREPARING' || transaction.status === 'PREPARED') {
      transaction.status = 'ABORTING';
      transaction.error = 'Transaction timed out';
      
      // Save the updated transaction
      await this.saveTransaction(txId, transaction);
      
      // Abort the transaction on all participants
      await this.abortTransaction(txId, transaction);
    }
  }
  
  /**
   * Clears a transaction timeout
   */
  private clearTransactionTimeout(txId: string): void {
    const timeoutId = this.transactionTimeouts.get(txId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.transactionTimeouts.delete(txId);
      logger.debug('Transaction timeout cleared', { txId });
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
          transactionCount: this.transactions.size
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Transaction operations
      if (path[0] === 'transactions') {
        if (request.method === 'POST' && path.length === 1) {
          return await this.handleCreateTransaction(request);
        } else if (request.method === 'GET' && path.length === 2) {
          const txId = path[1];
          return this.handleGetTransaction(txId);
        } else if (request.method === 'POST' && path.length === 3 && path[2] === 'prepare') {
          const txId = path[1];
          return await this.handlePrepareTransaction(txId, request);
        } else if (request.method === 'POST' && path.length === 3 && path[2] === 'commit') {
          const txId = path[1];
          return await this.handleCommitTransaction(txId, request);
        } else if (request.method === 'POST' && path.length === 3 && path[2] === 'abort') {
          const txId = path[1];
          return await this.handleAbortTransaction(txId, request);
        } else if (request.method === 'POST' && path.length === 3 && path[2] === 'prepared') {
          const txId = path[1];
          return await this.handleParticipantPrepared(txId, request);
        } else if (request.method === 'POST' && path.length === 3 && path[2] === 'committed') {
          const txId = path[1];
          return await this.handleParticipantCommitted(txId, request);
        } else if (request.method === 'POST' && path.length === 3 && path[2] === 'aborted') {
          const txId = path[1];
          return await this.handleParticipantAborted(txId, request);
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
   * Handles a request to create a new transaction
   */
  private async handleCreateTransaction(request: Request): Promise<Response> {
    let requestBody;
    try {
      requestBody = await request.json() as {
        operations: TransactionOperation[];
        timeout?: number;
      };
    } catch (error) {
      logger.warn('Invalid JSON in request body', { error: (error as Error).message });
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Invalid JSON in request body'
      );
    }
    
    const { operations, timeout = CONFIG.TRANSACTION_TIMEOUT } = requestBody;
    
    // Validate operations
    if (!operations || !Array.isArray(operations) || operations.length === 0) {
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Transaction must include at least one operation'
      );
    }
    
    // Generate a transaction ID
    const txId = crypto.randomUUID();
    
    // Determine participants (shards) involved in the transaction
    const participants = this.getParticipants(operations);
    
    // Create the transaction
    const now = Date.now();
    const transaction: TransactionState = {
      id: txId,
      status: 'PENDING',
      operations,
      participants,
      preparedParticipants: new Set(),
      committedParticipants: new Set(),
      abortedParticipants: new Set(),
      startedAt: now,
      expiresAt: now + timeout
    };
    
    // Save the transaction
    await this.saveTransaction(txId, transaction);
    
    // Schedule transaction timeout
    this.scheduleTransactionTimeout(txId, transaction);
    
    return new Response(JSON.stringify({
      transactionId: txId,
      status: transaction.status,
      participants,
      expiresAt: transaction.expiresAt
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  /**
   * Handles a request to get transaction status
   */
  private handleGetTransaction(txId: string): Response {
    const transaction = this.transactions.get(txId);
    if (!transaction) {
      logger.warn('Transaction not found', { txId });
      throw new ImpossibleDBError(
        ErrorCode.NOT_FOUND,
        `Transaction not found: ${txId}`
      );
    }
    
    return new Response(JSON.stringify({
      transactionId: txId,
      status: transaction.status,
      participants: transaction.participants,
      preparedParticipants: Array.from(transaction.preparedParticipants),
      committedParticipants: Array.from(transaction.committedParticipants),
      abortedParticipants: Array.from(transaction.abortedParticipants),
      startedAt: transaction.startedAt,
      expiresAt: transaction.expiresAt,
      preparedAt: transaction.preparedAt,
      committedAt: transaction.committedAt,
      abortedAt: transaction.abortedAt,
      error: transaction.error
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  /**
   * Handles a request to prepare a transaction
   */
  private async handlePrepareTransaction(txId: string, request: Request): Promise<Response> {
    const transaction = this.transactions.get(txId);
    if (!transaction) {
      logger.warn('Transaction not found', { txId });
      throw new ImpossibleDBError(
        ErrorCode.NOT_FOUND,
        `Transaction not found: ${txId}`
      );
    }
    
    // Check if transaction is in a valid state for preparation
    if (transaction.status !== 'PENDING') {
      logger.warn('Transaction not in PENDING state', { txId, status: transaction.status });
      return new Response(JSON.stringify({
        success: false,
        error: `Transaction not in PENDING state: ${transaction.status}`
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Update transaction status
    transaction.status = 'PREPARING';
    await this.saveTransaction(txId, transaction);
    
    try {
      // Send prepare requests to all participants
      const preparePromises = transaction.participants.map(async (participantId) => {
        const participantUrl = this.getParticipantUrl(participantId);
        
        const response = await fetch(`${participantUrl}/transactions/prepare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: txId,
            coordinatorId: this.state.id,
            operations: this.getOperationsForParticipant(transaction.operations, participantId),
            expiresAt: transaction.expiresAt
          })
        });
        
        if (!response.ok) {
          const errorData = await response.json() as { error?: string };
          throw new Error(`Participant ${participantId} failed to prepare: ${errorData.error || response.statusText}`);
        }
        
        return participantId;
      });
      
      // Wait for all prepare requests to complete
      await Promise.all(preparePromises);
      
      // Update transaction status
      transaction.status = 'PREPARED';
      transaction.preparedAt = Date.now();
      await this.saveTransaction(txId, transaction);
      
      return new Response(JSON.stringify({
        success: true,
        transactionId: txId,
        status: transaction.status
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      logger.error('Error preparing transaction', error as Error);
      
      // Update transaction status
      transaction.status = 'ABORTING';
      transaction.error = (error as Error).message;
      await this.saveTransaction(txId, transaction);
      
      // Abort the transaction on all participants
      await this.abortTransaction(txId, transaction);
      
      return new Response(JSON.stringify({
        success: false,
        error: (error as Error).message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  /**
   * Handles a request to commit a transaction
   */
  private async handleCommitTransaction(txId: string, request: Request): Promise<Response> {
    const transaction = this.transactions.get(txId);
    if (!transaction) {
      logger.warn('Transaction not found', { txId });
      throw new ImpossibleDBError(
        ErrorCode.NOT_FOUND,
        `Transaction not found: ${txId}`
      );
    }
    
    // Check if transaction is in a valid state for commit
    if (transaction.status !== 'PREPARED') {
      logger.warn('Transaction not in PREPARED state', { txId, status: transaction.status });
      return new Response(JSON.stringify({
        success: false,
        error: `Transaction not in PREPARED state: ${transaction.status}`
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Update transaction status
    transaction.status = 'COMMITTING';
    await this.saveTransaction(txId, transaction);
    
    try {
      // Send commit requests to all participants
      const commitPromises = transaction.participants.map(async (participantId) => {
        const participantUrl = this.getParticipantUrl(participantId);
        
        const response = await fetch(`${participantUrl}/transactions/${txId}/commit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          const errorData = await response.json() as { error?: string };
          throw new Error(`Participant ${participantId} failed to commit: ${errorData.error || response.statusText}`);
        }
        
        return participantId;
      });
      
      // Wait for all commit requests to complete
      await Promise.all(commitPromises);
      
      // Update transaction status
      transaction.status = 'COMMITTED';
      transaction.committedAt = Date.now();
      await this.saveTransaction(txId, transaction);
      
      // Clear the transaction timeout
      this.clearTransactionTimeout(txId);
      
      return new Response(JSON.stringify({
        success: true,
        transactionId: txId,
        status: transaction.status
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      logger.error('Error committing transaction', error as Error);
      
      return new Response(JSON.stringify({
        success: false,
        error: (error as Error).message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  /**
   * Aborts a transaction
   */
  private async abortTransaction(txId: string, transaction: TransactionState): Promise<void> {
    try {
      // Send abort requests to all participants that have been prepared
      const abortPromises = transaction.participants.map(async (participantId) => {
        const participantUrl = this.getParticipantUrl(participantId);
        
        try {
          const response = await fetch(`${participantUrl}/transactions/${txId}/abort`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (!response.ok) {
            const errorData = await response.json() as { error?: string };
            logger.warn(`Participant ${participantId} failed to abort: ${errorData.error || response.statusText}`);
          }
        } catch (error) {
          logger.warn(`Error aborting transaction on participant ${participantId}`, error as Error);
        }
      });
      
      // Wait for all abort requests to complete
      await Promise.all(abortPromises);
      
      // Update transaction status
      transaction.status = 'ABORTED';
      transaction.abortedAt = Date.now();
      await this.saveTransaction(txId, transaction);
      
      // Clear the transaction timeout
      this.clearTransactionTimeout(txId);
    } catch (error) {
      logger.error('Error aborting transaction', error as Error);
      throw error;
    }
  }
  
  /**
   * Handles a request to abort a transaction
   */
  private async handleAbortTransaction(txId: string, request: Request): Promise<Response> {
    const transaction = this.transactions.get(txId);
    if (!transaction) {
      logger.warn('Transaction not found', { txId });
      throw new ImpossibleDBError(
        ErrorCode.NOT_FOUND,
        `Transaction not found: ${txId}`
      );
    }
    
    // Check if transaction is already committed
    if (transaction.status === 'COMMITTED' || transaction.status === 'COMMITTING') {
      logger.warn('Cannot abort committed transaction', { txId, status: transaction.status });
      return new Response(JSON.stringify({
        success: false,
        error: `Cannot abort transaction in ${transaction.status} state`
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check if transaction is already aborted
    if (transaction.status === 'ABORTED') {
      return new Response(JSON.stringify({
        success: true,
        transactionId: txId,
        status: transaction.status
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Update transaction status
    transaction.status = 'ABORTING';
    await this.saveTransaction(txId, transaction);
    
    try {
      // Abort the transaction
      await this.abortTransaction(txId, transaction);
      
      return new Response(JSON.stringify({
        success: true,
        transactionId: txId,
        status: transaction.status
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      logger.error('Error aborting transaction', error as Error);
      
      return new Response(JSON.stringify({
        success: false,
        error: (error as Error).message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  /**
   * Handles a notification that a participant has prepared
   */
  private async handleParticipantPrepared(txId: string, request: Request): Promise<Response> {
    let requestBody;
    try {
      requestBody = await request.json() as {
        participantId: string;
      };
    } catch (error) {
      logger.warn('Invalid JSON in request body', { error: (error as Error).message });
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Invalid JSON in request body'
      );
    }
    
    const { participantId } = requestBody;
    
    const transaction = this.transactions.get(txId);
    if (!transaction) {
      logger.warn('Transaction not found', { txId });
      throw new ImpossibleDBError(
        ErrorCode.NOT_FOUND,
        `Transaction not found: ${txId}`
      );
    }
    
    // Add participant to prepared set
    transaction.preparedParticipants.add(participantId);
    await this.saveTransaction(txId, transaction);
    
    // Check if all participants are prepared
    if (transaction.status === 'PREPARING' && 
        transaction.preparedParticipants.size === transaction.participants.length) {
      // All participants are prepared, update transaction status
      transaction.status = 'PREPARED';
      transaction.preparedAt = Date.now();
      await this.saveTransaction(txId, transaction);
    }
    
    return new Response(JSON.stringify({
      success: true,
      transactionId: txId,
      status: transaction.status
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  /**
   * Handles a notification that a participant has committed
   */
  private async handleParticipantCommitted(txId: string, request: Request): Promise<Response> {
    let requestBody;
    try {
      requestBody = await request.json() as {
        participantId: string;
      };
    } catch (error) {
      logger.warn('Invalid JSON in request body', { error: (error as Error).message });
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Invalid JSON in request body'
      );
    }
    
    const { participantId } = requestBody;
    
    const transaction = this.transactions.get(txId);
    if (!transaction) {
      logger.warn('Transaction not found', { txId });
      throw new ImpossibleDBError(
        ErrorCode.NOT_FOUND,
        `Transaction not found: ${txId}`
      );
    }
    
    // Add participant to committed set
    transaction.committedParticipants.add(participantId);
    await this.saveTransaction(txId, transaction);
    
    // Check if all participants are committed
    if (transaction.status === 'COMMITTING' && 
        transaction.committedParticipants.size === transaction.participants.length) {
      // All participants are committed, update transaction status
      transaction.status = 'COMMITTED';
      transaction.committedAt = Date.now();
      await this.saveTransaction(txId, transaction);
      
      // Clear the transaction timeout
      this.clearTransactionTimeout(txId);
    }
    
    return new Response(JSON.stringify({
      success: true,
      transactionId: txId,
      status: transaction.status
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  /**
   * Handles a notification that a participant has aborted
   */
  private async handleParticipantAborted(txId: string, request: Request): Promise<Response> {
    let requestBody;
    try {
      requestBody = await request.json() as {
        participantId: string;
        error?: string;
      };
    } catch (error) {
      logger.warn('Invalid JSON in request body', { error: (error as Error).message });
      throw new ImpossibleDBError(
        ErrorCode.INVALID_REQUEST,
        'Invalid JSON in request body'
      );
    }
    
    const { participantId, error } = requestBody;
    
    const transaction = this.transactions.get(txId);
    if (!transaction) {
      logger.warn('Transaction not found', { txId });
      throw new ImpossibleDBError(
        ErrorCode.NOT_FOUND,
        `Transaction not found: ${txId}`
      );
    }
    
    // Add participant to aborted set
    transaction.abortedParticipants.add(participantId);
    
    // If this is the first abort, record the error
    if (!transaction.error && error) {
      transaction.error = `Aborted by participant ${participantId}: ${error}`;
    }
    
    await this.saveTransaction(txId, transaction);
    
    // If we're in PREPARING or PREPARED state, abort the transaction
    if (transaction.status === 'PREPARING' || transaction.status === 'PREPARED') {
      transaction.status = 'ABORTING';
      await this.saveTransaction(txId, transaction);
      
      // Abort the transaction on all participants
      await this.abortTransaction(txId, transaction);
    }
    // Check if all participants are aborted
    else if (transaction.status === 'ABORTING' && 
             transaction.abortedParticipants.size === transaction.participants.length) {
      // All participants are aborted, update transaction status
      transaction.status = 'ABORTED';
      transaction.abortedAt = Date.now();
      await this.saveTransaction(txId, transaction);
      
      // Clear the transaction timeout
      this.clearTransactionTimeout(txId);
    }
    
    return new Response(JSON.stringify({
      success: true,
      transactionId: txId,
      status: transaction.status
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  /**
   * Gets the URL for a participant
   */
  private getParticipantUrl(participantId: string): string {
    // In a real implementation, this would look up the participant URL from a registry
    // For now, we'll just use a placeholder
    return `https://storage-${participantId}.impossibledb.workers.dev`;
  }
  
  /**
   * Gets the participants (shards) involved in a transaction
   */
  private getParticipants(operations: TransactionOperation[]): string[] {
    // In a real implementation, this would determine the shards involved in the transaction
    // For now, we'll just extract unique collection names as a placeholder
    const collections = new Set<string>();
    
    for (const operation of operations) {
      collections.add(operation.collection);
    }
    
    // Convert collections to shard IDs (placeholder implementation)
    return Array.from(collections).map(collection => `shard-${collection}`);
  }
  
  /**
   * Gets the operations for a specific participant
   */
  private getOperationsForParticipant(operations: TransactionOperation[], participantId: string): TransactionOperation[] {
    // In a real implementation, this would filter operations for a specific shard
    // For now, we'll just assume the participant ID is 'shard-{collection}'
    const collection = participantId.substring(6); // Remove 'shard-' prefix
    
    return operations.filter(operation => operation.collection === collection);
  }
}
