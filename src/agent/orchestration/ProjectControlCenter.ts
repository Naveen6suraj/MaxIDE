/**
 * MaxIDE APEX - Autonomous Product Development & Engineering Orchestration
 * Project Control Center:
 * Real-time control dashboard, milestone tracker, task board,
 * agent assignments, pause/resume/cancel controls, and defect board.
 */

import express, { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { OrchestrationCoordinator } from './OrchestrationCoordinator.js';
import { SharedEngineeringContext } from './SharedEngineeringContext.js';

export class ProjectControlCenter {
  private workspaceRoot: string;
  private coordinator: OrchestrationCoordinator;
  private currentContext?: SharedEngineeringContext;

  constructor(workspaceRoot: string, coordinator: OrchestrationCoordinator) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.coordinator = coordinator;
  }

  public setCurrentContext(context: SharedEngineeringContext): void {
    this.currentContext = context;
  }

  public createRouter(): Router {
    const router = express.Router();

    // 1. Get Project State & Metrics
    router.get('/state', (req: Request, res: Response) => {
      if (this.currentContext) {
        return res.json({
          active: true,
          state: this.currentContext.getState(),
        });
      }

      // Fallback: Read from .maxide/task_board.json if available
      const tbPath = path.join(this.workspaceRoot, '.maxide', 'task_board.json');
      if (fs.existsSync(tbPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(tbPath, 'utf8'));
          return res.json({
            active: false,
            persisted: true,
            state: data,
          });
        } catch {}
      }

      return res.json({
        active: false,
        message: 'No active or persisted autonomous engineering project found.',
      });
    });

    // 2. Get Roadmap Markdown
    router.get('/roadmap', (req: Request, res: Response) => {
      const rmPath = path.join(this.workspaceRoot, '.maxide', 'ROADMAP.md');
      if (fs.existsSync(rmPath)) {
        return res.type('text/markdown').send(fs.readFileSync(rmPath, 'utf8'));
      }
      return res.status(404).send('# Roadmap Not Found\nNo active project roadmap available.');
    });

    // 3. Get Product Specification Markdown
    router.get('/spec', (req: Request, res: Response) => {
      const specPath = path.join(this.workspaceRoot, '.maxide', 'PRODUCT_SPEC.md');
      if (fs.existsSync(specPath)) {
        return res.type('text/markdown').send(fs.readFileSync(specPath, 'utf8'));
      }
      return res.status(404).send('# Specification Not Found\nNo active project specification available.');
    });

    // 4. Pause Execution
    router.post('/pause', (req: Request, res: Response) => {
      if (this.currentContext) {
        this.currentContext.pause();
        return res.json({ success: true, message: 'Autonomous engineering execution paused.' });
      }
      return res.status(400).json({ success: false, error: 'No active orchestration session to pause.' });
    });

    // 5. Resume Execution
    router.post('/resume', (req: Request, res: Response) => {
      if (this.currentContext) {
        this.currentContext.resume();
        return res.json({ success: true, message: 'Autonomous engineering execution resumed.' });
      }
      return res.status(400).json({ success: false, error: 'No active orchestration session to resume.' });
    });

    // 6. Cancel Execution
    router.post('/cancel', (req: Request, res: Response) => {
      if (this.currentContext) {
        this.currentContext.cancel();
        return res.json({ success: true, message: 'Autonomous engineering execution cancelled.' });
      }
      return res.status(400).json({ success: false, error: 'No active orchestration session to cancel.' });
    });

    // 7. Start Autonomous Orchestration Pipeline
    router.post('/start', async (req: Request, res: Response) => {
      const prompt = req.body.prompt;
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ success: false, error: 'User request prompt string is required.' });
      }

      try {
        const report = await this.coordinator.orchestrateProduct(prompt);
        return res.json({ success: true, report });
      } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });

    // 8. Get Durable Checkpoint History
    router.get('/checkpoints', (req: Request, res: Response) => {
      if (this.currentContext) {
        return res.json({
          success: true,
          checkpoints: this.currentContext.getState().checkpoints,
        });
      }
      return res.json({ success: true, checkpoints: [] });
    });

    // 9. Rollback to Specific Durable Checkpoint
    router.post('/rollback', (req: Request, res: Response) => {
      const checkpointId = req.body.checkpointId;
      if (!checkpointId) {
        return res.status(400).json({ success: false, error: 'checkpointId is required.' });
      }

      if (this.currentContext) {
        const ok = this.currentContext.rollbackToCheckpoint(checkpointId);
        return res.json({
          success: ok,
          message: ok ? `Rolled back to checkpoint ${checkpointId}.` : `Failed to rollback to checkpoint ${checkpointId}.`,
        });
      }
      return res.status(400).json({ success: false, error: 'No active context for rollback.' });
    });

    // 10. Get Structured Specialist Handoffs
    router.get('/handoffs', (req: Request, res: Response) => {
      if (this.currentContext) {
        return res.json({
          success: true,
          handoffs: this.currentContext.getHandoffs(),
        });
      }
      return res.json({ success: true, handoffs: [] });
    });

    // 11. Real-time System & Process Resource Telemetry
    router.get('/resources', (req: Request, res: Response) => {
      const telemetry = this.coordinator.getResourceTelemetry();
      return res.json({
        success: true,
        telemetry,
      });
    });

    // 12. Cold Restart / Resume Project from Disk Context
    router.post('/resume-project', async (req: Request, res: Response) => {
      try {
        const report = await this.coordinator.resumeExistingProject();
        return res.json({ success: true, report });
      } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });

    return router;
  }
}
