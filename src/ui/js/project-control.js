/**
 * MaxIDE APEX - Autonomous Product Development & Engineering Orchestration
 * Project Control Center Client (Mission 11)
 */

window.MaxProjectControl = (function () {
  'use strict';

  let activeState = null;
  let refreshTimer = null;

  async function fetchState() {
    try {
      const res = await fetch('/api/orchestration/state');
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async function fetchRoadmap() {
    try {
      const res = await fetch('/api/orchestration/roadmap');
      if (!res.ok) return '# No Roadmap Available';
      return await res.text();
    } catch {
      return '# Error loading roadmap';
    }
  }

  async function refreshDashboard() {
    const data = await fetchState();
    const container = document.getElementById('project-control-container');
    if (!container) return;

    if (!data || (!data.active && !data.persisted)) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 48px; text-align: center;">
          <div style="font-size: 32px; margin-bottom: 12px;">🚀</div>
          <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">No Active Autonomous Engineering Project</h3>
          <p style="font-size: 13px; color: var(--text-secondary); max-width: 480px; margin: 0 auto 16px;">
            Describe an application in natural language (e.g., <em>"build a cafe menu and order application"</em> or <em>"build a native Windows hardware manager"</em>) in the APEX Agent chat to initiate autonomous multi-agent orchestration.
          </p>
        </div>
      `;
      return;
    }

    const state = data.state;
    activeState = state;

    const completedTasks = state.tasks?.filter(t => t.status === 'COMPLETED').length || 0;
    const totalTasks = state.tasks?.length || 0;
    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    let html = `
      <div style="padding: 20px; overflow-y: auto; height: 100%;">
        <!-- Header & Action Controls -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <h2 style="font-size: 18px; font-weight: 700;">${escapeHtml(state.objective || 'Autonomous Project')}</h2>
              <span class="badge badge-accent">${escapeHtml(state.targetPlatform || 'WEB_APP')}</span>
              <span class="badge ${state.isCancelled ? 'badge-danger' : state.isPaused ? 'badge-warning' : 'badge-success'}">
                ${state.isCancelled ? 'CANCELLED' : state.isPaused ? 'PAUSED' : 'ACTIVE'}
              </span>
            </div>
            <p style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
              Session ID: <code class="mono">${escapeHtml(state.sessionId || 'current')}</code> | Progress: <strong>${progressPercent}%</strong> (${completedTasks}/${totalTasks} tasks)
            </p>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-sm" onclick="MaxProjectControl.pauseExecution()" ${state.isPaused || state.isCancelled ? 'disabled' : ''}>⏸ Pause</button>
            <button class="btn btn-sm btn-primary" onclick="MaxProjectControl.resumeExecution()" ${!state.isPaused || state.isCancelled ? 'disabled' : ''}>▶ Resume</button>
            <button class="btn btn-sm btn-danger" onclick="MaxProjectControl.cancelExecution()" ${state.isCancelled ? 'disabled' : ''}>✕ Cancel</button>
            <button class="btn btn-sm btn-ghost" onclick="MaxProjectControl.refreshDashboard()">↻ Refresh</button>
          </div>
        </div>

        <!-- Milestones Pipeline -->
        <div class="card" style="margin-bottom: 20px;">
          <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">Milestones &amp; Lifecycle Progress</h3>
          <div style="display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px;">
            ${(state.milestones || []).map(m => {
              const icon = m.status === 'COMPLETED' ? '✅' : m.status === 'IN_PROGRESS' ? '⏳' : m.status === 'FAILED' ? '❌' : '⚪';
              return `
                <div style="flex: 1; min-width: 160px; padding: 12px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-md);">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-size: 11px; font-weight: 700; color: var(--text-muted);">${m.id}</span>
                    <span>${icon}</span>
                  </div>
                  <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px;">${escapeHtml(m.name)}</div>
                  <div style="font-size: 11px; color: var(--text-secondary);">${escapeHtml(m.status)}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Multi-Agent Task Board -->
        <div class="card" style="margin-bottom: 20px;">
          <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">Specialist Engineering Tasks</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">
            ${(state.tasks || []).map(t => {
              const stClass = t.status === 'COMPLETED' ? 'color: var(--accent-green);' : t.status === 'IN_PROGRESS' ? 'color: var(--accent-cyan);' : t.status === 'FAILED' ? 'color: var(--accent-red);' : 'color: var(--text-muted);';
              return `
                <div style="padding: 12px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-md);">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span class="badge" style="font-size: 10px; font-weight: 700;">${escapeHtml(t.assignedRole)}</span>
                    <span class="mono" style="font-size: 11px; font-weight: 700; ${stClass}">● ${escapeHtml(t.status)}</span>
                  </div>
                  <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 4px;">${escapeHtml(t.title)}</h4>
                  <p style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">${escapeHtml(t.description)}</p>
                  ${t.evidence?.verificationNotes ? `<div style="font-size: 11px; color: var(--text-muted); background: var(--bg-primary); padding: 6px; border-radius: 4px;">${escapeHtml(t.evidence.verificationNotes)}</div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Defect Tracker & Roadmap Link -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div class="card">
            <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">Defect Diagnostics &amp; Repairs</h3>
            ${(!state.defects || state.defects.length === 0)
              ? '<p style="font-size: 12px; color: var(--text-muted);">Zero open defects recorded. Quality gates verified.</p>'
              : `
                <div style="display: flex; flex-col; gap: 8px;">
                  ${state.defects.map(d => `
                    <div style="padding: 8px; border-left: 3px solid ${d.status === 'RESOLVED' ? 'var(--accent-green)' : 'var(--accent-red)'}; background: var(--bg-surface); margin-bottom: 6px;">
                      <div style="display: flex; justify-content: space-between; font-size: 11px;">
                        <strong>[${escapeHtml(d.severity)}] ${escapeHtml(d.category)}</strong>
                        <span class="badge">${escapeHtml(d.status)}</span>
                      </div>
                      <div style="font-size: 12px; margin-top: 4px;">${escapeHtml(d.description)}</div>
                      ${d.resolution ? `<div style="font-size: 11px; color: var(--accent-green); margin-top: 2px;">Fixed: ${escapeHtml(d.resolution)}</div>` : ''}
                    </div>
                  `).join('')}
                </div>
              `}
          </div>

          <div class="card">
            <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">Active File Ownership Locks</h3>
            ${(!state.activeLocks || state.activeLocks.length === 0)
              ? '<p style="font-size: 12px; color: var(--text-muted);">All file locks released. Safe for developer editing.</p>'
              : `
                <ul style="font-size: 12px; list-style: none; padding: 0;">
                  ${state.activeLocks.map(l => `
                    <li style="padding: 6px 0; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between;">
                      <code class="mono">${escapeHtml(l.filePath)}</code>
                      <span class="badge">${escapeHtml(l.ownerRole)}</span>
                    </li>
                  `).join('')}
                </ul>
              `}
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  async function pauseExecution() {
    await fetch('/api/orchestration/pause', { method: 'POST' });
    refreshDashboard();
  }

  async function resumeExecution() {
    await fetch('/api/orchestration/resume', { method: 'POST' });
    refreshDashboard();
  }

  async function cancelExecution() {
    if (!confirm('Are you sure you want to cancel the active engineering pipeline?')) return;
    await fetch('/api/orchestration/cancel', { method: 'POST' });
    refreshDashboard();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return {
    refreshDashboard,
    pauseExecution,
    resumeExecution,
    cancelExecution,
  };
})();
