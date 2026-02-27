/**
 * Backup and Recovery System for ML Data
 * Prevents data loss and provides disaster recovery
 */

import fs from 'fs';
import path from 'path';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { logger } from './monitoring.js';

class BackupManager {
  constructor() {
    this.backupDir = path.resolve(process.cwd(), 'backups');
    this.dataFile = path.resolve(process.cwd(), 'saas_data.json');
    this.maxBackups = 10; // Keep last 10 backups
    this.backupInterval = 5 * 60 * 1000; // 5 minutes
    
    this.ensureBackupDir();
    this.startScheduledBackups();
  }

  ensureBackupDir() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Create a compressed backup of ML data
   */
  async createBackup() {
    try {
      if (!fs.existsSync(this.dataFile)) {
        logger.warn('ML data file not found, skipping backup');
        return null;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(this.backupDir, `ml-backup-${timestamp}.json.gz`);
      
      // Read original data
      const data = fs.readFileSync(this.dataFile);
      
      // Compress and save
      const gzip = createGzip();
      const writeStream = fs.createWriteStream(backupFile);
      const readStream = fs.createReadStream(this.dataFile);
      
      await pipeline(readStream, gzip, writeStream);
      
      // Verify backup was created
      const stats = fs.statSync(backupFile);
      logger.info('Backup created', {
        file: backupFile,
        size: stats.size,
        originalSize: data.length,
        compressionRatio: (1 - stats.size / data.length) * 100
      });
      
      // Clean old backups
      await this.cleanOldBackups();
      
      return backupFile;
    } catch (error) {
      logger.error('Backup creation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Restore from the latest backup
   */
  async restoreFromBackup(backupFile = null) {
    try {
      const targetBackup = backupFile || this.getLatestBackup();
      
      if (!targetBackup) {
        throw new Error('No backup file found');
      }

      if (!fs.existsSync(targetBackup)) {
        throw new Error(`Backup file not found: ${targetBackup}`);
      }

      // Create a backup of current data before restore
      if (fs.existsSync(this.dataFile)) {
        await this.createBackup();
      }

      // Decompress and restore
      const gunzip = createGunzip();
      const writeStream = fs.createWriteStream(this.dataFile);
      const readStream = fs.createReadStream(targetBackup);
      
      await pipeline(readStream, gunzip, writeStream);
      
      logger.info('Data restored from backup', { backupFile: targetBackup });
      
      return true;
    } catch (error) {
      logger.error('Data restore failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get the latest backup file
   */
  getLatestBackup() {
    try {
      const files = fs.readdirSync(this.backupDir)
        .filter(file => file.startsWith('ml-backup-') && file.endsWith('.json.gz'))
        .map(file => ({
          name: file,
          path: path.join(this.backupDir, file),
          timestamp: this.extractTimestamp(file)
        }))
        .sort((a, b) => b.timestamp - a.timestamp);
      
      return files.length > 0 ? files[0].path : null;
    } catch (error) {
      logger.error('Failed to get latest backup', { error: error.message });
      return null;
    }
  }

  /**
   * Extract timestamp from backup filename
   */
  extractTimestamp(filename) {
    const match = filename.match(/ml-backup-(.+)\.json\.gz/);
    return match ? new Date(match[1].replace(/-/g, ':').replace(/T/, ' ')) : new Date(0);
  }

  /**
   * Clean old backups, keeping only the most recent ones
   */
  async cleanOldBackups() {
    try {
      const files = fs.readdirSync(this.backupDir)
        .filter(file => file.startsWith('ml-backup-') && file.endsWith('.json.gz'))
        .map(file => ({
          name: file,
          path: path.join(this.backupDir, file),
          timestamp: this.extractTimestamp(file)
        }))
        .sort((a, b) => b.timestamp - a.timestamp);
      
      // Remove excess backups
      if (files.length > this.maxBackups) {
        const filesToDelete = files.slice(this.maxBackups);
        
        for (const file of filesToDelete) {
          fs.unlinkSync(file.path);
          logger.info('Old backup removed', { file: file.name });
        }
      }
    } catch (error) {
      logger.error('Failed to clean old backups', { error: error.message });
    }
  }

  /**
   * Get backup statistics
   */
  getBackupStats() {
    try {
      const files = fs.readdirSync(this.backupDir)
        .filter(file => file.startsWith('ml-backup-') && file.endsWith('.json.gz'))
        .map(file => {
          const filePath = path.join(this.backupDir, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            size: stats.size,
            created: stats.birthtime,
            timestamp: this.extractTimestamp(file)
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp);
      
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      
      return {
        count: files.length,
        totalSize,
        latestBackup: files[0]?.timestamp || null,
        oldestBackup: files[files.length - 1]?.timestamp || null,
        files
      };
    } catch (error) {
      logger.error('Failed to get backup stats', { error: error.message });
      return { count: 0, totalSize: 0, files: [] };
    }
  }

  /**
   * Start scheduled backups
   */
  startScheduledBackups() {
    setInterval(async () => {
      try {
        await this.createBackup();
      } catch (error) {
        logger.error('Scheduled backup failed', { error: error.message });
      }
    }, this.backupInterval);
    
    logger.info('Scheduled backups started', { interval: this.backupInterval });
  }

  /**
   * Validate backup integrity
   */
  async validateBackup(backupFile) {
    try {
      if (!fs.existsSync(backupFile)) {
        return { valid: false, error: 'Backup file does not exist' };
      }

      // Try to decompress and parse JSON
      const gunzip = createGunzip();
      const chunks = [];
      
      const readStream = fs.createReadStream(backupFile);
      const writableStream = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(chunk);
          callback();
        }
      });
      
      await pipeline(readStream, gunzip, writableStream);
      
      const data = Buffer.concat(chunks).toString();
      const parsed = JSON.parse(data);
      
      // Basic structure validation
      if (!parsed || typeof parsed !== 'object' || !parsed.companies) {
        return { valid: false, error: 'Invalid backup structure' };
      }
      
      return { valid: true, companies: Object.keys(parsed.companies).length };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Emergency backup before critical operations
   */
  async emergencyBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(this.backupDir, `emergency-backup-${timestamp}.json.gz`);
      
      if (fs.existsSync(this.dataFile)) {
        const data = fs.readFileSync(this.dataFile);
        const gzip = createGzip();
        const writeStream = fs.createWriteStream(backupFile);
        const readStream = fs.createReadStream(this.dataFile);
        
        await pipeline(readStream, gzip, writeStream);
        
        logger.warn('Emergency backup created', { file: backupFile });
        return backupFile;
      }
      
      return null;
    } catch (error) {
      logger.error('Emergency backup failed', { error: error.message });
      throw error;
    }
  }
}

/**
 * Data recovery manager
 */
class RecoveryManager {
  constructor() {
    this.backupManager = new BackupManager();
  }

  /**
   * Attempt to recover ML data from various sources
   */
  async attemptRecovery() {
    const recoverySteps = [
      () => this.checkOriginalFile(),
      () => this.restoreFromLatestBackup(),
      () => this.createEmptyDataStructure()
    ];

    for (const step of recoverySteps) {
      try {
        const result = await step();
        if (result) {
          logger.info('Recovery successful', { step: step.name });
          return result;
        }
      } catch (error) {
        logger.warn('Recovery step failed', { 
          step: step.name, 
          error: error.message 
        });
      }
    }

    throw new Error('All recovery attempts failed');
  }

  /**
   * Check if original data file exists and is valid
   */
  async checkOriginalFile() {
    const dataFile = this.backupManager.dataFile;
    
    if (!fs.existsSync(dataFile)) {
      return null;
    }

    try {
      const data = fs.readFileSync(dataFile, 'utf8');
      const parsed = JSON.parse(data);
      
      if (parsed && typeof parsed === 'object' && parsed.companies) {
        return { source: 'original', companies: Object.keys(parsed.companies).length };
      }
    } catch (error) {
      logger.warn('Original data file corrupted', { error: error.message });
    }
    
    return null;
  }

  /**
   * Restore from latest backup
   */
  async restoreFromLatestBackup() {
    await this.backupManager.restoreFromBackup();
    const stats = this.backupManager.getBackupStats();
    
    return { 
      source: 'backup', 
      backupCount: stats.count,
      latestBackup: stats.latestBackup
    };
  }

  /**
   * Create empty data structure as last resort
   */
  async createEmptyDataStructure() {
    const emptyData = { companies: {} };
    const dataFile = this.backupManager.dataFile;
    
    fs.writeFileSync(dataFile, JSON.stringify(emptyData, null, 2));
    
    logger.warn('Created empty data structure as last resort');
    
    return { source: 'empty', companies: 0 };
  }
}

// Global instances
export const backupManager = new BackupManager();
export const recoveryManager = new RecoveryManager();

export default {
  BackupManager,
  RecoveryManager,
  backupManager,
  recoveryManager
};
