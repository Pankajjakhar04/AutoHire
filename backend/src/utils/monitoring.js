/**
 * Error Handling and Monitoring System
 * Provides comprehensive error tracking and system health monitoring
 */

import { createLogger, format, transports } from 'winston';

// Create logger with custom format
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: 'autohire-backend' },
  transports: [
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' }),
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    })
  ]
});

/**
 * Error types for categorization
 */
export const ErrorTypes = {
  VALIDATION: 'validation',
  ML_SERVICE: 'ml_service',
  DATABASE: 'database',
  FILE_PROCESSING: 'file_processing',
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  NETWORK: 'network',
  SYSTEM: 'system'
};

/**
 * Custom error class with error type and context
 */
export class AppError extends Error {
  constructor(message, type = ErrorTypes.SYSTEM, statusCode = 500, context = {}) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.statusCode = statusCode;
    this.context = context;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Centralized error handler
 */
export function handleError(error, context = {}) {
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    type: error.type || ErrorTypes.SYSTEM,
    statusCode: error.statusCode || 500,
    context: {
      ...context,
      timestamp: new Date().toISOString(),
      userId: context.userId || 'anonymous',
      requestId: context.requestId || 'unknown'
    }
  };

  // Log error based on type
  switch (errorInfo.type) {
    case ErrorTypes.VALIDATION:
      logger.warn('Validation Error', errorInfo);
      break;
    case ErrorTypes.ML_SERVICE:
      logger.error('ML Service Error', errorInfo);
      break;
    case ErrorTypes.DATABASE:
      logger.error('Database Error', errorInfo);
      break;
    case ErrorTypes.FILE_PROCESSING:
      logger.error('File Processing Error', errorInfo);
      break;
    case ErrorTypes.AUTHENTICATION:
      logger.warn('Authentication Error', errorInfo);
      break;
    case ErrorTypes.AUTHORIZATION:
      logger.warn('Authorization Error', errorInfo);
      break;
    case ErrorTypes.NETWORK:
      logger.error('Network Error', errorInfo);
      break;
    default:
      logger.error('System Error', errorInfo);
  }

  return errorInfo;
}

/**
 * ML Service monitoring
 */
export class MLServiceMonitor {
  constructor() {
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      averageResponseTime: 0,
      lastCallTime: null,
      errors: []
    };
  }

  recordCall(duration, success, error = null) {
    this.stats.totalCalls++;
    this.stats.lastCallTime = new Date().toISOString();
    
    if (success) {
      this.stats.successfulCalls++;
    } else {
      this.stats.failedCalls++;
      if (error) {
        this.stats.errors.push({
          timestamp: new Date().toISOString(),
          error: error.message,
          type: error.type || 'unknown'
        });
        
        // Keep only last 100 errors
        if (this.stats.errors.length > 100) {
          this.stats.errors = this.stats.errors.slice(-100);
        }
      }
    }

    // Update average response time
    const totalCalls = this.stats.totalCalls;
    this.stats.averageResponseTime = 
      ((this.stats.averageResponseTime * (totalCalls - 1)) + duration) / totalCalls;

    // Log performance issues
    if (duration > 5000) { // 5 seconds
      logger.warn('ML Service Slow Response', {
        duration,
        averageResponseTime: this.stats.averageResponseTime,
        successRate: this.getSuccessRate()
      });
    }
  }

  getSuccessRate() {
    return this.stats.totalCalls > 0 
      ? (this.stats.successfulCalls / this.stats.totalCalls) * 100 
      : 0;
  }

  getStats() {
    return {
      ...this.stats,
      successRate: this.getSuccessRate(),
      health: this.getHealth()
    };
  }

  getHealth() {
    const successRate = this.getSuccessRate();
    const avgResponseTime = this.stats.averageResponseTime;
    
    if (successRate < 80) return 'unhealthy';
    if (successRate < 95 || avgResponseTime > 3000) return 'degraded';
    return 'healthy';
  }
}

/**
 * System health monitor
 */
export class SystemHealthMonitor {
  constructor() {
    this.mlMonitor = new MLServiceMonitor();
    this.startupTime = new Date().toISOString();
    this.lastHealthCheck = null;
  }

  async checkHealth() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - new Date(this.startupTime).getTime(),
      services: {
        ml: this.mlMonitor.getStats(),
        database: await this.checkDatabaseHealth(),
        memory: this.checkMemoryHealth(),
        disk: this.checkDiskHealth()
      }
    };

    // Determine overall health
    const serviceStatuses = Object.values(health.services).map(s => s.health || s.status);
    if (serviceStatuses.includes('unhealthy')) {
      health.status = 'unhealthy';
    } else if (serviceStatuses.includes('degraded')) {
      health.status = 'degraded';
    }

    this.lastHealthCheck = health.timestamp;
    return health;
  }

  async checkDatabaseHealth() {
    try {
      // Simple database connectivity check
      const start = Date.now();
      await import('../models/Resume.js').then(model => {
        return model.default.findOne({});
      });
      const duration = Date.now() - start;
      
      return {
        status: 'healthy',
        responseTime: duration,
        health: duration < 1000 ? 'healthy' : duration < 3000 ? 'degraded' : 'unhealthy'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        health: 'unhealthy'
      };
    }
  }

  checkMemoryHealth() {
    const memUsage = process.memoryUsage();
    const totalMemory = memUsage.heapTotal;
    const usedMemory = memUsage.heapUsed;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;

    return {
      status: 'healthy',
      usage: {
        total: totalMemory,
        used: usedMemory,
        percentage: memoryUsagePercent
      },
      health: memoryUsagePercent < 80 ? 'healthy' : memoryUsagePercent < 95 ? 'degraded' : 'unhealthy'
    };
  }

  checkDiskHealth() {
    try {
      const stats = require('fs').statSync('.');
      return {
        status: 'healthy',
        health: 'healthy'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        health: 'unhealthy'
      };
    }
  }
}

// Global instances
export const mlMonitor = new MLServiceMonitor();
export const healthMonitor = new SystemHealthMonitor();

/**
 * Request tracking middleware
 */
export function requestTracker(req, res, next) {
  const requestId = req.headers['x-request-id'] || Math.random().toString(36).substring(7);
  req.requestId = requestId;
  
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request Completed', {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      userAgent: req.headers['user-agent'],
      ip: req.ip
    });
  });

  next();
}

/**
 * Rate limiting for API endpoints
 */
export class RateLimiter {
  constructor(maxRequests = 100, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  isAllowed(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }
    
    const timestamps = this.requests.get(key);
    
    // Remove old requests outside the window
    const validTimestamps = timestamps.filter(timestamp => timestamp > windowStart);
    this.requests.set(key, validTimestamps);
    
    if (validTimestamps.length >= this.maxRequests) {
      return false;
    }
    
    validTimestamps.push(now);
    return true;
  }

  cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    for (const [key, timestamps] of this.requests.entries()) {
      const validTimestamps = timestamps.filter(timestamp => timestamp > windowStart);
      if (validTimestamps.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, validTimestamps);
      }
    }
  }
}

// Global rate limiter
export const rateLimiter = new RateLimiter();

// Cleanup rate limiter every 5 minutes

setInterval(() => rateLimiter.cleanup(), 5 * 60 * 1000);

export { logger };
export default {
  ErrorTypes,
  AppError,
  handleError,
  mlMonitor,
  healthMonitor,
  requestTracker,
  rateLimiter
};
