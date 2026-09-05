/**
 * MaxIDE - Universal Artifact Engine
 * Manages first-class creative and technical artifacts across all domains:
 * CODE, WEB_APP, IMAGE, VIDEO, AUDIO, PDF, DOCX, PPTX, CSV, DATASET, REPORT, PRESENTATION.
 */

import fs from 'fs';
import path from 'path';

export type ArtifactType =
  | 'CODE'
  | 'WEB_APP'
  | 'IMAGE'
  | 'VIDEO'
  | 'AUDIO'
  | 'PDF'
  | 'DOCX'
  | 'PPTX'
  | 'CSV'
  | 'XLSX'
  | 'DATASET'
  | 'REPORT'
  | 'PRESENTATION'
  | 'TEXT'
  | 'ZIP';

export type PreviewCapability =
  | 'monaco'
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'presentation'
  | 'table_chart'
  | 'web_app';

export interface ArtifactMetadata {
  dimensions?: { width: number; height: number };
  durationSeconds?: number;
  pageCount?: number;
  slideCount?: number;
  rowCount?: number;
  columnCount?: number;
  summary?: string;
  tags?: string[];
  theme?: string;
  sourceFiles?: string[];
  [key: string]: any;
}

export interface Artifact {
  id: string;
  type: ArtifactType;
  name: string;
  description?: string;
  filePath: string;         // Absolute path on disk
  relativePath: string;     // Workspace-relative path
  url: string;              // HTTP accessible URL
  mimeType: string;
  sizeBytes: number;
  metadata: ArtifactMetadata;
  createdAt: string;
  provider?: string;
  model?: string;
  prompt?: string;
  status: 'verified' | 'generating' | 'failed';
  verificationDetails?: string;
  previewCapability: PreviewCapability;
}

export class ArtifactManager {
  private artifacts: Map<string, Artifact> = new Map();
  private workspaceRoot: string;
  private dbFilePath: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    const metaDir = path.join(this.workspaceRoot, '.maxide');
    if (!fs.existsSync(metaDir)) {
      try {
        fs.mkdirSync(metaDir, { recursive: true });
      } catch {}
    }
    this.dbFilePath = path.join(metaDir, 'artifacts.json');
    this.loadFromDisk();
  }

  public setWorkspaceRoot(newRoot: string): void {
    this.workspaceRoot = newRoot;
    const metaDir = path.join(this.workspaceRoot, '.maxide');
    if (!fs.existsSync(metaDir)) {
      try {
        fs.mkdirSync(metaDir, { recursive: true });
      } catch {}
    }
    this.dbFilePath = path.join(metaDir, 'artifacts.json');
    this.artifacts.clear();
    this.loadFromDisk();
  }

  public getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Register a newly created artifact and persist metadata
   */
  public registerArtifact(data: {
    type: ArtifactType;
    name: string;
    filePath: string;
    description?: string;
    metadata?: ArtifactMetadata;
    provider?: string;
    model?: string;
    prompt?: string;
    status?: 'verified' | 'generating' | 'failed';
    verificationDetails?: string;
  }): Artifact {
    const absPath = path.isAbsolute(data.filePath)
      ? data.filePath
      : path.join(this.workspaceRoot, data.filePath);

    const relPath = path.relative(this.workspaceRoot, absPath).replace(/\\/g, '/');
    let sizeBytes = 0;
    try {
      if (fs.existsSync(absPath)) {
        sizeBytes = fs.statSync(absPath).size;
      }
    } catch {}

    const id = `art_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const previewCap = this.determinePreviewCapability(data.type, absPath);
    const mimeType = this.determineMimeType(absPath);

    const artifact: Artifact = {
      id,
      type: data.type,
      name: data.name || path.basename(absPath),
      description: data.description,
      filePath: absPath,
      relativePath: relPath,
      url: `/workspace-preview/${relPath}`,
      mimeType,
      sizeBytes,
      metadata: data.metadata || {},
      createdAt: new Date().toISOString(),
      provider: data.provider || 'MaxIDE Engine',
      model: data.model,
      prompt: data.prompt,
      status: data.status || 'verified',
      verificationDetails: data.verificationDetails || 'Verified successfully',
      previewCapability: previewCap,
    };

    this.artifacts.set(id, artifact);
    this.saveToDisk();
    return artifact;
  }

  public getArtifact(id: string): Artifact | undefined {
    return this.artifacts.get(id);
  }

  public getArtifactByPath(filePath: string): Artifact | undefined {
    const norm = path.normalize(filePath);
    for (const art of this.artifacts.values()) {
      if (path.normalize(art.filePath) === norm || art.relativePath === filePath.replace(/\\/g, '/')) {
        return art;
      }
    }
    return undefined;
  }

  public listArtifacts(filter?: {
    type?: ArtifactType;
    status?: 'verified' | 'generating' | 'failed';
    search?: string;
  }): Artifact[] {
    let list = Array.from(this.artifacts.values());
    if (filter?.type) {
      list = list.filter((a) => a.type === filter.type);
    }
    if (filter?.status) {
      list = list.filter((a) => a.status === filter.status);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.prompt && a.prompt.toLowerCase().includes(q)) ||
          (a.description && a.description.toLowerCase().includes(q))
      );
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getLatestArtifact(type?: ArtifactType): Artifact | undefined {
    const list = this.listArtifacts(type ? { type } : undefined);
    return list.length > 0 ? list[0] : undefined;
  }

  public updateArtifact(id: string, updates: Partial<Artifact>): Artifact | undefined {
    const existing = this.artifacts.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.artifacts.set(id, updated);
    this.saveToDisk();
    return updated;
  }

  public deleteArtifact(id: string): boolean {
    const deleted = this.artifacts.delete(id);
    if (deleted) this.saveToDisk();
    return deleted;
  }

  /**
   * Scan workspace for any newly created media or document files that aren't yet registered
   */
  public scanWorkspace(): void {
    if (!fs.existsSync(this.workspaceRoot)) return;

    const scanDir = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
            continue;
          }
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            const type = this.detectTypeFromExtension(ext);
            if (type && !this.getArtifactByPath(fullPath)) {
              this.registerArtifact({
                type,
                name: entry.name,
                filePath: fullPath,
                description: `Discovered workspace file: ${entry.name}`,
              });
            }
          }
        }
      } catch {}
    };

    scanDir(this.workspaceRoot);
  }

  private detectTypeFromExtension(ext: string): ArtifactType | null {
    switch (ext) {
      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.webp':
      case '.gif':
      case '.svg':
        return 'IMAGE';
      case '.mp4':
      case '.webm':
      case '.mov':
      case '.avi':
        return 'VIDEO';
      case '.mp3':
      case '.wav':
      case '.ogg':
        return 'AUDIO';
      case '.pdf':
        return 'PDF';
      case '.docx':
        return 'DOCX';
      case '.pptx':
        return 'PRESENTATION';
      case '.csv':
        return 'CSV';
      case '.xlsx':
        return 'XLSX';
      case '.zip':
        return 'ZIP';
      case '.html':
        return 'WEB_APP';
      default:
        return null;
    }
  }

  private determinePreviewCapability(type: ArtifactType, filePath: string): PreviewCapability {
    switch (type) {
      case 'IMAGE':
        return 'image';
      case 'VIDEO':
        return 'video';
      case 'AUDIO':
        return 'audio';
      case 'PDF':
        return 'pdf';
      case 'PRESENTATION':
      case 'PPTX':
        return 'presentation';
      case 'CSV':
      case 'XLSX':
      case 'DATASET':
        return 'table_chart';
      case 'WEB_APP':
        return 'web_app';
      case 'CODE':
      case 'TEXT':
      case 'REPORT':
      default:
        return 'monaco';
    }
  }

  private determineMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const map: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.pdf': 'application/pdf',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.csv': 'text/csv',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.json': 'application/json',
      '.md': 'text/markdown',
      '.txt': 'text/plain',
    };
    return map[ext] || 'application/octet-stream';
  }

  private saveToDisk(): void {
    try {
      const data = Array.from(this.artifacts.values());
      fs.writeFileSync(this.dbFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch {}
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.dbFilePath)) {
        const raw = fs.readFileSync(this.dbFilePath, 'utf8');
        const list: Artifact[] = JSON.parse(raw);
        for (const item of list) {
          if (fs.existsSync(item.filePath)) {
            this.artifacts.set(item.id, item);
          }
        }
      }
    } catch {}
  }
}
