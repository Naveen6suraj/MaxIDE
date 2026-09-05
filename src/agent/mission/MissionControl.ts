/**
 * MaxIDE - Unlimited AI Provider Platform
 * Multi-Agent Mission Control & Task Coordinator
 * 
 * Manages concurrent/queued tasks with file conflict detection.
 */

export type MissionStatus = 'QUEUED' | 'RUNNING' | 'WAITING_APPROVAL' | 'COMPLETED' | 'FAILED';

export interface AgentMission {
  id: string;
  objective: string;
  modelId: string;
  providerId?: string;
  status: MissionStatus;
  filesChanged: string[];
  toolCallsCount: number;
  errors: string[];
  logs: string[];
  result?: any;
  startTime: Date;
  endTime?: Date;
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  conflictingMissionId?: string;
  conflictingFiles: string[];
}

export class MissionControl {
  private missions: Map<string, AgentMission> = new Map();
  private onMissionUpdateCallback?: (mission: AgentMission) => void;

  public setOnMissionUpdate(cb: (mission: AgentMission) => void): void {
    this.onMissionUpdateCallback = cb;
  }

  public createMission(objective: string, modelId: string, providerId?: string): AgentMission {
    const id = `mission-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const mission: AgentMission = {
      id,
      objective,
      modelId,
      providerId,
      status: 'QUEUED',
      filesChanged: [],
      toolCallsCount: 0,
      errors: [],
      logs: [`[${new Date().toLocaleTimeString()}] Task queued: ${objective}`],
      startTime: new Date(),
    };

    this.missions.set(id, mission);
    this.notify(mission);
    return mission;
  }

  public updateMissionStatus(id: string, status: MissionStatus, error?: string): void {
    const mission = this.missions.get(id);
    if (!mission) return;

    mission.status = status;
    if (error) {
      mission.errors.push(error);
      mission.logs.push(`[${new Date().toLocaleTimeString()}] Error: ${error}`);
    }
    if (status === 'COMPLETED' || status === 'FAILED') {
      mission.endTime = new Date();
    }
    this.notify(mission);
  }

  public recordToolCall(id: string, toolName: string, filesAffected?: string[]): void {
    const mission = this.missions.get(id);
    if (!mission) return;

    mission.toolCallsCount++;
    mission.logs.push(`[${new Date().toLocaleTimeString()}] Executed tool: ${toolName}`);

    if (filesAffected && filesAffected.length > 0) {
      for (const f of filesAffected) {
        if (!mission.filesChanged.includes(f)) {
          mission.filesChanged.push(f);
        }
      }
    }
    this.notify(mission);
  }

  /**
   * Conflict Detection: checks if another currently active mission is modifying any of the target files.
   */
  public detectConflicts(currentMissionId: string, targetFiles: string[]): ConflictCheckResult {
    for (const [id, mission] of this.missions) {
      if (id === currentMissionId) continue;
      if (mission.status === 'RUNNING' || mission.status === 'WAITING_APPROVAL') {
        const intersection = targetFiles.filter((f) => mission.filesChanged.includes(f));
        if (intersection.length > 0) {
          return {
            hasConflict: true,
            conflictingMissionId: id,
            conflictingFiles: intersection,
          };
        }
      }
    }

    return { hasConflict: false, conflictingFiles: [] };
  }

  public getAllMissions(): AgentMission[] {
    return Array.from(this.missions.values());
  }

  public getMission(id: string): AgentMission | undefined {
    return this.missions.get(id);
  }

  private notify(mission: AgentMission): void {
    if (this.onMissionUpdateCallback) {
      this.onMissionUpdateCallback(mission);
    }
  }
}
