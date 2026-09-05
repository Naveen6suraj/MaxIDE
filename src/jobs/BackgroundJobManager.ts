/**
 * MaxIDE - Universal Background Job Manager
 * Implements Section 9 & 10 of Master Architecture:
 * Asynchronous job execution, progress tracking, and persistence.
 * Guarantees long-running operations (video synthesis, model fine-tuning, large builds)
 * never block the interactive workspace.
 */

import fs from 'fs';
import path from 'path';
import { Artifact } from '../artifacts/ArtifactManager.js';
import { CapabilityCategory } from '../capabilities/CapabilityRegistry.js';

export type JobStatus =
  | 'SUBMITTED'
  | 'QUEUED'
  | 'GENERATING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface BackgroundJob {
  id: string;
  taskId?: string;
  projectId?: string;
  title: string;
  capability: CapabilityCategory;
  provider: string;
  status: JobStatus;
  progressPercent: number;
  statusDetails?: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  result?: any;
  artifactId?: string;
  artifact?: Artifact;
  error?: string;
  cancellationRequested?: boolean;
}

export class BackgroundJobManager {
  private jobs: Map<string, BackgroundJob> = new Map();
  private storagePath: string;

  constructor(workspaceRoot: string) {
    const metaDir = path.join(workspaceRoot, '.maxide');
    if (!fs.existsSync(metaDir)) {
      try {
        fs.mkdirSync(metaDir, { recursive: true });
      } catch {}
    }
    this.storagePath = path.join(metaDir, 'jobs.json');
    this.loadFromDisk();
  }

  public setWorkspaceRoot(newRoot: string): void {
    const metaDir = path.join(newRoot, '.maxide');
    if (!fs.existsSync(metaDir)) {
      try {
        fs.mkdirSync(metaDir, { recursive: true });
      } catch {}
    }
    this.storagePath = path.join(metaDir, 'jobs.json');
    this.loadFromDisk();
  }

  /**
   * Submit and start a new background job
   */
  public submitJob(params: {
    taskId?: string;
    projectId?: string;
    title: string;
    capability: CapabilityCategory;
    provider: string;
    initialStatus?: JobStatus;
    statusDetails?: string;
  }): BackgroundJob {
    const id = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = new Date().toISOString();

    const job: BackgroundJob = {
      id,
      taskId: params.taskId,
      projectId: params.projectId,
      title: params.title,
      capability: params.capability,
      provider: params.provider,
      status: params.initialStatus || 'QUEUED',
      progressPercent: 0,
      statusDetails: params.statusDetails || 'Job queued for execution',
      startedAt: now,
      updatedAt: now,
    };

    this.jobs.set(id, job);
    this.saveToDisk();
    return job;
  }

  /**
   * Update progress of a running background job
   */
  public updateProgress(
    id: string,
    percent: number,
    statusDetails?: string,
    status: JobStatus = 'GENERATING'
  ): void {
    const job = this.jobs.get(id);
    if (!job) return;

    if (job.cancellationRequested) {
      job.status = 'CANCELLED';
      job.statusDetails = 'Job cancelled by user';
      job.updatedAt = new Date().toISOString();
      this.saveToDisk();
      return;
    }

    job.progressPercent = Math.max(0, Math.min(100, percent));
    if (statusDetails) job.statusDetails = statusDetails;
    job.status = status;
    job.updatedAt = new Date().toISOString();
    this.saveToDisk();
  }

  /**
   * Mark a job as completed with its resulting artifact
   */
  public completeJob(id: string, result?: any, artifact?: Artifact): void {
    const job = this.jobs.get(id);
    if (!job) return;

    job.status = 'COMPLETED';
    job.progressPercent = 100;
    job.statusDetails = 'Completed successfully';
    job.result = result;
    if (artifact) {
      job.artifactId = artifact.id;
      job.artifact = artifact;
    }
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
    this.saveToDisk();
  }

  /**
   * Mark a job as failed
   */
  public failJob(id: string, error: string): void {
    const job = this.jobs.get(id);
    if (!job) return;

    job.status = 'FAILED';
    job.error = error;
    job.statusDetails = `Failed: ${error}`;
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
    this.saveToDisk();
  }

  /**
   * Request cancellation of a background job
   */
  public cancelJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    job.cancellationRequested = true;
    job.status = 'CANCELLED';
    job.statusDetails = 'Cancelled by user';
    job.updatedAt = new Date().toISOString();
    this.saveToDisk();
    return true;
  }

  public getJob(id: string): BackgroundJob | undefined {
    return this.jobs.get(id);
  }

  public listJobs(filter?: { status?: JobStatus; capability?: CapabilityCategory }): BackgroundJob[] {
    let list = Array.from(this.jobs.values());
    if (filter?.status) list = list.filter(j => j.status === filter.status);
    if (filter?.capability) list = list.filter(j => j.capability === filter.capability);
    return list.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  public getActiveJobs(): BackgroundJob[] {
    return Array.from(this.jobs.values()).filter(j =>
      j.status === 'SUBMITTED' || j.status === 'QUEUED' || j.status === 'GENERATING'
    );
  }

  private saveToDisk(): void {
    try {
      const data = Array.from(this.jobs.values());
      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2), 'utf8');
    } catch {}
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const list: BackgroundJob[] = JSON.parse(raw);
        this.jobs.clear();
        for (const j of list) {
          // If a job was left in GENERATING state when server exited, mark as interrupted/recoverable
          if (j.status === 'GENERATING' || j.status === 'QUEUED') {
            j.statusDetails = 'Interrupted by session shutdown (Recoverable)';
          }
          this.jobs.set(j.id, j);
        }
      }
    } catch {}
  }
}
