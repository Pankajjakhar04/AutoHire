/**
 * Health Check and Monitoring Endpoints
 * Provides system health monitoring and diagnostics
 */

import { Router } from 'express';
import { healthMonitor, mlMonitor, rateLimiter } from '../utils/monitoring.js';
import { backupManager } from '../utils/backup.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * Basic health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    const health = await healthMonitor.checkHealth();
    
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;
    
    return res.status(statusCode).json({
      status: health.status,
      timestamp: health.timestamp,
      uptime: health.uptime,
      services: health.services
    });
  } catch (error) {
    return res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * Detailed system diagnostics (admin only)
 */
router.get('/diagnostics', 
  authenticate, 
  requireRole(['recruiterAdmin']), 
  async (req, res) => {
    try {
      const health = await healthMonitor.checkHealth();
      const backupStats = backupManager.getBackupStats();
      
      // Get system info
      const systemInfo = {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        memory: process.memoryUsage(),
        uptime: process.uptime()
      };
      
      // Get rate limiter stats
      const rateLimiterStats = {
        activeKeys: rateLimiter.requests.size,
        maxRequests: rateLimiter.maxRequests,
        windowMs: rateLimiter.windowMs
      };
      
      return res.json({
        status: 'success',
        timestamp: new Date().toISOString(),
        health,
        backup: backupStats,
        system: systemInfo,
        rateLimiter: rateLimiterStats,
        mlService: mlMonitor.getStats()
      });
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }
);

/**
 * ML Service specific health check
 */
router.get('/ml-health', async (req, res) => {
  try {
    const mlStats = mlMonitor.getStats();
    
    const statusCode = mlStats.health === 'healthy' ? 200 : 
                      mlStats.health === 'degraded' ? 200 : 503;
    
    return res.status(statusCode).json({
      service: 'ml-service',
      status: mlStats.health,
      timestamp: new Date().toISOString(),
      stats: mlStats
    });
  } catch (error) {
    return res.status(503).json({
      service: 'ml-service',
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * Backup status endpoint (admin only)
 */
router.get('/backup-status', 
  authenticate, 
  requireRole(['recruiterAdmin']), 
  async (req, res) => {
    try {
      const backupStats = backupManager.getBackupStats();
      
      return res.json({
        status: 'success',
        timestamp: new Date().toISOString(),
        backup: backupStats
      });
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }
);

/**
 * Trigger manual backup (admin only)
 */
router.post('/backup', 
  authenticate, 
  requireRole(['recruiterAdmin']), 
  async (req, res) => {
    try {
      const backupFile = await backupManager.createBackup();
      
      return res.json({
        status: 'success',
        message: 'Backup created successfully',
        backupFile: backupFile ? backupFile.split('/').pop() : null,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }
);

/**
 * Restore from backup (admin only)
 */
router.post('/restore', 
  authenticate, 
  requireRole(['recruiterAdmin']), 
  async (req, res) => {
    try {
      const { backupFile } = req.body;
      
      await backupManager.restoreFromBackup(backupFile);
      
      return res.json({
        status: 'success',
        message: 'Data restored successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }
);

/**
 * Validate backup integrity (admin only)
 */
router.post('/validate-backup', 
  authenticate, 
  requireRole(['recruiterAdmin']), 
  async (req, res) => {
    try {
      const { backupFile } = req.body;
      
      if (!backupFile) {
        return res.status(400).json({
          status: 'error',
          message: 'backupFile is required'
        });
      }
      
      const validation = await backupManager.validateBackup(backupFile);
      
      return res.json({
        status: 'success',
        timestamp: new Date().toISOString(),
        validation
      });
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }
);

/**
 * System logs endpoint (admin only)
 */
router.get('/logs', 
  authenticate, 
  requireRole(['recruiterAdmin']), 
  async (req, res) => {
    try {
      const { level = 'info', limit = 100 } = req.query;
      
      const logFile = level === 'error' ? 'logs/error.log' : 'logs/combined.log';
      
      if (!require('fs').existsSync(logFile)) {
        return res.json({
          status: 'success',
          logs: [],
          message: 'No logs found'
        });
      }
      
      const logs = require('fs').readFileSync(logFile, 'utf8')
        .split('\n')
        .filter(line => line.trim())
        .slice(-parseInt(limit))
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return { message: line, timestamp: new Date().toISOString() };
          }
        });
      
      return res.json({
        status: 'success',
        timestamp: new Date().toISOString(),
        logs,
        level,
        limit
      });
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }
);

/**
 * Performance metrics endpoint (admin only)
 */
router.get('/metrics', 
  authenticate, 
  requireRole(['recruiterAdmin']), 
  async (req, res) => {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        mlService: mlMonitor.getStats(),
        rateLimiter: {
          activeKeys: rateLimiter.requests.size,
          maxRequests: rateLimiter.maxRequests,
          windowMs: rateLimiter.windowMs
        },
        health: await healthMonitor.checkHealth()
      };
      
      return res.json({
        status: 'success',
        metrics
      });
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }
);

export default router;
