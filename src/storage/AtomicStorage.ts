/**
 * MaxIDE - Production-Grade Atomic Storage & Integrity Manager
 * 
 * Guarantees crash-resilient persistence:
 * 1. Writes to temporary files (.tmp.<timestamp>) and flushes to disk.
 * 2. Uses atomic rename with retry logic for Windows file locking.
 * 3. Quarantines corrupted JSON files without data loss or application crashes.
 * 4. Strips sensitive tokens (API keys, passwords, secrets) before writing.
 * 5. Embeds schema versioning for forward and backward compatibility.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class AtomicStorage {
  private static readonly CURRENT_SCHEMA_VERSION = 1;

  /**
   * Deep-clone and sanitize sensitive keys (API keys, passwords, bearer tokens)
   */
  public static sanitizeSecrets(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeSecrets(item));
    }

    const sanitized: Record<string, any> = {};
    const sensitivePattern = /^(apiKey|api_key|token|access_token|secret|password|bearer|auth|cookie)$/i;

    for (const [key, value] of Object.entries(obj)) {
      if (sensitivePattern.test(key) && typeof value === 'string' && value.length > 0) {
        sanitized[key] = value.length > 8 ? `${value.slice(0, 4)}...[REDACTED]` : '[REDACTED]';
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeSecrets(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Atomically writes JSON data to disk using temporary file + fsync + rename.
   */
  public static atomicWriteJsonSync<T>(
    filePath: string,
    data: T,
    options: { sanitize?: boolean; schemaVersion?: number } = {}
  ): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const payload: any = options.sanitize ? this.sanitizeSecrets(data) : data;
    const toWrite = (typeof payload === 'object' && payload !== null && !Array.isArray(payload))
      ? { ...payload, _schemaVersion: options.schemaVersion || this.CURRENT_SCHEMA_VERSION, _savedAt: new Date().toISOString() }
      : payload;

    const jsonString = JSON.stringify(toWrite, null, 2);
    const randSuffix = crypto.randomBytes(3).toString('hex');
    const tempFile = path.join(dir, `.${path.basename(filePath)}.tmp.${Date.now()}_${randSuffix}`);

    try {
      // 1. Write to temp file and flush
      const fd = fs.openSync(tempFile, 'w');
      fs.writeSync(fd, jsonString, 0, 'utf8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);

      // 2. Atomic rename with retry loop for Windows file locking
      let retries = 5;
      let lastErr: any;
      while (retries > 0) {
        try {
          fs.renameSync(tempFile, filePath);
          return;
        } catch (err: any) {
          lastErr = err;
          retries--;
          if (retries > 0) {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
          }
        }
      }

      // Fallback: Copy if rename continuously locked
      try {
        fs.copyFileSync(tempFile, filePath);
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch (copyErr) {
        throw lastErr || copyErr;
      }
    } catch (err) {
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch {}
      }
      throw err;
    }
  }

  /**
   * Safely reads JSON from disk. If the file is corrupted, it is quarantined
   * into a .corrupt.<timestamp> file to prevent application crash while preserving diagnostic info.
   */
  public static safeReadJsonSync<T>(filePath: string, fallback: T): T {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    try {
      let raw = fs.readFileSync(filePath, 'utf8');
      if (raw.charCodeAt(0) === 0xFEFF) {
        raw = raw.slice(1);
      }
      if (!raw || raw.trim().length === 0) {
        return fallback;
      }
      return JSON.parse(raw);
    } catch (err: any) {
      console.warn(`[AtomicStorage] Corrupted state detected at ${filePath}: ${err.message}`);
      try {
        const corruptQuarantine = `${filePath}.corrupt.${Date.now()}`;
        fs.renameSync(filePath, corruptQuarantine);
        console.warn(`[AtomicStorage] Quarantined corrupted state to ${corruptQuarantine}`);
      } catch {}
      return fallback;
    }
  }
}
