/**
 * Logger Utility
 * 
 * This file provides a centralized logging utility for ImpossibleDB.
 * It supports different log levels and structured logging.
 */

import { LogLevel, LogEntry } from '../types';
import { LOG_LEVEL, ENVIRONMENT } from '../config';

/**
 * Logger class for handling all logging operations
 */
export class Logger {
  private context: string;
  private currentLogLevel: LogLevel;
  
  /**
   * Creates a new logger instance
   * 
   * @param context The context for this logger (e.g., module name)
   * @param logLevel Optional override for the log level
   */
  constructor(context: string, logLevel?: LogLevel) {
    this.context = context;
    this.currentLogLevel = logLevel || (LOG_LEVEL as LogLevel);
  }
  
  /**
   * Log a debug message
   * 
   * @param message The message to log
   * @param data Optional additional data
   */
  debug(message: string, data?: Record<string, any>): void {
    this.log('debug', message, data);
  }
  
  /**
   * Log an info message
   * 
   * @param message The message to log
   * @param data Optional additional data
   */
  info(message: string, data?: Record<string, any>): void {
    this.log('info', message, data);
  }
  
  /**
   * Log a warning message
   * 
   * @param message The message to log
   * @param data Optional additional data
   */
  warn(message: string, data?: Record<string, any>): void {
    this.log('warn', message, data);
  }
  
  /**
   * Log an error message
   * 
   * @param message The message to log
   * @param error Optional error object
   * @param data Optional additional data
   */
  error(message: string, error?: Error, data?: Record<string, any>): void {
    const errorData = error ? {
      message: error.message,
      name: error.name,
      stack: error.stack,
      ...data
    } : data;
    
    this.log('error', message, errorData);
  }
  
  /**
   * Set the log level for this logger instance
   * 
   * @param level The new log level
   */
  setLogLevel(level: LogLevel): void {
    this.currentLogLevel = level;
  }
  
  /**
   * Internal method to handle the actual logging
   * 
   * @param level The log level
   * @param message The message to log
   * @param data Optional additional data
   */
  private log(level: LogLevel, message: string, data?: Record<string, any>): void {
    // Skip logging if the level is below the current log level
    if (!this.shouldLog(level)) {
      return;
    }
    
    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      context: {
        module: this.context,
        environment: ENVIRONMENT,
        ...data
      }
    };
    
    // In production, we format logs for better readability in Cloudflare dashboard
    if (ENVIRONMENT === 'production') {
      const formattedMessage = `[${level.toUpperCase()}] [${this.context}] ${message}`;
      
      switch (level) {
        case 'debug':
          console.debug(formattedMessage, data);
          break;
        case 'info':
          console.info(formattedMessage, data);
          break;
        case 'warn':
          console.warn(formattedMessage, data);
          break;
        case 'error':
          console.error(formattedMessage, data);
          break;
      }
    } else {
      // In development, we log the full structured entry
      console.log(JSON.stringify(entry));
    }
  }
  
  /**
   * Determine if a message at the given level should be logged
   * 
   * @param level The log level to check
   * @returns True if the message should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
    
    return levels[level] >= levels[this.currentLogLevel];
  }
}

/**
 * Create a logger for the given context
 * 
 * @param context The context for the logger
 * @returns A new logger instance
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}

// Default logger instance
export const logger = createLogger('default');
