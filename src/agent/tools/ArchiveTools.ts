/**
 * MaxIDE - Universal Archive Tools
 * Implements Section 35 of Master Architecture:
 * Safe inspection, extraction, and creation of ZIP archives.
 * Strictly prevents archive directory traversal vulnerabilities.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { ExecutableTool } from '../ToolDefinition.js';

export interface ArchiveEntry {
  name: string;
  isDirectory: boolean;
  uncompressedSize: number;
  compressedSize: number;
}

export interface ArchiveInspectionResult {
  success: boolean;
  archivePath: string;
  totalEntries: number;
  totalSize: number;
  entries: ArchiveEntry[];
  error?: string;
}

export interface ArchiveExtractionResult {
  success: boolean;
  archivePath: string;
  destinationDir: string;
  extractedFiles: string[];
  error?: string;
}

export interface ArchiveCreationResult {
  success: boolean;
  archivePath: string;
  fileCount: number;
  totalBytes: number;
  error?: string;
}

function resolveSafeExtractPath(destDir: string, entryName: string): string {
  // Strip leading slashes, drive letters, and relative escapes
  const clean = entryName.replace(/^[a-zA-Z]:[\\/]*/, '').replace(/^[\\/]+/, '');
  const target = path.resolve(destDir, clean);
  const normalizedDest = path.normalize(destDir).toLowerCase();
  const normalizedTarget = path.normalize(target).toLowerCase();

  const destWithSep = normalizedDest.endsWith(path.sep) ? normalizedDest : normalizedDest + path.sep;
  if (normalizedTarget !== normalizedDest && !normalizedTarget.startsWith(destWithSep)) {
    throw new Error(`Security Violation: Zip entry "${entryName}" attempts to escape extraction directory.`);
  }
  return target;
}

export class ArchiveTools {
  /**
   * Inspect a ZIP archive and list its contents without extracting
   */
  public static inspectArchive(zipPath: string): ArchiveInspectionResult {
    try {
      if (!fs.existsSync(zipPath)) {
        return { success: false, archivePath: zipPath, totalEntries: 0, totalSize: 0, entries: [], error: 'Archive not found' };
      }

      const buf = fs.readFileSync(zipPath);
      if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) {
        return { success: false, archivePath: zipPath, totalEntries: 0, totalSize: 0, entries: [], error: 'Not a valid ZIP archive (missing PK\\x03\\x04 header)' };
      }

      const entries: ArchiveEntry[] = [];
      let offset = 0;
      let totalSize = 0;

      while (offset + 30 <= buf.length) {
        const sig = buf.readUInt32LE(offset);
        if (sig !== 0x04034b50) break; // End of local file headers

        const compMethod = buf.readUInt16LE(offset + 8);
        const compSize = buf.readUInt32LE(offset + 18);
        const uncompSize = buf.readUInt32LE(offset + 22);
        const fnLen = buf.readUInt16LE(offset + 26);
        const extraLen = buf.readUInt16LE(offset + 28);

        const filename = buf.toString('utf8', offset + 30, offset + 30 + fnLen);
        const isDir = filename.endsWith('/') || filename.endsWith('\\');

        entries.push({
          name: filename,
          isDirectory: isDir,
          uncompressedSize: uncompSize,
          compressedSize: compSize,
        });

        totalSize += uncompSize;
        offset += 30 + fnLen + extraLen + compSize;
      }

      return {
        success: true,
        archivePath: zipPath,
        totalEntries: entries.length,
        totalSize,
        entries,
      };
    } catch (err: any) {
      return { success: false, archivePath: zipPath, totalEntries: 0, totalSize: 0, entries: [], error: err.message };
    }
  }

  /**
   * Extract a ZIP archive into a target directory with path-traversal safeguards
   */
  public static extractArchive(zipPath: string, destDir: string): ArchiveExtractionResult {
    try {
      if (!fs.existsSync(zipPath)) {
        return { success: false, archivePath: zipPath, destinationDir: destDir, extractedFiles: [], error: 'Archive not found' };
      }
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

      const buf = fs.readFileSync(zipPath);
      let offset = 0;
      const extracted: string[] = [];

      while (offset + 30 <= buf.length) {
        const sig = buf.readUInt32LE(offset);
        if (sig !== 0x04034b50) break;

        const compMethod = buf.readUInt16LE(offset + 8);
        const compSize = buf.readUInt32LE(offset + 18);
        const uncompSize = buf.readUInt32LE(offset + 22);
        const fnLen = buf.readUInt16LE(offset + 26);
        const extraLen = buf.readUInt16LE(offset + 28);

        const filename = buf.toString('utf8', offset + 30, offset + 30 + fnLen);
        const dataOffset = offset + 30 + fnLen + extraLen;
        const compressedData = buf.subarray(dataOffset, dataOffset + compSize);

        const isDir = filename.endsWith('/') || filename.endsWith('\\');
        const safeTarget = resolveSafeExtractPath(destDir, filename);

        if (isDir) {
          if (!fs.existsSync(safeTarget)) fs.mkdirSync(safeTarget, { recursive: true });
        } else {
          const parent = path.dirname(safeTarget);
          if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });

          let fileContent: Buffer;
          if (compMethod === 0) {
            fileContent = compressedData;
          } else if (compMethod === 8) {
            fileContent = zlib.inflateRawSync(compressedData);
          } else {
            // Unhandled compression, skip safely
            offset = dataOffset + compSize;
            continue;
          }

          fs.writeFileSync(safeTarget, fileContent);
          extracted.push(path.relative(destDir, safeTarget).replace(/\\/g, '/'));
        }

        offset = dataOffset + compSize;
      }

      return {
        success: true,
        archivePath: zipPath,
        destinationDir: destDir,
        extractedFiles: extracted,
      };
    } catch (err: any) {
      return { success: false, archivePath: zipPath, destinationDir: destDir, extractedFiles: [], error: err.message };
    }
  }

  /**
   * Create a ZIP archive from a directory
   */
  public static createArchive(sourceDir: string, zipPath: string): ArchiveCreationResult {
    try {
      if (!fs.existsSync(sourceDir)) {
        return { success: false, archivePath: zipPath, fileCount: 0, totalBytes: 0, error: 'Source directory not found' };
      }

      const files: Array<{ relPath: string; absPath: string }> = [];
      function collect(current: string) {
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const e of entries) {
          if (e.name === '.git' || e.name === 'node_modules') continue;
          const full = path.join(current, e.name);
          if (e.isDirectory()) {
            collect(full);
          } else {
            files.push({ relPath: path.relative(sourceDir, full).replace(/\\/g, '/'), absPath: full });
          }
        }
      }
      collect(sourceDir);

      const localHeaders: Buffer[] = [];
      const centralHeaders: Buffer[] = [];
      let currentOffset = 0;

      for (const f of files) {
        const data = fs.readFileSync(f.absPath);
        const deflated = zlib.deflateRawSync(data);
        const crc = zlib.crc32(data);
        const fnBuf = Buffer.from(f.relPath, 'utf8');

        // Local Header (30 bytes + filename + deflated)
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0);
        lh.writeUInt16LE(20, 4); // version needed
        lh.writeUInt16LE(0, 6);  // flags
        lh.writeUInt16LE(8, 8);  // compression = deflate
        lh.writeUInt16LE(0, 10); // time
        lh.writeUInt16LE(0, 12); // date
        lh.writeUInt32LE(crc, 14);
        lh.writeUInt32LE(deflated.length, 18);
        lh.writeUInt32LE(data.length, 22);
        lh.writeUInt16LE(fnBuf.length, 26);
        lh.writeUInt16LE(0, 28); // extra field length

        localHeaders.push(lh, fnBuf, deflated);

        // Central Directory Header (46 bytes + filename)
        const cd = Buffer.alloc(46);
        cd.writeUInt32LE(0x02014b50, 0);
        cd.writeUInt16LE(20, 4); // version made by
        cd.writeUInt16LE(20, 6); // version needed
        cd.writeUInt16LE(0, 8);  // flags
        cd.writeUInt16LE(8, 10); // compression
        cd.writeUInt16LE(0, 12); // time
        cd.writeUInt16LE(0, 14); // date
        cd.writeUInt32LE(crc, 16);
        cd.writeUInt32LE(deflated.length, 20);
        cd.writeUInt32LE(data.length, 24);
        cd.writeUInt16LE(fnBuf.length, 28);
        cd.writeUInt16LE(0, 30); // extra length
        cd.writeUInt16LE(0, 32); // comment length
        cd.writeUInt16LE(0, 34); // disk start
        cd.writeUInt16LE(0, 36); // internal attrs
        cd.writeUInt32LE(0, 38); // external attrs
        cd.writeUInt32LE(currentOffset, 42); // relative offset of local header

        centralHeaders.push(cd, fnBuf);
        currentOffset += lh.length + fnBuf.length + deflated.length;
      }

      const cdStartOffset = currentOffset;
      let cdSize = 0;
      for (const b of centralHeaders) cdSize += b.length;

      // End of Central Directory Record (22 bytes)
      const eocd = Buffer.alloc(22);
      eocd.writeUInt32LE(0x06054b50, 0);
      eocd.writeUInt16LE(0, 4); // disk number
      eocd.writeUInt16LE(0, 6); // start disk
      eocd.writeUInt16LE(files.length, 8);  // records on disk
      eocd.writeUInt16LE(files.length, 10); // total records
      eocd.writeUInt32LE(cdSize, 12);
      eocd.writeUInt32LE(cdStartOffset, 16);
      eocd.writeUInt16LE(0, 20); // comment length

      const finalBuf = Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
      const zipDir = path.dirname(zipPath);
      if (!fs.existsSync(zipDir)) fs.mkdirSync(zipDir, { recursive: true });
      fs.writeFileSync(zipPath, finalBuf);

      return {
        success: true,
        archivePath: zipPath,
        fileCount: files.length,
        totalBytes: finalBuf.length,
      };
    } catch (err: any) {
      return { success: false, archivePath: zipPath, fileCount: 0, totalBytes: 0, error: err.message };
    }
  }
}

export function createArchiveTools(workspaceRoot: string): ExecutableTool[] {
  return [
    {
      definition: {
        name: 'inspect_archive',
        description: 'Inspect a ZIP archive and list its internal files and directories safely without extracting.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path to ZIP file in workspace' },
          },
          required: ['path'],
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: { path: string }) => {
        const full = path.resolve(workspaceRoot, args.path);
        return ArchiveTools.inspectArchive(full);
      },
    },
    {
      definition: {
        name: 'extract_archive',
        description: 'Extract files from a ZIP archive into a workspace folder with directory traversal protection.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path to ZIP file in workspace' },
            destination: { type: 'string', description: 'Relative target directory' },
          },
          required: ['path'],
        },
      },
      permissionLevel: 'APPROVAL_REQUIRED',
      execute: async (args: { path: string; destination?: string }) => {
        const full = path.resolve(workspaceRoot, args.path);
        const dest = path.resolve(workspaceRoot, args.destination || path.basename(args.path, '.zip'));
        return ArchiveTools.extractArchive(full, dest);
      },
    },
    {
      definition: {
        name: 'create_archive',
        description: 'Package a workspace folder into a standard ZIP archive.',
        parameters: {
          type: 'object',
          properties: {
            sourceDir: { type: 'string', description: 'Relative path to source directory' },
            outputPath: { type: 'string', description: 'Relative path for the resulting .zip file' },
          },
          required: ['sourceDir', 'outputPath'],
        },
      },
      permissionLevel: 'APPROVAL_REQUIRED',
      execute: async (args: { sourceDir: string; outputPath: string }) => {
        const src = path.resolve(workspaceRoot, args.sourceDir);
        const out = path.resolve(workspaceRoot, args.outputPath);
        return ArchiveTools.createArchive(src, out);
      },
    },
  ];
}
