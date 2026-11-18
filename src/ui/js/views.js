/* ==========================================================================
   MAXIDE APEX — Feature Views & Controllers
   Command Center • Mission Control • Live Preview Studio • 12-Section Settings
   Explorer • Search • Git • Structure • Integrations • Bottom Panel • Palette
   ========================================================================== */

window.MaxViews = (function () {
  const { api, escapeHtml, toast, confirmDialog, formatRelativeTime } = window.MaxUI;

  const viewState = {
    currentView: 'home', // 'home' | 'workspace' | 'mission' | 'preview'
    settingsSection: 'providers',
    previewViewport: 'desktop',
    previewHistory: [],
    previewHistoryIdx: -1,
    allFlatFiles: [],
    terminalHistory: [],
    terminalHistoryIdx: -1,
    problems: [],
    outputLogs: [],
    debugLogs: [],
    notifications: [],
    providersCache: [],
    modelsCache: [],
    healthCache: null,
    projectsCache: [],
    activeProjectId: null,
    paletteMode: 'commands', // 'commands' | 'files'
    paletteSelectedIdx: 0,
    editorPrefs: JSON.parse(localStorage.getItem('maxide_editor_prefs') || '{"fontSize":13,"tabSize":2,"wordWrap":"off","minimap":false}'),
  };

  function pushLog(bucket, message, level = 'info') {
    const entry = {
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      level,
      message: String(message),
    };
    if (bucket === 'output') {
      viewState.outputLogs.push(entry);
      renderOutputPanel();
    } else if (bucket === 'debug') {
      viewState.debugLogs.push(entry);
      renderDebugPanel();
    } else if (bucket === 'problem') {
      viewState.problems.push(entry);
      renderProblemsPanel();
    }
  }

  function addNotification(title, detail, level = 'info') {
    viewState.notifications.unshift({
      id: Date.now() + Math.random(),
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      title,
      detail,
      level,
    });
    if (viewState.notifications.length > 30) viewState.notifications.pop();
    const badge = document.getElementById('notif-count-badge');
    if (badge) {
      badge.textContent = String(viewState.notifications.length);
      badge.classList.remove('hidden');
    }
  }

  // =========================================================================
  // VIEW SWITCHER (Command Center | Workspace | Mission Control | Preview)
  // =========================================================================
  function switchMainView(view) {
    viewState.currentView = view;
    ['home', 'workspace', 'mission', 'preview'].forEach((v) => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.classList.toggle('hidden', v !== view);
      const tab = document.getElementById(`nav-view-${v}`);
      if (tab) {
        tab.classList.toggle('active', v === view);
        tab.setAttribute('aria-selected', v === view ? 'true' : 'false');
      }
    });

    if (view === 'home') {
      refreshCommandCenter();
    } else if (view === 'workspace') {
      setTimeout(() => {
        if (window.monacoEditor) window.monacoEditor.layout();
      }, 60);
    } else if (view === 'mission') {
      refreshMissionControl();
    } else if (view === 'preview') {
      initPreviewStudio();
    }
  }

  // =========================================================================
  // COMMAND CENTER (FIRST-LAUNCH DASHBOARD)
  // =========================================================================
  function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning, Engineer';
    if (h < 18) return 'Good afternoon, Engineer';
    return 'Good evening, Engineer';
  }

  async function refreshCommandCenter() {
    const greetEl = document.getElementById('cc-greeting-text');
    if (greetEl) greetEl.textContent = getGreeting();

    try {
      // Phase 1 (Instant <20ms): Render local telemetry, projects, and git immediately
      const [health, projectsData, recentData, gitStatus] = await Promise.all([
        api.get('/api/health').catch(() => null),
        api.get('/api/projects').catch(() => ({ projects: [] })),
        api.get('/api/workspace/recent').catch(() => []),
        api.get('/api/workspace/git/status').catch(() => null),
      ]);

      viewState.healthCache = health;
      const projects = Array.isArray(projectsData?.projects) ? projectsData.projects : (Array.isArray(projectsData) ? projectsData : []);
      viewState.projectsCache = projects;
      if (projectsData?.activeProjectId) viewState.activeProjectId = projectsData.activeProjectId;

      renderCommandCenterHealth(health, viewState.providersCache);
      renderCommandCenterProjects(projects, Array.isArray(recentData) ? recentData : [], gitStatus);

      // Phase 2 (Async): Probe provider health & Ollama availability without blocking initial render
      api.get('/api/providers').then((providers) => {
        viewState.providersCache = Array.isArray(providers) ? providers : [];
        renderCommandCenterHealth(viewState.healthCache, viewState.providersCache);
      }).catch(() => {});
    } catch (err) {
      pushLog('output', `Command Center refresh error: ${err.message}`, 'error');
    }
  }

  function renderCommandCenterHealth(health, providers) {
    const container = document.getElementById('cc-health-grid');
    if (!container) return;

    const ollama = providers.find((p) => p.apiType === 'ollama' || p.id.includes('ollama'));
    const ollamaOnline = ollama?.health?.status === 'online';
    const activeProvider = providers.find((p) => p.isEnabled && p.health?.status === 'online') || providers.find((p) => p.isEnabled);
    const activeModel = health?.activeModel || document.getElementById('topbar-model-select')?.value || 'auto';
    const lifecycle = health?.agentLifecycle || 'IDLE';
    const tel = health?.telemetry || {};

    const lifecycleDot = lifecycle === 'FAILED' ? 'error' : (['PLANNING', 'INSPECTING', 'EXECUTING', 'TESTING', 'REPAIRING'].includes(lifecycle) ? 'working' : 'online');

    container.innerHTML = `
      <div class="cc-metric-box">
        <span class="cc-metric-label">Active AI Provider</span>
        <span class="cc-metric-val">
          <span class="status-dot ${activeProvider?.health?.status === 'online' ? 'online' : 'warning'}"></span>
          <span class="truncate">${escapeHtml(activeProvider ? activeProvider.name : 'Not Configured')}</span>
        </span>
      </div>
      <div class="cc-metric-box">
        <span class="cc-metric-label">Selected Model</span>
        <span class="cc-metric-val mono truncate">${escapeHtml(activeModel)}</span>
      </div>
      <div class="cc-metric-box">
        <span class="cc-metric-label">Ollama Local Runtime</span>
        <span class="cc-metric-val">
          <span class="status-dot ${ollamaOnline ? 'online' : 'error'}"></span>
          <span>${ollamaOnline ? 'Online (Local)' : 'Offline'}</span>
        </span>
      </div>
      <div class="cc-metric-box">
        <span class="cc-metric-label">Agent Engine Status</span>
        <span class="cc-metric-val">
          <span class="status-dot ${lifecycleDot}"></span>
          <span class="mono">${escapeHtml(lifecycle)}</span>
        </span>
      </div>
      <div class="cc-metric-box">
        <span class="cc-metric-label">CPU & Compute</span>
        <span class="cc-metric-val mono">${tel.cpuCores ? `${tel.cpuCores} Threads` : 'Local Host'}</span>
      </div>
      <div class="cc-metric-box">
        <span class="cc-metric-label">Memory Telemetry</span>
        <span class="cc-metric-val mono">${tel.totalMemMb ? `${tel.memUsagePct}% (${Math.round((tel.totalMemMb - tel.freeMemMb) / 1024 * 10) / 10}/${Math.round(tel.totalMemMb / 1024)} GB)` : 'Active'}</span>
      </div>
    `;

    // Update status bar telemetry
    const sbHealth = document.getElementById('sb-telemetry');
    if (sbHealth && tel.totalMemMb) {
      sbHealth.textContent = `CPU ${tel.cpuCores}c • RAM ${tel.memUsagePct}% • Heap ${tel.heapUsedMb}MB`;
    }
    const sbOllama = document.getElementById('sb-ollama-status');
    if (sbOllama) {
      sbOllama.innerHTML = `<span class="status-dot ${ollamaOnline ? 'online' : 'warning'}"></span> Ollama: ${ollamaOnline ? 'Online' : 'Offline'}`;
    }
  }

  function inferTechBadge(name, pPath) {
    const s = `${name} ${pPath}`.toLowerCase();
    if (s.includes('react') || s.includes('next') || s.includes('web')) return 'TypeScript / Web';
    if (s.includes('python') || s.includes('py')) return 'Python';
    if (s.includes('rust')) return 'Rust';
    return 'Node.js / JS';
  }

  function renderCommandCenterProjects(projects, recentList, gitStatus) {
    const container = document.getElementById('cc-recent-projects');
    if (!container) return;

    const merged = [];
    const seen = new Set();
    projects.forEach((p) => {
      const key = (p.activeWorkspace || p.path || p.id || '').toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({
          id: p.id,
          name: p.name || (p.activeWorkspace || '').split(/[\\/]/).pop() || 'Project',
          path: p.activeWorkspace || (p.folders && p.folders[0]) || '',
          updatedAt: p.lastOpened || p.updatedAt || p.createdAt,
          tech: p.technology || inferTechBadge(p.name || '', p.activeWorkspace || ''),
          isProjectRecord: true,
        });
      }
    });
    recentList.forEach((r) => {
      const pPath = typeof r === 'string' ? r : (r.path || r.directory || '');
      const key = pPath.toLowerCase();
      if (pPath && !seen.has(key)) {
        seen.add(key);
        merged.push({
          id: null,
          name: (typeof r === 'object' && r.name) ? r.name : pPath.split(/[\\/]/).pop() || 'Workspace',
          path: pPath,
          updatedAt: typeof r === 'object' ? r.lastOpened : null,
          tech: inferTechBadge('', pPath),
          isProjectRecord: false,
        });
      }
    });

    if (merged.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding: 28px;">
          <p style="color: var(--text-secondary); margin-bottom: 10px;">No recent projects recorded yet.</p>
          <button class="btn btn-primary btn-sm" onclick="MaxViews.openNewProjectModal()">Create Your First Project</button>
        </div>
      `;
      return;
    }

    const gitBranch = gitStatus?.branch || (gitStatus?.isRepo ? 'main' : 'Local');
    container.innerHTML = merged.slice(0, 6).map((proj) => `
      <div class="cc-project-row">
        <div class="flex-col" style="min-width:0; gap: 3px;">
          <div class="flex items-center gap-2">
            <span style="font-weight: 600; color: var(--text-primary);" class="truncate">${escapeHtml(proj.name)}</span>
            <span class="badge badge-accent">${escapeHtml(proj.tech)}</span>
          </div>
          <div class="flex items-center gap-3" style="font-size: var(--text-xs); color: var(--text-muted);">
            <span class="mono truncate" style="max-width: 280px;" title="${escapeHtml(proj.path)}">${escapeHtml(proj.path || 'Active Workspace')}</span>
            <span>${formatRelativeTime(proj.updatedAt)}</span>
            <span class="mono" style="color: var(--accent-cyan);">git: ${escapeHtml(gitBranch)}</span>
          </div>
        </div>
        <button class="btn btn-sm" onclick="MaxViews.openRecentProject(${proj.id ? `'${escapeHtml(proj.id)}'` : 'null'}, '${escapeHtml(proj.path).replace(/\\/g, '\\\\')}')">
          Open
        </button>
      </div>
    `).join('');
  }

  async function openRecentProject(projectId, projectPath) {
    try {
      if (projectId) {
        await api.post(`/api/projects/${encodeURIComponent(projectId)}/switch`);
      } else if (projectPath) {
        await api.post('/api/workspace/switch', { path: projectPath });
      }
      toast('Workspace switched successfully', 'success');
      switchMainView('workspace');
      if (window.refreshFileTree) await window.refreshFileTree();
      refreshGitPanel();
      refreshStructurePanel();
    } catch (err) {
      toast(`Failed to open project: ${err.message}`, 'error');
    }
  }

  function launchFromCommandCenter(overridePrompt) {
    const input = document.getElementById('cc-prompt-input');
    const prompt = (overridePrompt || (input ? input.value : '') || '').trim();
    if (!prompt) {
      toast('Enter an engineering task or select a quick action', 'warning');
      if (input) input.focus();
      return;
    }
    if (input && !overridePrompt) input.value = '';
    switchMainView('workspace');
    const agentInput = document.getElementById('agent-prompt-input');
    if (agentInput) {
      agentInput.value = prompt;
      if (window.dispatchAgentTask) {
        window.dispatchAgentTask();
      }
    }
  }

  // =========================================================================
  // AGENT MISSION CONTROL
  // =========================================================================
  async function refreshMissionControl() {
    try {
      const [health, plan, tasksData, approvals, jobsData] = await Promise.all([
        api.get('/api/health').catch(() => null),
        api.get('/api/agent/plan').catch(() => null),
        api.get('/api/tasks').catch(() => ({ tasks: [] })),
        api.get('/api/terminal/approvals').catch(() => []),
        api.get('/api/jobs').catch(() => ({ jobs: [] })),
      ]);

      const lifecycle = health?.agentLifecycle || 'IDLE';
      const evidence = health?.executionEvidence || {
        inspectedFiles: [],
        modifiedFiles: [],
        commandsExecuted: [],
        testsRun: 0,
        testsPassed: 0,
        diagnostics: [],
      };
      const tasks = Array.isArray(tasksData?.tasks) ? tasksData.tasks : [];

      // Update lifecycle stepper
      const stages = ['PLANNING', 'INSPECTING', 'EXECUTING', 'TESTING', 'DIAGNOSING', 'REPAIRING', 'COMPLETED'];
      const currentIdx = stages.indexOf(lifecycle);
      const stepperEl = document.getElementById('mc-stage-stepper');
      if (stepperEl) {
        stepperEl.innerHTML = stages.map((st, idx) => {
          let cls = 'stage-pill';
          if (lifecycle === 'FAILED' && idx === Math.max(0, currentIdx)) cls += ' failed';
          else if (st === lifecycle) cls += ' active';
          else if (currentIdx > idx) cls += ' done';
          return `<span class="${cls}">${st}</span>`;
        }).join('') + (lifecycle === 'FAILED' ? '<span class="stage-pill failed">FAILED</span>' : '');
      }

      const taskTitleEl = document.getElementById('mc-current-task');
      if (taskTitleEl) {
        taskTitleEl.textContent = plan?.title || (tasks[0]?.prompt) || 'Idle — Waiting for an autonomous engineering task';
      }

      const agentStatePill = document.getElementById('mc-lifecycle-badge');
      if (agentStatePill) {
        agentStatePill.textContent = lifecycle;
        agentStatePill.className = `badge ${lifecycle === 'FAILED' ? 'badge-error' : lifecycle === 'COMPLETED' ? 'badge-success' : lifecycle === 'IDLE' ? '' : 'badge-cyan'}`;
      }

      // Render milestones / dependencies
      const mcPlanEl = document.getElementById('mc-milestones-list');
      if (mcPlanEl) {
        if (plan && Array.isArray(plan.milestones) && plan.milestones.length > 0) {
          const completedCount = plan.milestones.filter((m) => m.status === 'completed').length;
          const pct = Math.round((completedCount / plan.milestones.length) * 100);
          const bar = document.getElementById('mc-progress-fill');
          const pctEl = document.getElementById('mc-progress-pct');
          if (bar) bar.style.width = `${pct}%`;
          if (pctEl) pctEl.textContent = `${pct}%`;

          mcPlanEl.innerHTML = plan.milestones.map((m) => {
            const dotCls = m.status === 'completed' ? 'success' : m.status === 'failed' ? 'error' : m.status === 'in_progress' ? 'tool' : '';
            return `
              <div class="timeline-item">
                <span class="timeline-dot ${dotCls}"></span>
                <div class="flex items-center justify-between gap-2">
                  <span style="color: var(--text-primary); font-weight: 500;">${escapeHtml(m.title)}</span>
                  <span class="badge ${m.status === 'completed' ? 'badge-success' : m.status === 'failed' ? 'badge-error' : m.status === 'in_progress' ? 'badge-cyan' : ''}">${escapeHtml(m.status)}</span>
                </div>
              </div>
            `;
          }).join('');
        } else {
          mcPlanEl.innerHTML = '<div style="color: var(--text-muted); font-size: var(--text-xs); padding: 8px 0;">No active execution plan. Dispatch a task to view real milestone stages.</div>';
        }
      }

      // Render real Execution Evidence (Files Modified, Commands Executed, Tests)
      const evEl = document.getElementById('mc-evidence-panel');
      if (evEl) {
        evEl.innerHTML = `
          <div class="cc-health-grid" style="margin-bottom: 12px;">
            <div class="cc-metric-box">
              <span class="cc-metric-label">Files Inspected</span>
              <span class="cc-metric-val mono">${evidence.inspectedFiles.length}</span>
            </div>
            <div class="cc-metric-box">
              <span class="cc-metric-label">Files Modified</span>
              <span class="cc-metric-val mono">${evidence.modifiedFiles.length}</span>
            </div>
            <div class="cc-metric-box">
              <span class="cc-metric-label">Commands Executed</span>
              <span class="cc-metric-val mono">${evidence.commandsExecuted.length}</span>
            </div>
            <div class="cc-metric-box">
              <span class="cc-metric-label">Verification Tests</span>
              <span class="cc-metric-val mono">${evidence.testsPassed} / ${evidence.testsRun} Passed</span>
            </div>
          </div>
          ${evidence.modifiedFiles.length > 0 ? `
            <div style="margin-bottom: 10px;">
              <div class="cc-section-title" style="margin-bottom: 6px;">Modified Files</div>
              <div class="flex-col gap-1">
                ${evidence.modifiedFiles.map((f) => `
                  <button class="tree-row" onclick="MaxViews.switchMainView('workspace'); openFileInEditor('${escapeHtml(f)}');">
                    <span class="mono" style="color: var(--accent-cyan); font-size: 11px;">${escapeHtml(f)}</span>
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}
          ${evidence.commandsExecuted.length > 0 ? `
            <div style="margin-bottom: 10px;">
              <div class="cc-section-title" style="margin-bottom: 6px;">Executed Commands</div>
              <div class="flex-col gap-1">
                ${evidence.commandsExecuted.map((c) => `<div class="mono" style="font-size:11px; padding:4px 8px; background:var(--bg-code); border-radius:4px;">$ ${escapeHtml(c)}</div>`).join('')}
              </div>
            </div>
          ` : ''}
          ${evidence.diagnostics.length > 0 ? `
            <div>
              <div class="cc-section-title" style="margin-bottom: 6px; color: var(--status-error);">Diagnostics & Errors</div>
              <div class="flex-col gap-1">
                ${evidence.diagnostics.map((d) => `<div class="mono" style="font-size:11px; padding:6px 8px; background:var(--status-error-subtle); border-radius:4px; color:#FCA5A5;">${escapeHtml(d)}</div>`).join('')}
              </div>
            </div>
          ` : ''}
        `;
      }

      // Render active/historical tasks from TaskManager
      const mcTasksEl = document.getElementById('mc-tasks-list');
      if (mcTasksEl) {
        if (tasks.length === 0) {
          mcTasksEl.innerHTML = '<div style="color: var(--text-muted); font-size: var(--text-xs);">No queued background agent tasks.</div>';
        } else {
          mcTasksEl.innerHTML = tasks.map((t) => `
            <div class="card" style="padding: 10px 12px; margin-bottom: 8px;">
              <div class="flex items-center justify-between gap-2" style="margin-bottom: 6px;">
                <span style="font-weight: 600; font-size: var(--text-sm);" class="truncate">${escapeHtml(t.prompt || t.id)}</span>
                <span class="badge ${t.status === 'COMPLETED' ? 'badge-success' : t.status === 'FAILED' ? 'badge-error' : 'badge-accent'}">${escapeHtml(t.status)}</span>
              </div>
              <div class="flex items-center justify-between" style="font-size: var(--text-xs); color: var(--text-muted);">
                <span class="mono">Progress: ${t.progress || 0}%</span>
                <div class="flex gap-1">
                  ${t.status === 'ACTIVE' ? `<button class="btn btn-xs" onclick="MaxViews.taskControl('${t.id}','pause')">Pause</button>` : ''}
                  ${t.status === 'PAUSED' ? `<button class="btn btn-xs btn-success" onclick="MaxViews.taskControl('${t.id}','resume')">Resume</button>` : ''}
                  ${t.status !== 'COMPLETED' && t.status !== 'CANCELLED' ? `<button class="btn btn-xs btn-danger" onclick="MaxViews.taskControl('${t.id}','cancel')">Stop</button>` : ''}
                </div>
              </div>
            </div>
          `).join('');
        }
      }

      // Render pending approvals in Mission Control
      const mcAppEl = document.getElementById('mc-approvals-list');
      if (mcAppEl) {
        const list = Array.isArray(approvals) ? approvals : [];
        if (list.length === 0) {
          mcAppEl.innerHTML = '<div style="color: var(--text-muted); font-size: var(--text-xs);">No pending command approval requests.</div>';
        } else {
          mcAppEl.innerHTML = list.map((req) => `
            <div class="card" style="padding: 10px; border-color: rgba(245,158,11,0.4); margin-bottom: 8px;">
              <div class="mono" style="font-size:11px; color: var(--status-warning); margin-bottom: 6px;">$ ${escapeHtml(req.command)}</div>
              <div style="font-size:11px; color: var(--text-secondary); margin-bottom: 8px;">${escapeHtml(req.reason || 'Approval required')}</div>
              <div class="flex gap-2">
                <button class="btn btn-xs btn-success" onclick="respondApproval('${req.id}','allow_once')">Allow Once</button>
                <button class="btn btn-xs btn-primary" onclick="respondApproval('${req.id}','allow_for_task')">Allow For Task</button>
                <button class="btn btn-xs btn-danger" onclick="respondApproval('${req.id}','deny')">Deny</button>
              </div>
            </div>
          `).join('');
        }
      }
    } catch (err) {
      pushLog('output', `Mission Control sync error: ${err.message}`, 'error');
    }
  }

  async function taskControl(id, action) {
    try {
      await api.post(`/api/tasks/${encodeURIComponent(id)}/${action}`);
      toast(`Task ${action}d`, 'info');
      refreshMissionControl();
    } catch (err) {
      toast(`Failed to ${action} task: ${err.message}`, 'error');
    }
  }

  // =========================================================================
  // LIVE PREVIEW STUDIO (ISOLATED PREVIEW ARCHITECTURE)
  // =========================================================================
  async function initPreviewStudio(overrideUrl) {
    try {
      const info = await api.get('/api/preview/info').catch(() => null);
      const urlInput = document.getElementById('preview-url-input');
      const targetUrl = overrideUrl || (urlInput && urlInput.value.trim()) || info?.previewUrl || '/workspace-preview/index.html';
      navigatePreviewUrl(targetUrl, true);
    } catch (err) {
      toast(`Preview init error: ${err.message}`, 'error');
    }
  }

  function navigatePreviewUrl(url, pushHistory = true) {
    const clean = (url || '/workspace-preview/index.html').trim();
    const urlInput = document.getElementById('preview-url-input');
    const iframe = document.getElementById('preview-studio-iframe');
    if (urlInput) urlInput.value = clean;
    if (iframe) {
      const sep = clean.includes('?') ? '&' : '?';
      iframe.src = `${clean}${sep}_t=${Date.now()}`;
    }
    if (pushHistory) {
      viewState.previewHistory = viewState.previewHistory.slice(0, viewState.previewHistoryIdx + 1);
      viewState.previewHistory.push(clean);
      viewState.previewHistoryIdx = viewState.previewHistory.length - 1;
    }
    appendPreviewConsole(`Navigated isolated preview to ${clean}`, 'info');
  }

  function previewBack() {
    if (viewState.previewHistoryIdx > 0) {
      viewState.previewHistoryIdx--;
      navigatePreviewUrl(viewState.previewHistory[viewState.previewHistoryIdx], false);
    }
  }

  function previewForward() {
    if (viewState.previewHistoryIdx < viewState.previewHistory.length - 1) {
      viewState.previewHistoryIdx++;
      navigatePreviewUrl(viewState.previewHistory[viewState.previewHistoryIdx], false);
    }
  }

  function reloadPreviewStudio() {
    const urlInput = document.getElementById('preview-url-input');
    navigatePreviewUrl(urlInput ? urlInput.value : '/workspace-preview/index.html', false);
  }

  function setPreviewViewport(mode) {
    viewState.previewViewport = mode;
    const shell = document.getElementById('preview-frame-shell');
    if (shell) {
      shell.className = `preview-frame-shell ${mode === 'desktop' ? '' : mode}`;
    }
    ['desktop', 'tablet', 'mobile'].forEach((m) => {
      const btn = document.getElementById(`vp-btn-${m}`);
      if (btn) btn.classList.toggle('active', m === mode);
    });
    const label = document.getElementById('preview-viewport-label');
    if (label) {
      label.textContent = mode === 'desktop' ? '100% Desktop' : mode === 'tablet' ? '768 × 1024 Tablet' : '390 × 844 Mobile';
    }
  }

  function appendPreviewConsole(text, level = 'info') {
    const box = document.getElementById('preview-console-output');
    if (!box) return;
    const color = level === 'error' ? '#F87171' : level === 'success' ? '#4ADE80' : '#9299AA';
    const row = document.createElement('div');
    row.className = 'mono';
    row.style.cssText = `font-size:11px; color:${color}; padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.03);`;
    row.textContent = `[${new Date().toLocaleTimeString('en-US', { hour12: false })}] ${text}`;
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  }

  async function verifyPreviewIsolation() {
    const urlInput = document.getElementById('preview-url-input');
    const url = urlInput ? urlInput.value.trim() : '/workspace-preview/index.html';
    try {
      const res = await api.post('/api/preview/verify', { url });
      if (res.verified) {
        appendPreviewConsole(`Isolation Verified (HTTP ${res.status}): Preview is cleanly isolated from MaxIDE host.`, 'success');
        toast('Preview isolation verified', 'success');
      } else {
        appendPreviewConsole(`Isolation Warning: ${res.marker || res.error || 'Non-200 status'}`, 'error');
        toast('Preview verification flagged an issue', 'warning');
      }
    } catch (err) {
      appendPreviewConsole(`Verify error: ${err.message}`, 'error');
    }
  }

  async function capturePreviewScreenshot() {
    const urlInput = document.getElementById('preview-url-input');
    const target = urlInput ? urlInput.value.trim() : '/workspace-preview/index.html';
    const fullUrl = target.startsWith('http') ? target : `${window.location.origin}${target}`;
    try {
      appendPreviewConsole(`Capturing Playwright screenshot of ${fullUrl}...`, 'info');
      await api.post('/api/browser/navigate', { url: fullUrl });
      const shot = await api.post('/api/browser/screenshot', { path: 'preview-capture.png' });
      appendPreviewConsole(`Screenshot captured: ${shot.path || 'preview-capture.png'}`, 'success');
      toast('Screenshot captured to workspace', 'success');
      if (window.refreshFileTree) window.refreshFileTree();
    } catch (err) {
      appendPreviewConsole(`Screenshot failed: ${err.message}`, 'error');
      toast(`Screenshot failed: ${err.message}`, 'error');
    }
  }

  async function inspectPreviewDom() {
    const urlInput = document.getElementById('preview-url-input');
    const target = urlInput ? urlInput.value.trim() : '/workspace-preview/index.html';
    const fullUrl = target.startsWith('http') ? target : `${window.location.origin}${target}`;
    try {
      appendPreviewConsole(`Inspecting live DOM at ${fullUrl}...`, 'info');
      await api.post('/api/browser/navigate', { url: fullUrl });
      const dom = await api.get('/api/browser/dom');
      appendPreviewConsole(`DOM Title: "${dom.title || 'Untitled'}" | URL: ${dom.url || fullUrl}`, 'success');
      if (dom.consoleErrors && dom.consoleErrors.length > 0) {
        dom.consoleErrors.forEach((e) => appendPreviewConsole(`Console Error: ${e}`, 'error'));
      } else {
        appendPreviewConsole('0 browser console errors detected.', 'success');
      }
    } catch (err) {
      appendPreviewConsole(`DOM inspect failed: ${err.message}`, 'error');
    }
  }

  function openPreviewExternal() {
    const urlInput = document.getElementById('preview-url-input');
    const target = urlInput ? urlInput.value.trim() : '/workspace-preview/index.html';
    window.open(target, '_blank', 'noopener');
  }

  // =========================================================================
  // LEFT SIDEBAR VIEWS: SEARCH, GIT, INTEGRATIONS, PROJECT STRUCTURE
  // =========================================================================
  async function runSidebarSearch() {
    const input = document.getElementById('sidebar-search-input');
    const container = document.getElementById('sidebar-search-results');
    if (!input || !container) return;
    const q = input.value.trim();
    if (!q) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:12px;">Type a keyword or symbol to search across the workspace.</div>';
      return;
    }
    container.innerHTML = '<div class="skeleton" style="height:24px;margin-bottom:6px;"></div><div class="skeleton" style="height:24px;"></div>';
    try {
      const results = await api.get(`/api/intelligence/search?q=${encodeURIComponent(q)}&max=30`);
      const list = Array.isArray(results) ? results : (results.results || []);
      if (list.length === 0) {
        container.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:12px;">No matches for "${escapeHtml(q)}".</div>`;
        return;
      }
      container.innerHTML = list.map((m) => `
        <button class="card card-interactive" style="width:100%;text-align:left;padding:8px 10px;margin-bottom:6px;" onclick="openFileInEditor('${escapeHtml(m.file || m.path)}')">
          <div class="flex items-center justify-between gap-2">
            <span class="mono truncate" style="font-size:11px;color:var(--accent-cyan);">${escapeHtml(m.file || m.path)}</span>
            <span class="mono" style="font-size:10px;color:var(--text-muted);">:${m.line || 1}</span>
          </div>
          <div class="mono truncate" style="font-size:11px;color:var(--text-secondary);margin-top:3px;">${escapeHtml((m.text || m.preview || '').trim())}</div>
        </button>
      `).join('');
    } catch (err) {
      container.innerHTML = `<div style="color:var(--status-error);font-size:12px;padding:12px;">Search failed: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function refreshGitPanel() {
    const statusEl = document.getElementById('git-status-container');
    const logEl = document.getElementById('git-log-container');
    if (!statusEl) return;
    try {
      const [st, log] = await Promise.all([
        api.get('/api/workspace/git/status').catch(() => null),
        api.get('/api/workspace/git/log').catch(() => null),
      ]);
      const branch = st?.branch || 'Not a git repo';
      const sbGit = document.getElementById('sb-git-branch');
      if (sbGit) sbGit.textContent = branch;

      const files = st?.files || st?.changed || [];
      statusEl.innerHTML = `
        <div class="flex items-center justify-between" style="margin-bottom:8px;">
          <span class="badge badge-cyan mono">${escapeHtml(branch)}</span>
          <span style="font-size:11px;color:var(--text-muted);">${files.length} changed</span>
        </div>
        ${files.length === 0
          ? '<div style="font-size:12px;color:var(--text-muted);padding:6px 0;">Working tree clean.</div>'
          : files.slice(0, 20).map((f) => {
            const p = typeof f === 'string' ? f : (f.path || f.file || '');
            const code = typeof f === 'object' ? (f.status || 'M') : 'M';
            return `<div class="tree-row" onclick="openFileInEditor('${escapeHtml(p)}')"><span class="badge badge-warning mono">${escapeHtml(code)}</span><span class="truncate mono" style="font-size:11px;">${escapeHtml(p)}</span></div>`;
          }).join('')}
      `;

      if (logEl) {
        const commits = Array.isArray(log) ? log : (log?.commits || []);
        logEl.innerHTML = commits.length === 0
          ? '<div style="font-size:11px;color:var(--text-muted);">No commit history available.</div>'
          : commits.slice(0, 8).map((c) => `
            <div style="padding:6px 0;border-bottom:1px solid var(--border-subtle);font-size:11px;">
              <div style="color:var(--text-primary);" class="truncate">${escapeHtml(typeof c === 'string' ? c : (c.message || c.subject || ''))}</div>
              ${typeof c === 'object' && c.hash ? `<div class="mono" style="font-size:10px;color:var(--text-muted);">${escapeHtml(c.hash.slice(0, 7))}</div>` : ''}
            </div>
          `).join('');
      }
    } catch (err) {
      statusEl.innerHTML = `<div style="font-size:12px;color:var(--text-muted);">Git unavailable: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function commitGitChanges() {
    const input = document.getElementById('git-commit-input');
    const msg = input ? input.value.trim() : '';
    if (!msg) return toast('Enter a commit message first', 'warning');
    try {
      await api.post('/api/workspace/git/commit', { message: msg });
      if (input) input.value = '';
      toast('Git commit created', 'success');
      refreshGitPanel();
    } catch (err) {
      toast(`Git commit failed: ${err.message}`, 'error');
    }
  }

  async function refreshIntegrationsPanel() {
    const container = document.getElementById('sidebar-integrations-list');
    if (!container) return;
    try {
      const [caps, arts] = await Promise.all([
        api.get('/api/capabilities/status').catch(() => ({ capabilities: [] })),
        api.get('/api/artifacts').catch(() => ({ artifacts: [] })),
      ]);
      const list = caps?.capabilities || [];
      const artifacts = Array.isArray(arts) ? arts : (arts?.artifacts || []);
      container.innerHTML = `
        <div class="cc-section-title" style="margin-bottom:8px;">Engine Capabilities (${list.length})</div>
        ${list.map((c) => `
          <div class="card" style="padding:8px 10px;margin-bottom:6px;">
            <div class="flex items-center justify-between gap-2">
              <span style="font-size:12px;font-weight:600;">${escapeHtml(c.name)}</span>
              <span class="badge ${c.status === 'available' || c.status === 'configured' ? 'badge-success' : 'badge-warning'}">${escapeHtml(c.status)}</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">${escapeHtml(c.details || c.category || '')}</div>
          </div>
        `).join('')}
        <div class="cc-section-title" style="margin:12px 0 8px;">Workspace Artifacts (${artifacts.length})</div>
        ${artifacts.length === 0
          ? '<div style="font-size:12px;color:var(--text-muted);">No generated media or web artifacts yet.</div>'
          : artifacts.map((a) => `
            <button class="card card-interactive" style="width:100%;text-align:left;padding:8px 10px;margin-bottom:6px;" onclick="openFileInEditor('${escapeHtml(a.relativePath || a.filePath || a.name)}')">
              <div class="flex items-center justify-between gap-2">
                <span class="truncate" style="font-size:12px;font-weight:500;">${escapeHtml(a.name)}</span>
                <span class="badge badge-accent">${escapeHtml(a.type)}</span>
              </div>
            </button>
          `).join('')}
      `;
    } catch (err) {
      container.innerHTML = `<div style="color:var(--status-error);font-size:12px;">Failed to load integrations: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function refreshStructurePanel() {
    const container = document.getElementById('sidebar-structure-list');
    if (!container) return;
    try {
      const [symbols, checkpoints] = await Promise.all([
        api.get('/api/intelligence/symbols').catch(() => []),
        api.get('/api/checkpoints').catch(() => []),
      ]);
      const symList = Array.isArray(symbols) ? symbols : (symbols?.symbols || []);
      const cpList = Array.isArray(checkpoints) ? checkpoints : (checkpoints?.checkpoints || []);

      container.innerHTML = `
        <div class="cc-section-title" style="margin-bottom:8px;">Codebase Symbols (${symList.length})</div>
        ${symList.length === 0
          ? '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">No indexed symbols in current workspace.</div>'
          : symList.slice(0, 30).map((s) => `
            <button class="tree-row" style="width:100%;" onclick="openFileInEditor('${escapeHtml(s.file || s.path || '')}')">
              <span class="badge badge-accent mono">${escapeHtml((s.kind || 'sym').slice(0, 3))}</span>
              <span class="truncate mono" style="font-size:11px;">${escapeHtml(s.name)}</span>
            </button>
          `).join('')}
        <div class="flex items-center justify-between" style="margin:14px 0 8px;">
          <span class="cc-section-title">Checkpoints (${cpList.length})</span>
          <button class="btn btn-xs" onclick="MaxViews.createCheckpointPrompt()">+ Save</button>
        </div>
        ${cpList.length === 0
          ? '<div style="font-size:12px;color:var(--text-muted);">No checkpoints saved yet.</div>'
          : cpList.slice(0, 10).map((cp) => `
            <div class="card" style="padding:8px 10px;margin-bottom:6px;">
              <div style="font-size:12px;font-weight:500;" class="truncate">${escapeHtml(cp.name || cp.id)}</div>
              <div class="flex items-center justify-between" style="margin-top:4px;font-size:11px;color:var(--text-muted);">
                <span>${cp.fileCount || 0} files</span>
                <button class="btn btn-xs" onclick="MaxViews.restoreCheckpointById('${escapeHtml(cp.id)}')">Restore</button>
              </div>
            </div>
          `).join('')}
      `;
    } catch (err) {
      container.innerHTML = `<div style="color:var(--status-error);font-size:12px;">Structure load failed: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function createCheckpointPrompt() {
    const name = window.prompt('Checkpoint label:', `Manual Checkpoint (${new Date().toLocaleTimeString()})`);
    if (!name) return;
    try {
      await api.post('/api/checkpoints', { name });
      toast('Workspace checkpoint created', 'success');
      refreshStructurePanel();
    } catch (err) {
      toast(`Checkpoint failed: ${err.message}`, 'error');
    }
  }

  async function restoreCheckpointById(id) {
    const ok = await confirmDialog({
      title: 'Restore Workspace Checkpoint',
      message: 'This will restore workspace files to the selected snapshot. Unsaved edits may be overwritten.',
      confirmLabel: 'Restore Snapshot',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/api/checkpoints/${encodeURIComponent(id)}/restore`);
      toast('Checkpoint restored', 'success');
      if (window.refreshFileTree) window.refreshFileTree();
    } catch (err) {
      toast(`Restore failed: ${err.message}`, 'error');
    }
  }

  // =========================================================================
  // BOTTOM PANEL (TERMINAL, PROBLEMS, OUTPUT, DEBUG, TESTS)
  // =========================================================================
  function switchBottomTab(tab) {
    const bp = document.getElementById('bottom-panel');
    if (bp && bp.classList.contains('hidden')) bp.classList.remove('hidden');
    ['terminal', 'problems', 'output', 'debug', 'tests'].forEach((t) => {
      const view = document.getElementById(`bview-${t}`);
      if (view) view.classList.toggle('hidden', t !== tab);
      const btn = document.getElementById(`btab-${t}`);
      if (btn) btn.classList.toggle('active', t === tab);
    });
  }

  function renderProblemsPanel() {
    const el = document.getElementById('problems-list-body');
    const badge = document.getElementById('problems-count-badge');
    if (badge) badge.textContent = String(viewState.problems.length);
    if (!el) return;
    if (viewState.problems.length === 0) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:12px;">No workspace problems or diagnostics reported.</div>';
      return;
    }
    el.innerHTML = viewState.problems.map((p) => `
      <div class="flex items-center gap-2 mono" style="font-size:11.5px;padding:6px 10px;border-bottom:1px solid var(--border-subtle);color:#FCA5A5;">
        <span class="status-dot error"></span>
        <span style="color:var(--text-muted);">[${p.time}]</span>
        <span>${escapeHtml(p.message)}</span>
      </div>
    `).join('');
  }

  function renderOutputPanel() {
    const el = document.getElementById('output-log-body');
    if (!el) return;
    if (viewState.outputLogs.length === 0) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:12px;">Engine output channel ready.</div>';
      return;
    }
    el.innerHTML = viewState.outputLogs.slice(-100).map((l) => `
      <div class="mono" style="font-size:11.5px;padding:2px 0;color:${l.level === 'error' ? '#F87171' : l.level === 'success' ? '#4ADE80' : '#9299AA'};">
        [${l.time}] ${escapeHtml(l.message)}
      </div>
    `).join('');
    el.scrollTop = el.scrollHeight;
  }

  function renderDebugPanel() {
    const el = document.getElementById('debug-console-body');
    if (!el) return;
    if (viewState.debugLogs.length === 0) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:12px;">Debug console ready. Agent tool traces and SSE events appear here.</div>';
      return;
    }
    el.innerHTML = viewState.debugLogs.slice(-100).map((l) => `
      <div class="mono" style="font-size:11.5px;padding:2px 0;color:${l.level === 'error' ? '#F87171' : '#C4B5FD'};">
        [${l.time}] ${escapeHtml(l.message)}
      </div>
    `).join('');
    el.scrollTop = el.scrollHeight;
  }

  async function runTerminalCommand(cmd) {
    const clean = (cmd || '').trim();
    if (!clean) return;
    const out = document.getElementById('terminal-output-body');
    viewState.terminalHistory.push(clean);
    viewState.terminalHistoryIdx = viewState.terminalHistory.length;

    if (out) {
      out.innerHTML += `<div style="color:var(--accent-cyan);margin-top:6px;">$ ${escapeHtml(clean)}</div>`;
      out.scrollTop = out.scrollHeight;
    }

    try {
      const res = await api.post('/api/terminal/run', { command: clean });
      if (out) {
        if (res.stdout) out.innerHTML += `<pre style="white-space:pre-wrap;color:#E2E8F0;margin:2px 0;">${escapeHtml(res.stdout)}</pre>`;
        if (res.stderr) out.innerHTML += `<pre style="white-space:pre-wrap;color:#FCA5A5;margin:2px 0;">${escapeHtml(res.stderr)}</pre>`;
        const statusColor = res.exitCode === 0 ? '#4ADE80' : '#F87171';
        out.innerHTML += `<div style="font-size:10.5px;color:${statusColor};margin-bottom:4px;">[exit ${res.exitCode ?? 0} • ${res.durationMs || 0}ms]</div>`;
        out.scrollTop = out.scrollHeight;
      }
      if (res.exitCode !== 0 && res.stderr) {
        pushLog('problem', `Terminal command failed (${clean}): ${res.stderr.split('\n')[0]}`, 'error');
      }
    } catch (err) {
      if (out) {
        out.innerHTML += `<div style="color:#F87171;">Error: ${escapeHtml(err.message)}</div>`;
        out.scrollTop = out.scrollHeight;
      }
    }
  }

  async function runProjectTestsFromPanel() {
    const el = document.getElementById('tests-results-body');
    if (el) el.innerHTML = '<div style="padding:12px;color:var(--accent-cyan);" class="mono">Executing workspace tests via SafeTerminal...</div>';
    switchBottomTab('tests');
    try {
      const res = await api.post('/api/terminal/run', { command: 'npm test' });
      const passed = res.exitCode === 0;
      if (el) {
        el.innerHTML = `
          <div style="padding:10px;">
            <div class="flex items-center justify-between" style="margin-bottom:8px;">
              <span class="badge ${passed ? 'badge-success' : 'badge-error'}">${passed ? 'TESTS PASSED' : 'TESTS FAILED'} (exit ${res.exitCode})</span>
              <span class="mono" style="font-size:11px;color:var(--text-muted);">${res.durationMs || 0}ms</span>
            </div>
            <pre class="mono" style="font-size:11.5px;background:var(--bg-code);padding:10px;border-radius:6px;white-space:pre-wrap;color:${passed ? '#D1FAE5' : '#FECACA'};">${escapeHtml((res.stdout || '') + '\n' + (res.stderr || ''))}</pre>
          </div>
        `;
      }
    } catch (err) {
      if (el) el.innerHTML = `<div style="padding:12px;color:var(--status-error);">${escapeHtml(err.message)}</div>`;
    }
  }

  // =========================================================================
  // SETTINGS EXPERIENCE (ALL 12 SECTIONS)
  // =========================================================================
  const SETTINGS_SECTIONS = [
    { id: 'providers', label: '1. AI Providers' },
    { id: 'local-models', label: '2. Local Models' },
    { id: 'routing', label: '3. Model Routing' },
    { id: 'autonomy', label: '4. Agent Autonomy' },
    { id: 'security', label: '5. Permissions & Security' },
    { id: 'editor', label: '6. Editor Preferences' },
    { id: 'terminal', label: '7. Terminal Config' },
    { id: 'git', label: '8. Git Integration' },
    { id: 'privacy', label: '9. Privacy Modes' },
    { id: 'memory', label: '10. Project Memory' },
    { id: 'appearance', label: '11. Appearance' },
    { id: 'diagnostics', label: '12. System Diagnostics' },
  ];

  async function openSettingsModal(initialSection = 'providers') {
    const modal = document.getElementById('modal-settings');
    if (!modal) return;
    modal.classList.remove('hidden');
    renderSettingsNav();
    await switchSettingsSection(initialSection);
  }

  function closeSettingsModal() {
    const modal = document.getElementById('modal-settings');
    if (modal) modal.classList.add('hidden');
  }

  function renderSettingsNav() {
    const nav = document.getElementById('settings-nav-list');
    if (!nav) return;
    nav.innerHTML = SETTINGS_SECTIONS.map((s) => `
      <button class="settings-nav-item ${viewState.settingsSection === s.id ? 'active' : ''}" onclick="MaxViews.switchSettingsSection('${s.id}')">
        <span>${escapeHtml(s.label)}</span>
      </button>
    `).join('');
  }

  async function switchSettingsSection(sectionId) {
    viewState.settingsSection = sectionId;
    renderSettingsNav();
    const content = document.getElementById('settings-content-pane');
    if (!content) return;
    content.innerHTML = '<div class="skeleton" style="height:28px;width:45%;margin-bottom:12px;"></div><div class="skeleton" style="height:84px;margin-bottom:10px;"></div><div class="skeleton" style="height:84px;"></div>';

    try {
      if (sectionId === 'providers') await renderSettingsProviders(content);
      else if (sectionId === 'local-models') await renderSettingsLocalModels(content);
      else if (sectionId === 'routing') await renderSettingsRouting(content);
      else if (sectionId === 'autonomy') await renderSettingsAutonomy(content);
      else if (sectionId === 'security') await renderSettingsSecurity(content);
      else if (sectionId === 'editor') renderSettingsEditor(content);
      else if (sectionId === 'terminal') await renderSettingsTerminal(content);
      else if (sectionId === 'git') await renderSettingsGit(content);
      else if (sectionId === 'privacy') await renderSettingsPrivacy(content);
      else if (sectionId === 'memory') await renderSettingsMemory(content);
      else if (sectionId === 'appearance') renderSettingsAppearance(content);
      else if (sectionId === 'diagnostics') await renderSettingsDiagnostics(content);
    } catch (err) {
      content.innerHTML = `<div class="card" style="border-color:var(--status-error);color:#FCA5A5;">Failed to load section: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function renderSettingsProviders(el) {
    const paint = (list) => {
      el.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h3 style="font-size:16px;font-weight:600;">AI Providers</h3>
          <p style="font-size:12px;color:var(--text-secondary);">Configure cloud and self-hosted endpoints. Stored API keys are write-only and never exposed in readable form.</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="MaxViews.openAddProviderModal()">+ Add Provider</button>
      </div>
      <div class="flex-col gap-3">
        ${list.map((p) => {
          const isOnline = p.health?.status === 'online';
          const isConfigured = Boolean(p.apiKey) || p.type === 'local';
          return `
            <div class="card flex-col gap-3">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="status-dot ${isOnline ? 'online' : 'error'}"></span>
                  <span style="font-weight:600;">${escapeHtml(p.name)}</span>
                  <span class="badge">${escapeHtml(p.type)}</span>
                  <span class="badge ${isConfigured ? 'badge-success' : 'badge-warning'}">${isConfigured ? 'Configured' : 'Key Required'}</span>
                  <span class="badge ${isOnline ? 'badge-cyan' : 'badge-error'}">${isOnline ? 'Connected' : 'Offline'}</span>
                </div>
                <div class="flex items-center gap-2">
                  <button class="btn btn-xs" onclick="MaxViews.testProvider('${escapeHtml(p.id)}')">Test Connection</button>
                  <button class="btn btn-xs btn-danger" onclick="MaxViews.removeProvider('${escapeHtml(p.id)}')">Remove</button>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;">
                <div>
                  <label style="display:block;color:var(--text-muted);margin-bottom:4px;">Default Model (${p.modelCount || 0} available)</label>
                  <input class="input mono" value="${escapeHtml(p.defaultModel || '')}" placeholder="Model ID" onchange="MaxViews.saveProviderField('${escapeHtml(p.id)}','defaultModel',this.value)" />
                </div>
                <div>
                  <label style="display:block;color:var(--text-muted);margin-bottom:4px;">${p.type === 'local' ? 'Endpoint Base URL' : 'API Key (Encrypted / Masked)'}</label>
                  ${p.type === 'local'
                    ? `<input class="input mono" value="${escapeHtml(p.baseUrl || '')}" placeholder="http://localhost:11434" onchange="MaxViews.saveProviderField('${escapeHtml(p.id)}','baseUrl',this.value)" />`
                    : `<input class="input mono" type="password" value="" autocomplete="off" placeholder="${p.apiKey ? 'Stored securely (enter new key to rotate)' : 'Paste API key...'}" onchange="MaxViews.saveProviderField('${escapeHtml(p.id)}','apiKey',this.value)" />`
                  }
                </div>
              </div>
              ${p.health?.message ? `<div style="font-size:11px;color:var(--text-muted);" class="mono">${escapeHtml(p.health.message)}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
    };

    if (viewState.providersCache.length > 0) {
      paint(viewState.providersCache);
      api.get('/api/providers').then((fresh) => {
        viewState.providersCache = Array.isArray(fresh) ? fresh : [];
        if (viewState.settingsSection === 'providers') paint(viewState.providersCache);
      }).catch(() => {});
      return;
    }

    const providers = await api.get('/api/providers');
    viewState.providersCache = Array.isArray(providers) ? providers : [];
    paint(viewState.providersCache);
  }

  async function saveProviderField(id, field, value) {
    const existing = viewState.providersCache.find((p) => p.id === id);
    if (!existing) return;
    try {
      const payload = { ...existing, [field]: value };
      if (field !== 'apiKey') delete payload.apiKey;
      await api.post('/api/providers', payload);
      toast(`Updated ${existing.name}`, 'success');
      if (window.refreshTopbarModels) window.refreshTopbarModels();
      switchSettingsSection('providers');
    } catch (err) {
      toast(`Update failed: ${err.message}`, 'error');
    }
  }

  async function testProvider(id) {
    try {
      toast(`Testing connection for ${id}...`, 'info', 2000);
      const res = await api.get(`/api/providers/${encodeURIComponent(id)}/test`);
      if (res.status === 'online') {
        toast(`${id} connected (${res.latencyMs || 0}ms)`, 'success');
      } else {
        toast(`${id}: ${res.message || res.status || 'Offline'}`, 'warning');
      }
      switchSettingsSection('providers');
    } catch (err) {
      toast(`Connection test error: ${err.message}`, 'error');
    }
  }

  async function removeProvider(id) {
    const ok = await confirmDialog({
      title: 'Remove AI Provider',
      message: `Remove provider "${id}" from MaxIDE configuration?`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    await api.del(`/api/providers/${encodeURIComponent(id)}`);
    toast('Provider removed', 'info');
    switchSettingsSection('providers');
  }

  async function renderSettingsLocalModels(el) {
    const models = await api.get('/api/models?localOnly=true');
    const list = Array.isArray(models) ? models : [];
    el.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h3 style="font-size:16px;font-weight:600;">Local Models (Ollama & Self-Hosted)</h3>
          <p style="font-size:12px;color:var(--text-secondary);">Auto-discover models running on your local GPU/CPU or register custom local weights.</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="MaxViews.discoverLocalModels()">Discover Ollama Models</button>
      </div>
      <div class="flex-col gap-2">
        ${list.length === 0
          ? '<div class="card" style="color:var(--text-muted);">No local models discovered yet. Start Ollama and click Discover.</div>'
          : list.map((m) => `
            <div class="toggle-row">
              <div>
                <div style="font-weight:600;">${escapeHtml(m.name)} <span class="badge badge-cyan mono">${escapeHtml(m.id)}</span></div>
                <div style="font-size:11px;color:var(--text-muted);">Context: ${(m.contextWindow || 32768).toLocaleString()} tokens • Tool Calling: ${m.capabilities?.toolCalling ? 'Yes' : 'No'}</div>
              </div>
              <button class="btn btn-xs" onclick="MaxViews.selectModel('${escapeHtml(m.id)}')">Set Active</button>
            </div>
          `).join('')}
      </div>
    `;
  }

  async function discoverLocalModels() {
    try {
      const res = await api.post('/api/models/discover', { providerId: 'ollama-local' });
      toast(`Discovered ${res.count || 0} local model(s)`, 'success');
      if (window.refreshTopbarModels) window.refreshTopbarModels();
      switchSettingsSection('local-models');
    } catch (err) {
      toast(`Discovery error: ${err.message}`, 'error');
    }
  }

  async function selectModel(modelId) {
    try {
      await api.post('/api/mode', { activeModelId: modelId });
      const sel = document.getElementById('topbar-model-select');
      if (sel) sel.value = modelId;
      toast(`Active model switched to ${modelId}`, 'success');
    } catch (err) {
      toast(`Model switch failed: ${err.message}`, 'error');
    }
  }

  async function renderSettingsRouting(el) {
    const [modeData, fallback, models] = await Promise.all([
      api.get('/api/mode'),
      api.get('/api/fallback').catch(() => []),
      api.get('/api/models').catch(() => []),
    ]);
    const chain = Array.isArray(fallback) ? fallback : [];
    const modelList = Array.isArray(models) ? models : [];
    el.innerHTML = `
      <div>
        <h3 style="font-size:16px;font-weight:600;">Model Routing & Failover Chain</h3>
        <p style="font-size:12px;color:var(--text-secondary);">Control default model selection and automatic provider failover order.</p>
      </div>
      <div class="card flex-col gap-3">
        <label style="font-size:12px;color:var(--text-secondary);">Active Engineering Model</label>
        <select class="select mono" onchange="MaxViews.selectModel(this.value)">
          <option value="auto" ${modeData.activeModelId === 'auto' ? 'selected' : ''}>AUTO — Intelligent Task-Aware Routing</option>
          ${modelList.map((m) => `<option value="${escapeHtml(m.id)}" ${modeData.activeModelId === m.id ? 'selected' : ''}>${escapeHtml(m.name)} (${escapeHtml(m.id)})</option>`).join('')}
        </select>
      </div>
      <div class="card flex-col gap-2">
        <div style="font-size:12px;font-weight:600;">Active Fallback Priority Chain</div>
        <div class="mono" style="font-size:12px;color:var(--accent-cyan);">${chain.length > 0 ? chain.join(' → ') : 'Automatic capability-matched failover'}</div>
      </div>
    `;
  }

  async function renderSettingsAutonomy(el) {
    const data = await api.get('/api/agent/autonomy');
    const modes = [
      { id: 'ASK', title: 'ASK (Read-Only Proposals)', desc: 'Inspects codebase and proposes plans without mutating files or running destructive commands.' },
      { id: 'ASSIST', title: 'ASSIST (Guided Co-Engineering)', desc: 'Stages reversible diffs and asks approval before applying significant mutations.' },
      { id: 'AGENT', title: 'AGENT (Standard Autonomous)', desc: 'Reads files, edits via patches, runs safe tests, and requests approval for risky terminal commands.' },
      { id: 'AUTONOMOUS', title: 'AUTONOMOUS (Full Closed-Loop)', desc: 'End-to-end Observe → Plan → Inspect → Patch → Test → Repair execution within workspace boundaries.' },
    ];
    el.innerHTML = `
      <div>
        <h3 style="font-size:16px;font-weight:600;">Agent Autonomy Level</h3>
        <p style="font-size:12px;color:var(--text-secondary);">Configure how independently the MaxIDE Agent operates on your workspace.</p>
      </div>
      <div class="flex-col gap-2">
        ${modes.map((m) => `
          <button class="card card-interactive flex items-center justify-between gap-3" style="text-align:left;${data.mode === m.id ? 'border-color:var(--accent-primary);background:var(--accent-primary-subtle);' : ''}" onclick="MaxViews.setAutonomy('${m.id}')">
            <div>
              <div style="font-weight:600;">${m.title}</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${m.desc}</div>
            </div>
            <span class="badge ${data.mode === m.id ? 'badge-accent' : ''}">${data.mode === m.id ? 'Active' : 'Select'}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  async function setAutonomy(mode) {
    await api.post('/api/agent/autonomy', { mode });
    const sel = document.getElementById('agent-autonomy-select');
    if (sel) sel.value = mode;
    toast(`Autonomy mode set to ${mode}`, 'success');
    switchSettingsSection('autonomy');
  }

  async function renderSettingsSecurity(el) {
    const projId = viewState.activeProjectId || 'default';
    const perms = await api.get(`/api/permissions/${encodeURIComponent(projId)}`).catch(() => ({}));
    el.innerHTML = `
      <div>
        <h3 style="font-size:16px;font-weight:600;">Permissions & Security Guardrails</h3>
        <p style="font-size:12px;color:var(--text-secondary);">Enforced server-side at the filesystem and terminal execution boundary.</p>
      </div>
      <div class="card flex-col gap-2">
        <div class="flex items-center justify-between"><span>Windows Reserved Device Path Shield (CON, AUX, NUL, COM1-9)</span><span class="badge badge-success">Enforced</span></div>
        <div class="flex items-center justify-between"><span>Mandatory Pre-Edit File Inspection Guardrail</span><span class="badge badge-success">Enforced</span></div>
        <div class="flex items-center justify-between"><span>Canonical Symlink / Junction Escape Protection</span><span class="badge badge-success">Fail-Closed</span></div>
        <div class="flex items-center justify-between"><span>SafeTerminal Destructive Command Shield</span><span class="badge badge-success">Active</span></div>
      </div>
      <div class="card flex-col gap-2">
        <div style="font-weight:600;margin-bottom:4px;">Project Permission Policy (${escapeHtml(projId)})</div>
        <div class="toggle-row"><span>Allow File System Read</span><input type="checkbox" ${perms.fsRead !== false ? 'checked' : ''} onchange="MaxViews.updatePermission('${escapeHtml(projId)}','fsRead',this.checked)" /></div>
        <div class="toggle-row"><span>Allow File System Write</span><input type="checkbox" ${perms.fsWrite !== false ? 'checked' : ''} onchange="MaxViews.updatePermission('${escapeHtml(projId)}','fsWrite',this.checked)" /></div>
        <div class="toggle-row"><span>Allow File System Delete</span><input type="checkbox" ${perms.fsDelete ? 'checked' : ''} onchange="MaxViews.updatePermission('${escapeHtml(projId)}','fsDelete',this.checked)" /></div>
        <div class="toggle-row"><span>Allow Git Commit</span><input type="checkbox" ${perms.gitCommit ? 'checked' : ''} onchange="MaxViews.updatePermission('${escapeHtml(projId)}','gitCommit',this.checked)" /></div>
      </div>
    `;
  }

  async function updatePermission(projId, key, val) {
    try {
      await api.post(`/api/permissions/${encodeURIComponent(projId)}`, { [key]: val });
      toast(`Updated permission: ${key}`, 'success');
    } catch (err) {
      toast(`Permission update error: ${err.message}`, 'error');
    }
  }

  function renderSettingsEditor(el) {
    const p = viewState.editorPrefs;
    el.innerHTML = `
      <div>
        <h3 style="font-size:16px;font-weight:600;">Editor Preferences</h3>
        <p style="font-size:12px;color:var(--text-secondary);">Applies immediately to Monaco Editor and code buffers.</p>
      </div>
      <div class="card flex-col gap-3">
        <div class="toggle-row">
          <span>Font Size (px)</span>
          <input class="input mono" style="width:90px;" type="number" min="10" max="22" value="${p.fontSize}" onchange="MaxViews.updateEditorPref('fontSize', Number(this.value))" />
        </div>
        <div class="toggle-row">
          <span>Tab Size</span>
          <select class="select" style="width:90px;" onchange="MaxViews.updateEditorPref('tabSize', Number(this.value))">
            <option value="2" ${p.tabSize === 2 ? 'selected' : ''}>2 spaces</option>
            <option value="4" ${p.tabSize === 4 ? 'selected' : ''}>4 spaces</option>
          </select>
        </div>
        <div class="toggle-row">
          <span>Word Wrap</span>
          <select class="select" style="width:110px;" onchange="MaxViews.updateEditorPref('wordWrap', this.value)">
            <option value="off" ${p.wordWrap === 'off' ? 'selected' : ''}>Off</option>
            <option value="on" ${p.wordWrap === 'on' ? 'selected' : ''}>On</option>
          </select>
        </div>
        <div class="toggle-row">
          <span>Show Minimap</span>
          <input type="checkbox" ${p.minimap ? 'checked' : ''} onchange="MaxViews.updateEditorPref('minimap', this.checked)" />
        </div>
      </div>
    `;
  }

  function updateEditorPref(key, val) {
    viewState.editorPrefs[key] = val;
    localStorage.setItem('maxide_editor_prefs', JSON.stringify(viewState.editorPrefs));
    if (window.monacoEditor) {
      window.monacoEditor.updateOptions({
        fontSize: viewState.editorPrefs.fontSize,
        tabSize: viewState.editorPrefs.tabSize,
        wordWrap: viewState.editorPrefs.wordWrap,
        minimap: { enabled: viewState.editorPrefs.minimap },
      });
    }
    toast('Editor preference saved', 'success');
  }

  async function renderSettingsTerminal(el) {
    const health = await api.get('/api/health').catch(() => ({}));
    el.innerHTML = `
      <div>
        <h3 style="font-size:16px;font-weight:600;">Terminal Configuration</h3>
        <p style="font-size:12px;color:var(--text-secondary);">Integrated SafeTerminal execution policy and workspace sandboxing.</p>
      </div>
      <div class="card flex-col gap-2">
        <div class="toggle-row"><span>Working Directory Root</span><span class="mono" style="font-size:11px;color:var(--accent-cyan);">${escapeHtml(health.workspace || 'Active Workspace')}</span></div>
        <div class="toggle-row"><span>Command Timeout Limit</span><span class="mono">45,000 ms</span></div>
        <div class="toggle-row"><span>Safe Auto-Run Tier</span><span class="mono" style="font-size:11px;color:var(--text-secondary);">git status, npm test, tsc --noEmit, pytest</span></div>
        <div class="toggle-row"><span>Catastrophic Pattern Blocker</span><span class="badge badge-success">Active</span></div>
      </div>
    `;
  }

  async function renderSettingsGit(el) {
    const st = await api.get('/api/workspace/git/status').catch(() => ({}));
    el.innerHTML = `
      <div>
        <h3 style="font-size:16px;font-weight:600;">Git Integration</h3>
        <p style="font-size:12px;color:var(--text-secondary);">Source control connectivity for the active workspace.</p>
      </div>
      <div class="card flex-col gap-2">
        <div class="toggle-row"><span>Repository Detected</span><span class="badge ${st.isRepo ? 'badge-success' : 'badge-warning'}">${st.isRepo ? 'Yes' : 'Not Initialized'}</span></div>
        <div class="toggle-row"><span>Current Branch</span><span class="mono">${escapeHtml(st.branch || 'N/A')}</span></div>
        <div class="toggle-row"><span>Modified Files</span><span class="mono">${(st.files || []).length}</span></div>
      </div>
    `;
  }

  async function renderSettingsPrivacy(el) {
    const modeData = await api.get('/api/mode');
    const modes = [
      { id: 'local', title: 'Local Only (Air-Gapped Privacy)', desc: 'Strictly blocks all cloud AI dispatches. Only local Ollama / localhost models may run.' },
      { id: 'hybrid', title: 'Hybrid (Local + Cloud Fallback)', desc: 'Uses local models where available with automatic cloud failover.' },
      { id: 'cloud', title: 'Cloud Preferred', desc: 'Routes to highest-capability configured cloud models with local fallback.' },
    ];
    el.innerHTML = `
      <div>
        <h3 style="font-size:16px;font-weight:600;">Privacy & Data Boundary Modes</h3>
        <p style="font-size:12px;color:var(--text-secondary);">Control whether code and prompts may be sent to external cloud APIs.</p>
      </div>
      <div class="flex-col gap-2">
        ${modes.map((m) => `
          <button class="card card-interactive flex items-center justify-between gap-3" style="text-align:left;${modeData.mode === m.id ? 'border-color:var(--accent-primary);background:var(--accent-primary-subtle);' : ''}" onclick="MaxViews.setPrivacyMode('${m.id}')">
            <div>
              <div style="font-weight:600;">${m.title}</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${m.desc}</div>
            </div>
            <span class="badge ${modeData.mode === m.id ? 'badge-cyan' : ''}">${modeData.mode === m.id ? 'Active' : 'Enable'}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  async function setPrivacyMode(mode) {
    await api.post('/api/mode', { mode });
    const pill = document.getElementById('sb-privacy-mode');
    if (pill) pill.textContent = mode.toUpperCase();
    toast(`Privacy mode switched to ${mode.toUpperCase()}`, 'success');
    switchSettingsSection('privacy');
  }

  async function renderSettingsMemory(el) {
    const [convs, cps] = await Promise.all([
      api.get('/api/conversations').catch(() => []),
      api.get('/api/checkpoints').catch(() => []),
    ]);
    const cList = Array.isArray(convs) ? convs : (convs?.conversations || []);
    const cpList = Array.isArray(cps) ? cps : (cps?.checkpoints || []);
    el.innerHTML = `
      <div>
        <h3 style="font-size:16px;font-weight:600;">Project Memory & Persistent Sessions</h3>
        <p style="font-size:12px;color:var(--text-secondary);">Persisted conversations, checkpoints, and crash-recovery state stored in isolated user AppData.</p>
      </div>
      <div class="cc-health-grid">
        <div class="cc-metric-box"><span class="cc-metric-label">Saved Conversations</span><span class="cc-metric-val mono">${cList.length}</span></div>
        <div class="cc-metric-box"><span class="cc-metric-label">Workspace Checkpoints</span><span class="cc-metric-val mono">${cpList.length}</span></div>
      </div>
      <div class="flex-col gap-2">
        ${cList.slice(0, 6).map((c) => `
          <div class="toggle-row">
            <div style="min-width:0;">
              <div style="font-weight:500;" class="truncate">${escapeHtml(c.title || c.id)}</div>
              <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(c.status || 'saved')} • ${formatRelativeTime(c.updatedAt)}</div>
            </div>
            <button class="btn btn-xs btn-danger" onclick="MaxViews.deleteConversation('${escapeHtml(c.id)}')">Delete</button>
          </div>
        `).join('')}
      </div>
    `;
  }

  async function deleteConversation(id) {
    await api.del(`/api/conversations/${encodeURIComponent(id)}`);
    toast('Conversation removed', 'info');
    switchSettingsSection('memory');
  }

  function renderSettingsAppearance(el) {
    const current = localStorage.getItem('maxide_theme') || 'dark';
    el.innerHTML = `
      <div>
        <h3 style="font-size:16px;font-weight:600;">Appearance & Visual Identity</h3>
        <p style="font-size:12px;color:var(--text-secondary);">MaxIDE APEX graphite dark theme with optional high-contrast light mode.</p>
      </div>
      <div class="card flex-col gap-3">
        <div class="toggle-row">
          <div>
            <div style="font-weight:500;">Interface Theme</div>
            <div style="font-size:11px;color:var(--text-muted);">Switch between APEX Graphite Dark and Daylight Light.</div>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-sm ${current === 'dark' ? 'btn-primary' : ''}" onclick="MaxUI.applyTheme('dark'); MaxViews.switchSettingsSection('appearance');">Dark Graphite</button>
            <button class="btn btn-sm ${current === 'light' ? 'btn-primary' : ''}" onclick="MaxUI.applyTheme('light'); MaxViews.switchSettingsSection('appearance');">Light</button>
          </div>
        </div>
      </div>
    `;
  }

  async function renderSettingsDiagnostics(el) {
    const [health, metrics] = await Promise.all([
      api.get('/api/health').catch(() => ({})),
      api.get('/api/metrics').catch(() => ({})),
    ]);
    const tel = health.telemetry || {};
    el.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h3 style="font-size:16px;font-weight:600;">System Diagnostics & Telemetry</h3>
          <p style="font-size:12px;color:var(--text-secondary);">Live server health, runtime resources, and gateway metrics.</p>
        </div>
        <button class="btn btn-sm" onclick="MaxViews.switchSettingsSection('diagnostics')">Refresh</button>
      </div>
      <div class="cc-health-grid">
        <div class="cc-metric-box"><span class="cc-metric-label">Gateway Status</span><span class="cc-metric-val"><span class="status-dot online"></span>${escapeHtml(health.status || 'healthy')}</span></div>
        <div class="cc-metric-box"><span class="cc-metric-label">Server PID / Uptime</span><span class="cc-metric-val mono">PID ${health.pid || '-'} • ${Math.round(health.uptime || 0)}s</span></div>
        <div class="cc-metric-box"><span class="cc-metric-label">CPU Architecture</span><span class="cc-metric-val mono">${tel.cpuCores || '-'}c ${escapeHtml(tel.arch || '')} (${escapeHtml(tel.platform || '')})</span></div>
        <div class="cc-metric-box"><span class="cc-metric-label">Memory Utilization</span><span class="cc-metric-val mono">${tel.memUsagePct || 0}% • Heap ${tel.heapUsedMb || 0} MB</span></div>
        <div class="cc-metric-box"><span class="cc-metric-label">Agent Lifecycle</span><span class="cc-metric-val mono">${escapeHtml(health.agentLifecycle || 'IDLE')}</span></div>
        <div class="cc-metric-box"><span class="cc-metric-label">Registered Providers / Models</span><span class="cc-metric-val mono">${health.providersCount || 0} / ${health.modelsCount || 0}</span></div>
      </div>
      <div class="card">
        <div class="cc-section-title" style="margin-bottom:6px;">Raw Gateway Metrics</div>
        <pre class="mono" style="font-size:11px;color:var(--text-secondary);overflow:auto;max-height:160px;">${escapeHtml(JSON.stringify(metrics, null, 2))}</pre>
      </div>
    `;
  }

  function openAddProviderModal() {
    const modal = document.getElementById('modal-add-provider');
    if (modal) modal.classList.remove('hidden');
  }
  function closeAddProviderModal() {
    const modal = document.getElementById('modal-add-provider');
    if (modal) modal.classList.add('hidden');
  }
  async function saveNewProvider() {
    const name = document.getElementById('add-prov-name')?.value.trim();
    const apiType = document.getElementById('add-prov-type')?.value || 'openai_compatible';
    const baseUrl = document.getElementById('add-prov-url')?.value.trim();
    const apiKey = document.getElementById('add-prov-key')?.value.trim();
    const defaultModel = document.getElementById('add-prov-model')?.value.trim();
    if (!name) return toast('Provider name is required', 'warning');
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    try {
      await api.post('/api/providers', {
        id,
        name,
        type: baseUrl && (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) ? 'local' : 'cloud',
        apiType,
        baseUrl,
        apiKey,
        defaultModel,
        isEnabled: true,
      });
      closeAddProviderModal();
      toast(`Provider "${name}" registered`, 'success');
      switchSettingsSection('providers');
      if (window.refreshTopbarModels) window.refreshTopbarModels();
    } catch (err) {
      toast(`Failed to register provider: ${err.message}`, 'error');
    }
  }

  // =========================================================================
  // NEW PROJECT & OPEN EXISTING PROJECT MODALS
  // =========================================================================
  function openNewProjectModal() {
    const m = document.getElementById('modal-new-project');
    if (m) m.classList.remove('hidden');
  }
  function closeNewProjectModal() {
    const m = document.getElementById('modal-new-project');
    if (m) m.classList.add('hidden');
  }
  async function submitNewProject() {
    const name = document.getElementById('new-proj-name')?.value.trim();
    const template = document.getElementById('new-proj-template')?.value || 'node';
    if (!name) return toast('Project name is required', 'warning');
    try {
      const defPath = await api.get('/api/workspace/default-path').catch(() => ({ defaultPath: '' }));
      const baseDir = defPath.defaultPath || '';
      const targetPath = baseDir ? `${baseDir}\\${name}` : name;
      await api.post('/api/workspace/create-project', { name, path: targetPath, template });
      await api.post('/api/projects', { name, activeWorkspace: targetPath, folders: [targetPath] }).catch(() => {});
      closeNewProjectModal();
      toast(`Created project "${name}"`, 'success');
      switchMainView('workspace');
      if (window.refreshFileTree) await window.refreshFileTree();
    } catch (err) {
      toast(`Create project failed: ${err.message}`, 'error');
    }
  }

  function openProjectSwitcherModal() {
    const m = document.getElementById('modal-open-project');
    if (m) m.classList.remove('hidden');
  }
  function closeProjectSwitcherModal() {
    const m = document.getElementById('modal-open-project');
    if (m) m.classList.add('hidden');
  }
  async function submitOpenExistingProject() {
    const dir = document.getElementById('open-proj-path')?.value.trim();
    if (!dir) return toast('Enter an absolute folder path', 'warning');
    try {
      await api.post('/api/workspace/switch', { path: dir });
      closeProjectSwitcherModal();
      toast(`Opened workspace: ${dir}`, 'success');
      switchMainView('workspace');
      if (window.refreshFileTree) await window.refreshFileTree();
      refreshGitPanel();
    } catch (err) {
      toast(`Could not open folder: ${err.message}`, 'error');
    }
  }

  // =========================================================================
  // COMMAND PALETTE (Ctrl+K / Ctrl+Shift+P) & QUICK FILE SEARCH (Ctrl+P)
  // =========================================================================
  function getPaletteCommands() {
    return [
      { id: 'view-home', label: 'Go to Command Center', shortcut: '', run: () => switchMainView('home') },
      { id: 'view-ws', label: 'Go to AI Engineering Workspace', shortcut: '', run: () => switchMainView('workspace') },
      { id: 'view-mc', label: 'Open Agent Mission Control', shortcut: '', run: () => switchMainView('mission') },
      { id: 'view-prev', label: 'Open Live Preview Studio', shortcut: '', run: () => switchMainView('preview') },
      { id: 'file-search', label: 'Quick Open File...', shortcut: 'Ctrl+P', run: () => openCommandPalette('files') },
      { id: 'focus-mode', label: 'Toggle Focus Mode', shortcut: 'Ctrl+Shift+F', run: () => window.toggleFocusMode && window.toggleFocusMode() },
      { id: 'toggle-term', label: 'Toggle Integrated Terminal', shortcut: 'Ctrl+`', run: () => window.toggleBottomPanel && window.toggleBottomPanel() },
      { id: 'toggle-side', label: 'Toggle Left Sidebar', shortcut: 'Ctrl+B', run: () => window.toggleSidebar && window.toggleSidebar() },
      { id: 'new-proj', label: 'New Project...', shortcut: '', run: () => openNewProjectModal() },
      { id: 'open-proj', label: 'Open Existing Project Folder...', shortcut: '', run: () => openProjectSwitcherModal() },
      { id: 'save-file', label: 'Save Active File', shortcut: 'Ctrl+S', run: () => window.saveActiveFile && window.saveActiveFile() },
      { id: 'run-tests', label: 'Run Project Tests', shortcut: '', run: () => { switchMainView('workspace'); runProjectTestsFromPanel(); } },
      { id: 'open-settings', label: 'Open Settings (AI Providers, Models, Security)', shortcut: '', run: () => openSettingsModal('providers') },
      { id: 'theme-toggle', label: 'Toggle Dark / Light Theme', shortcut: '', run: () => {
        const cur = localStorage.getItem('maxide_theme') || 'dark';
        window.MaxUI.applyTheme(cur === 'dark' ? 'light' : 'dark');
        toast(`Switched to ${cur === 'dark' ? 'Light' : 'Dark Graphite'} theme`, 'info');
      } },
    ];
  }

  function openCommandPalette(mode = 'commands') {
    viewState.paletteMode = mode;
    viewState.paletteSelectedIdx = 0;
    const modal = document.getElementById('modal-command-palette');
    const input = document.getElementById('palette-search-input');
    const tag = document.getElementById('palette-mode-tag');
    if (!modal || !input) return;
    if (tag) tag.textContent = mode === 'files' ? 'FILE SEARCH' : 'COMMANDS';
    input.placeholder = mode === 'files' ? 'Search files by name or path...' : 'Type a command or search actions...';
    input.value = '';
    modal.classList.remove('hidden');
    renderPaletteItems('');
    input.focus();
  }

  function closeCommandPalette() {
    const modal = document.getElementById('modal-command-palette');
    if (modal) modal.classList.add('hidden');
  }

  function getFilteredPaletteItems(query) {
    const q = (query || '').trim().toLowerCase();
    if (viewState.paletteMode === 'files') {
      return viewState.allFlatFiles
        .filter((f) => !q || f.toLowerCase().includes(q))
        .slice(0, 30)
        .map((f) => ({
          label: f,
          shortcut: 'File',
          run: () => {
            switchMainView('workspace');
            if (window.openFileInEditor) window.openFileInEditor(f);
          },
        }));
    }
    return getPaletteCommands().filter((c) => !q || c.label.toLowerCase().includes(q));
  }

  function renderPaletteItems(query) {
    const listEl = document.getElementById('palette-results-list');
    if (!listEl) return;
    const items = getFilteredPaletteItems(query);
    if (viewState.paletteSelectedIdx >= items.length) viewState.paletteSelectedIdx = 0;
    if (items.length === 0) {
      listEl.innerHTML = '<div style="padding:18px;text-align:center;color:var(--text-muted);font-size:12px;">No matching results.</div>';
      return;
    }
    listEl.innerHTML = items.map((item, idx) => `
      <button class="palette-item ${idx === viewState.paletteSelectedIdx ? 'selected' : ''}" data-pal-idx="${idx}">
        <span class="truncate ${viewState.paletteMode === 'files' ? 'mono' : ''}">${escapeHtml(item.label)}</span>
        ${item.shortcut ? `<span class="kbd">${escapeHtml(item.shortcut)}</span>` : ''}
      </button>
    `).join('');

    listEl.querySelectorAll('[data-pal-idx]').forEach((btn) => {
      btn.onclick = () => {
        const i = Number(btn.getAttribute('data-pal-idx'));
        closeCommandPalette();
        if (items[i] && items[i].run) items[i].run();
      };
    });
  }

  function handlePaletteKeydown(e) {
    const input = document.getElementById('palette-search-input');
    const items = getFilteredPaletteItems(input ? input.value : '');
    if (e.key === 'Escape') {
      e.preventDefault();
      closeCommandPalette();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      viewState.paletteSelectedIdx = (viewState.paletteSelectedIdx + 1) % Math.max(1, items.length);
      renderPaletteItems(input ? input.value : '');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      viewState.paletteSelectedIdx = (viewState.paletteSelectedIdx - 1 + Math.max(1, items.length)) % Math.max(1, items.length);
      renderPaletteItems(input ? input.value : '');
    } else if (e.key === 'Enter' && items[viewState.paletteSelectedIdx]) {
      e.preventDefault();
      const chosen = items[viewState.paletteSelectedIdx];
      closeCommandPalette();
      if (chosen.run) chosen.run();
    }
  }

  function toggleNotificationsPopover() {
    const pop = document.getElementById('notifications-popover');
    if (!pop) return;
    pop.classList.toggle('hidden');
    const body = document.getElementById('notifications-list-body');
    if (body) {
      if (viewState.notifications.length === 0) {
        body.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:12px;text-align:center;">All clear — no unread notifications.</div>';
      } else {
        body.innerHTML = viewState.notifications.map((n) => `
          <div style="padding:8px 10px;border-bottom:1px solid var(--border-subtle);font-size:12px;">
            <div class="flex items-center justify-between">
              <strong style="color:var(--text-primary);">${escapeHtml(n.title)}</strong>
              <span class="mono" style="font-size:10px;color:var(--text-muted);">${n.time}</span>
            </div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${escapeHtml(n.detail)}</div>
          </div>
        `).join('');
      }
    }
  }

  return {
    viewState,
    pushLog,
    addNotification,
    switchMainView,
    refreshCommandCenter,
    openRecentProject,
    launchFromCommandCenter,
    refreshMissionControl,
    taskControl,
    initPreviewStudio,
    navigatePreviewUrl,
    previewBack,
    previewForward,
    reloadPreviewStudio,
    setPreviewViewport,
    verifyPreviewIsolation,
    capturePreviewScreenshot,
    inspectPreviewDom,
    openPreviewExternal,
    runSidebarSearch,
    refreshGitPanel,
    commitGitChanges,
    refreshIntegrationsPanel,
    refreshStructurePanel,
    createCheckpointPrompt,
    restoreCheckpointById,
    switchBottomTab,
    runTerminalCommand,
    runProjectTestsFromPanel,
    openSettingsModal,
    closeSettingsModal,
    switchSettingsSection,
    saveProviderField,
    testProvider,
    removeProvider,
    discoverLocalModels,
    selectModel,
    setAutonomy,
    updatePermission,
    updateEditorPref,
    setPrivacyMode,
    deleteConversation,
    openAddProviderModal,
    closeAddProviderModal,
    saveNewProvider,
    openNewProjectModal,
    closeNewProjectModal,
    submitNewProject,
    openProjectSwitcherModal,
    closeProjectSwitcherModal,
    submitOpenExistingProject,
    openCommandPalette,
    closeCommandPalette,
    renderPaletteItems,
    handlePaletteKeydown,
    toggleNotificationsPopover,
  };
})();
