/**
 * MaxIDE APEX - Autonomous Engineering Safety & Workspace Guard
 * Enforces permission gates for:
 * - Destructive filesystem operations (deletion, format, clean rm -rf)
 * - External deployments & cloud publishing
 * - Publishing to GitHub / external remotes
 * - Production database modifications
 * - Secret / credential changes
 * - Irreversible actions
 *
 * Allows routine reversible engineering actions (create file, edit with checkpoint, run local dev test)
 * to proceed autonomously within configured permissions.
 */

import path from 'path';
import fs from 'fs';

export type OperationCategory =
  | 'ROUTINE_EDIT'
  | 'DESTRUCTIVE_FILESYSTEM'
  | 'EXTERNAL_DEPLOYMENT'
  | 'GIT_REMOTE_PUSH'
  | 'DATABASE_MUTATION'
  | 'SECRET_ACCESS';

export interface GuardEvaluation {
  allowed: boolean;
  requiresApproval: boolean;
  category: OperationCategory;
  reason?: string;
  recommendedAction?: string;
}

export class WorkspaceGuard {
  private workspaceRoot: string;
  private autoApproveRoutine: boolean = true;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  public evaluateFileOperation(filePath: string, operation: 'READ' | 'WRITE' | 'DELETE'): GuardEvaluation {
    const resolved = path.resolve(this.workspaceRoot, filePath);

    // Escape containment check
    if (!resolved.startsWith(this.workspaceRoot)) {
      const evalRes: GuardEvaluation = {
        allowed: false,
        requiresApproval: true,
        category: 'DESTRUCTIVE_FILESYSTEM',
        reason: `Target path "${filePath}" escapes active workspace containment (${this.workspaceRoot}).`,
        recommendedAction: 'Block unauthorized filesystem access outside workspace.',
      };
      this.logSecurityEvent('PATH_TRAVERSAL_BLOCKED', filePath, evalRes.reason);
      return evalRes;
    }

    // Secret credential protection
    const lowerFile = path.basename(resolved).toLowerCase();
    const isSecretFile = lowerFile === '.env' || lowerFile.endsWith('.pem') || lowerFile.endsWith('.key') || lowerFile === 'id_rsa' || lowerFile === 'secrets.json';
    if (isSecretFile && (operation === 'WRITE' || operation === 'DELETE')) {
      const evalRes: GuardEvaluation = {
        allowed: false,
        requiresApproval: true,
        category: 'SECRET_ACCESS',
        reason: `Modification or deletion of credential secret "${path.basename(resolved)}" is restricted.`,
        recommendedAction: 'Block unauthorized write/delete on sensitive credentials.',
      };
      this.logSecurityEvent('CREDENTIAL_GUARD_TRIGGERED', filePath, evalRes.reason);
      return evalRes;
    }

    if (operation === 'DELETE') {
      const isCritical =
        resolved.endsWith('.git') ||
        resolved.endsWith('.env') ||
        resolved.endsWith('package.json') ||
        resolved.endsWith('App.cs') ||
        resolved.endsWith('index.html');

      return {
        allowed: !isCritical,
        requiresApproval: isCritical,
        category: 'DESTRUCTIVE_FILESYSTEM',
        reason: isCritical
          ? `Deletion of core project deliverable "${path.basename(resolved)}" is a destructive operation.`
          : undefined,
        recommendedAction: isCritical ? 'Request explicit user confirmation before deletion.' : 'Proceed',
      };
    }

    // Routine Write or Read within workspace is safe and autonomous
    return {
      allowed: true,
      requiresApproval: false,
      category: 'ROUTINE_EDIT',
    };
  }

  public evaluateFileOwnership(filePath: string, requestingRole: string, activeLocks: Array<{ filePath: string; ownerRole: string }>): GuardEvaluation {
    const norm = path.normalize(filePath).toLowerCase();
    const existingLock = activeLocks.find(l => path.normalize(l.filePath).toLowerCase() === norm);
    if (existingLock && existingLock.ownerRole !== requestingRole) {
      const reason = `File "${filePath}" is actively locked by "${existingLock.ownerRole}". Role "${requestingRole}" cannot overwrite it.`;
      this.logSecurityEvent('LOCK_CONFLICT_PREVENTED', filePath, reason);
      return {
        allowed: false,
        requiresApproval: true,
        category: 'ROUTINE_EDIT',
        reason,
        recommendedAction: 'Wait for owner specialist to release file lock or finish task.',
      };
    }
    return {
      allowed: true,
      requiresApproval: false,
      category: 'ROUTINE_EDIT',
    };
  }

  public logSecurityEvent(eventType: string, target: string, details?: string): void {
    try {
      const logDir = path.join(this.workspaceRoot, '.maxide');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logFile = path.join(logDir, 'security_audit.log');
      const entry = `[${new Date().toISOString()}] [${eventType}] Target: "${target}" - ${details || ''}\n`;
      fs.appendFileSync(logFile, entry, 'utf8');
    } catch {}
  }

  public evaluateCommand(command: string): GuardEvaluation {
    const lower = command.toLowerCase().trim();

    // 1. Git Remote Publishing / Push
    if (/\bgit\s+(push|publish)\b/i.test(lower)) {
      return {
        allowed: false,
        requiresApproval: true,
        category: 'GIT_REMOTE_PUSH',
        reason: 'Publishing code to external Git remotes requires explicit user authorization.',
        recommendedAction: 'Prompt user with target branch and remote URL before pushing.',
      };
    }

    // 2. Destructive Filesystem Commands
    if (/\b(rm\s+-rf|rmdir\s+\/s|del\s+\/f|format\s+[a-z]:|drop\s+database)\b/i.test(lower)) {
      return {
        allowed: false,
        requiresApproval: true,
        category: 'DESTRUCTIVE_FILESYSTEM',
        reason: 'Dangerous destructive command pattern detected.',
        recommendedAction: 'Block command or require explicit typed confirmation.',
      };
    }

    // 3. External Deployments (Netlify, Vercel, AWS, Cloudflare, etc.)
    if (/\b(vercel\s+deploy|netlify\s+deploy|aws\s+s3|fly\s+deploy)\b/i.test(lower)) {
      return {
        allowed: false,
        requiresApproval: true,
        category: 'EXTERNAL_DEPLOYMENT',
        reason: 'Deploying application to cloud providers requires user approval and API tokens.',
        recommendedAction: 'Verify deployment targets and credentials with user.',
      };
    }

    // 4. Secret / Credential Inspection
    if (/\b(type\s+\.env|cat\s+\.env|printenv|env\s*\|\s*grep)\b/i.test(lower)) {
      return {
        allowed: false,
        requiresApproval: true,
        category: 'SECRET_ACCESS',
        reason: 'Attempting to inspect secret environment variables.',
        recommendedAction: 'Redact secrets or ask user before printing credentials.',
      };
    }

    // Routine build, test, compilation commands proceed autonomously
    return {
      allowed: true,
      requiresApproval: false,
      category: 'ROUTINE_EDIT',
    };
  }
}
