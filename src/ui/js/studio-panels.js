/* ==========================================================================
   MAXIDE APEX — Project Intelligence & AI Control Center Controllers
   Real Ollama Lifecycle • RTX 3050 VRAM Telemetry • Project Memory • Indexing
   ========================================================================== */

window.MaxStudioPanels = (function () {
  const { api, escapeHtml, toast, formatRelativeTime } = window.MaxUI;

  // =========================================================================
  // VIEW 5: PROJECT INTELLIGENCE & PERSISTENT PROJECT MEMORY
  // =========================================================================
  async function refreshProjectIntelligence() {
    const statsEl = document.getElementById('pi-stats-grid');
    const langEl = document.getElementById('pi-languages-list');
    const depsEl = document.getElementById('pi-dependencies-list');
    const hubsEl = document.getElementById('pi-hubs-list');
    const symsEl = document.getElementById('pi-symbols-list');
    if (!statsEl) return;

    try {
      const [summary, memory] = await Promise.all([
        api.get('/api/intelligence/summary'),
        api.get('/api/memory').catch(() => null),
      ]);

      statsEl.innerHTML = `
        <div class="cc-metric-box">
          <span class="cc-metric-label">Indexed Files</span>
          <span class="cc-metric-val mono">${summary.totalFiles}</span>
        </div>
        <div class="cc-metric-box">
          <span class="cc-metric-label">Total Lines</span>
          <span class="cc-metric-val mono">${(summary.totalLines || 0).toLocaleString()}</span>
        </div>
        <div class="cc-metric-box">
          <span class="cc-metric-label">Indexed Symbols</span>
          <span class="cc-metric-val mono">${summary.totalSymbols}</span>
        </div>
        <div class="cc-metric-box">
          <span class="cc-metric-label">Detected Stack</span>
          <span class="cc-metric-val" style="flex-wrap:wrap;gap:4px;">
            ${(summary.frameworks && summary.frameworks.length > 0)
              ? summary.frameworks.map((f) => `<span class="badge badge-accent">${escapeHtml(f)}</span>`).join('')
              : '<span class="badge">Generic Workspace</span>'}
          </span>
        </div>
      `;

      if (langEl) {
        const langs = summary.languages || [];
        langEl.innerHTML = langs.length === 0
          ? '<div style="color:var(--text-muted);font-size:12px;">No source files indexed yet.</div>'
          : langs.map((l) => `
            <div style="margin-bottom:8px;">
              <div class="flex items-center justify-between" style="font-size:12px;margin-bottom:3px;">
                <span style="font-weight:500;">${escapeHtml(l.language)}</span>
                <span class="mono" style="color:var(--text-secondary);font-size:11px;">${l.files} file${l.files === 1 ? '' : 's'} (${l.percentage}%)</span>
              </div>
              <div style="height:5px;background:var(--bg-secondary);border-radius:99px;overflow:hidden;">
                <div style="height:100%;width:${Math.max(4, l.percentage)}%;background:var(--accent-primary);"></div>
              </div>
            </div>
          `).join('');
      }

      if (depsEl) {
        const deps = summary.dependencies || [];
        depsEl.innerHTML = deps.length === 0
          ? '<div style="color:var(--text-muted);font-size:12px;">No package dependencies detected in workspace manifests.</div>'
          : deps.slice(0, 20).map((d) => `
            <div class="flex items-center justify-between" style="padding:5px 0;border-bottom:1px solid var(--border-subtle);font-size:12px;">
              <span class="mono">${escapeHtml(d.name)}</span>
              <div class="flex items-center gap-2">
                <span class="mono" style="font-size:11px;color:var(--text-muted);">${escapeHtml(d.version)}</span>
                <span class="badge ${d.dev ? '' : 'badge-cyan'}">${d.dev ? 'dev' : 'prod'}</span>
              </div>
            </div>
          `).join('');
      }

      if (hubsEl) {
        const hubs = summary.dependencyHubs || [];
        hubsEl.innerHTML = hubs.length === 0
          ? '<div style="color:var(--text-muted);font-size:12px;">No cross-file imports mapped yet.</div>'
          : hubs.slice(0, 10).map((h) => `
            <button class="tree-row justify-between" style="width:100%;" onclick="openFileInEditor('${escapeHtml(h.file)}')">
              <span class="mono truncate" style="font-size:11.5px;color:var(--accent-cyan);">${escapeHtml(h.file)}</span>
              <span class="mono" style="font-size:10.5px;color:var(--text-muted);">${h.importsCount} imp • ${h.dependentsCount} ref</span>
            </button>
          `).join('');
      }

      if (symsEl) {
        const syms = summary.topSymbols || [];
        symsEl.innerHTML = syms.length === 0
          ? '<div style="color:var(--text-muted);font-size:12px;">No functions or classes extracted yet.</div>'
          : syms.slice(0, 24).map((s) => `
            <button class="tree-row justify-between" style="width:100%;" onclick="openFileInEditor('${escapeHtml(s.file)}')">
              <span class="flex items-center gap-2 truncate">
                <span class="badge badge-accent mono">${escapeHtml(s.kind)}</span>
                <span class="mono truncate" style="font-size:11.5px;">${escapeHtml(s.name)}</span>
              </span>
              <span class="mono" style="font-size:10px;color:var(--text-muted);">${escapeHtml(s.file)}:${s.line}</span>
            </button>
          `).join('');
      }

      if (memory) {
        const archInp = document.getElementById('pm-architecture');
        const instInp = document.getElementById('pm-instructions');
        const decInp = document.getElementById('pm-decisions');
        const issInp = document.getElementById('pm-issues');
        const histEl = document.getElementById('pm-task-history');
        if (archInp) archInp.value = memory.architecture || '';
        if (instInp) instInp.value = memory.instructions || '';
        if (decInp) decInp.value = (memory.decisions || []).join('\n');
        if (issInp) issInp.value = (memory.knownIssues || []).join('\n');
        if (histEl) {
          const hist = memory.taskHistory || [];
          histEl.innerHTML = hist.length === 0
            ? '<div style="font-size:12px;color:var(--text-muted);">Completed and failed tasks will automatically record here.</div>'
            : hist.slice(0, 8).map((h) => `
              <div style="padding:6px 0;border-bottom:1px solid var(--border-subtle);font-size:12px;">
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate">${escapeHtml(h.summary)}</span>
                  <span class="badge ${h.status === 'COMPLETED' ? 'badge-success' : h.status === 'FAILED' ? 'badge-error' : 'badge-warning'}">${escapeHtml(h.status || 'RECORDED')}</span>
                </div>
                <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;">${formatRelativeTime(h.timestamp)}</div>
              </div>
            `).join('');
        }
      }
    } catch (err) {
      toast(`Intelligence load failed: ${err.message}`, 'error');
    }
  }

  async function reindexProjectIntelligence() {
    try {
      toast('Re-indexing workspace repository...', 'info', 1800);
      const res = await api.post('/api/intelligence/reindex');
      toast(`Indexed ${res.filesIndexed || 0} files & ${res.symbolsIndexed || 0} symbols`, 'success');
      await refreshProjectIntelligence();
    } catch (err) {
      toast(`Re-index failed: ${err.message}`, 'error');
    }
  }

  async function saveProjectMemoryForm() {
    try {
      const architecture = document.getElementById('pm-architecture')?.value || '';
      const instructions = document.getElementById('pm-instructions')?.value || '';
      const decisions = (document.getElementById('pm-decisions')?.value || '').split('\n').map((l) => l.trim()).filter(Boolean);
      const knownIssues = (document.getElementById('pm-issues')?.value || '').split('\n').map((l) => l.trim()).filter(Boolean);
      await api.post('/api/memory', { architecture, instructions, decisions, knownIssues });
      toast('Project memory saved locally (credentials scrubbed)', 'success');
    } catch (err) {
      toast(`Save memory failed: ${err.message}`, 'error');
    }
  }

  // =========================================================================
  // VIEW 6: AI CONTROL CENTER (OLLAMA LIFECYCLE, ROUTING, HARDWARE BUDGET)
  // =========================================================================
  async function refreshAIControlCenter() {
    const statusBox = document.getElementById('aic-ollama-status-card');
    const modelsBox = document.getElementById('aic-models-table');
    const hwBox = document.getElementById('aic-hardware-card');
    const routingBox = document.getElementById('aic-routing-card');
    if (!statusBox) return;

    try {
      const [diag, modeData, providers] = await Promise.all([
        api.get('/api/providers/ollama/diagnostics'),
        api.get('/api/mode'),
        api.get('/api/providers').catch(() => []),
      ]);

      const provList = Array.isArray(providers) ? providers : [];
      const configuredClouds = provList.filter((p) => p.type === 'cloud' && Boolean(p.apiKey));
      const epInput = document.getElementById('aic-ollama-endpoint');
      if (epInput && diag.endpoint) epInput.value = diag.endpoint;

      statusBox.innerHTML = `
        <div class="flex items-center justify-between gap-3" style="flex-wrap:wrap;">
          <div class="flex items-center gap-3">
            <span class="status-dot ${diag.serviceRunning ? 'online' : 'error'}" style="width:10px;height:10px;"></span>
            <div>
              <div style="font-weight:600;font-size:14px;">Ollama Local Inference Engine — ${diag.serviceRunning ? 'ONLINE' : 'OFFLINE'}</div>
              <div class="mono" style="font-size:11.5px;color:var(--text-secondary);">
                Endpoint: ${escapeHtml(diag.endpoint)} • Binary: ${diag.installed ? escapeHtml(diag.binaryPath || 'Detected') : 'Not Installed'} • Latency: ${diag.latencyMs}ms
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            ${!diag.serviceRunning && diag.installed ? `<button class="btn btn-sm btn-primary" onclick="MaxStudioPanels.startOllamaFromUI()">Start Ollama</button>` : ''}
            <button class="btn btn-sm" onclick="MaxStudioPanels.reconnectOllamaFromUI()">Reconnect</button>
            <button class="btn btn-sm btn-ghost" onclick="MaxStudioPanels.refreshAIControlCenter()">Retry</button>
          </div>
        </div>
        <div style="margin-top:10px;padding:8px 10px;border-radius:6px;background:${diag.serviceRunning ? 'var(--status-success-subtle)' : 'var(--status-error-subtle)'};font-size:12px;color:${diag.serviceRunning ? '#86EFAC' : '#FCA5A5'};">
          ${escapeHtml(diag.guidance || diag.error || '')}
        </div>
      `;

      // Installed Local Models & Capability Matrix
      if (modelsBox) {
        const models = diag.models || [];
        if (models.length === 0) {
          modelsBox.innerHTML = `
            <div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px;">
              No installed Ollama models detected at ${escapeHtml(diag.endpoint)}.<br>
              Pull a 4GB-VRAM-friendly model in Terminal: <code class="mono" style="color:var(--accent-cyan);">ollama pull qwen2.5-coder:3b</code>
            </div>
          `;
        } else {
          modelsBox.innerHTML = models.map((m) => {
            const active = modeData.activeModelId === m.id;
            const fitBadge = m.vramFit === 'PERFECT_VRAM' ? 'badge-success' : m.vramFit === 'PARTIAL_CPU_OFFLOAD' ? 'badge-warning' : 'badge-error';
            return `
              <div class="card flex-col gap-2" style="padding:12px;margin-bottom:8px;${active ? 'border-color:var(--accent-primary);' : ''}">
                <div class="flex items-center justify-between gap-2" style="flex-wrap:wrap;">
                  <div class="flex items-center gap-2">
                    <span class="mono" style="font-weight:600;font-size:13px;">${escapeHtml(m.id)}</span>
                    <span class="badge">${escapeHtml(m.parameterSize)} • ${m.sizeMb} MB</span>
                    <span class="badge ${fitBadge}">${m.vramFit.replace(/_/g, ' ')}</span>
                    ${active ? '<span class="badge badge-accent">ACTIVE</span>' : ''}
                  </div>
                  <div class="flex items-center gap-2">
                    <button class="btn btn-xs" onclick="MaxStudioPanels.testOllamaModelFromUI('${escapeHtml(m.id)}')">Test Chat &amp; Tools</button>
                    <button class="btn btn-xs btn-primary" onclick="MaxViews.selectModel('${escapeHtml(m.id)}').then(()=>MaxStudioPanels.refreshAIControlCenter())">Select Model</button>
                  </div>
                </div>
                <div class="flex items-center gap-2" style="flex-wrap:wrap;font-size:11px;">
                  <span class="badge ${m.capabilities.textGeneration ? 'badge-success' : ''}">Text</span>
                  <span class="badge ${m.capabilities.codeGeneration ? 'badge-cyan' : ''}">Code</span>
                  <span class="badge ${m.capabilities.toolCalling ? 'badge-accent' : 'badge-warning'}">${m.capabilities.toolCalling ? 'Tool Calling: Native' : 'Tool Calling: Unsupported'}</span>
                  <span class="badge ${m.capabilities.reasoning ? 'badge-accent' : ''}">${m.capabilities.reasoning ? 'Reasoning' : 'Standard'}</span>
                  ${m.capabilities.vision ? '<span class="badge badge-cyan">Vision</span>' : ''}
                  <span class="mono" style="color:var(--text-muted);margin-left:auto;">Context: ${(m.contextWindow || 32768).toLocaleString()}</span>
                </div>
                <div id="aic-test-result-${escapeHtml(m.id).replace(/[^a-zA-Z0-9_-]/g, '_')}" style="font-size:11.5px;"></div>
              </div>
            `;
          }).join('');
        }
      }

      // Hardware Optimization & RTX 3050 4GB VRAM Monitor
      if (hwBox && diag.hardware) {
        const hw = diag.hardware;
        const gpu = hw.gpu || {};
        const vramPct = gpu.available && gpu.vramTotalMb > 0 ? Math.round((gpu.vramUsedMb / gpu.vramTotalMb) * 100) : 0;
        const recs = diag.recommendations?.recommendedModels || [];
        hwBox.innerHTML = `
          <div class="cc-health-grid" style="margin-bottom:12px;">
            <div class="cc-metric-box">
              <span class="cc-metric-label">GPU Hardware</span>
              <span class="cc-metric-val truncate" title="${escapeHtml(gpu.name || '')}">${escapeHtml(gpu.available ? gpu.name : 'No NVIDIA GPU Detected')}</span>
            </div>
            <div class="cc-metric-box">
              <span class="cc-metric-label">VRAM Budget</span>
              <span class="cc-metric-val mono">${gpu.available ? `${gpu.vramUsedMb} / ${gpu.vramTotalMb} MB (${vramPct}%) • ${gpu.temperatureC}°C` : '4 GB Target'}</span>
            </div>
            <div class="cc-metric-box">
              <span class="cc-metric-label">CPU Compute</span>
              <span class="cc-metric-val mono">${hw.cpuCores} Threads</span>
            </div>
            <div class="cc-metric-box">
              <span class="cc-metric-label">System RAM</span>
              <span class="cc-metric-val mono">${hw.ramUsagePct}% (${Math.round((hw.totalRamMb - hw.freeRamMb) / 1024 * 10) / 10} / ${Math.round(hw.totalRamMb / 1024)} GB)</span>
            </div>
          </div>
          <div class="cc-section-title" style="margin-bottom:6px;">Recommended Free Local Models (4GB VRAM / 16GB RAM)</div>
          <div class="flex-col gap-1">
            ${recs.map((r) => `
              <div class="flex items-center justify-between" style="padding:5px 8px;background:var(--bg-secondary);border-radius:6px;font-size:11.5px;">
                <div>
                  <span class="mono" style="font-weight:600;color:var(--accent-cyan);">${escapeHtml(r.name)}</span>
                  <span style="color:var(--text-muted);margin-left:6px;">${escapeHtml(r.tag)} (~${r.vramRequiredGb} GB)</span>
                </div>
                <span class="badge ${r.fit === 'PERFECT_VRAM' ? 'badge-success' : 'badge-warning'}">${r.fit === 'PERFECT_VRAM' ? 'Fits 4GB VRAM' : 'CPU+GPU Hybrid'}</span>
              </div>
            `).join('')}
          </div>
        `;
      }

      // Routing Profile & Honest Cloud/Local Privacy Mode
      if (routingBox) {
        const profiles = ['auto', 'coding', 'reasoning', 'fast', 'balanced'];
        const privacyModes = ['local', 'hybrid', 'cloud'];
        const curModel = (modeData.activeModelId || 'auto').toLowerCase();
        const curPrivacy = (modeData.mode || 'hybrid').toLowerCase();
        const cloudWarning = (curPrivacy === 'cloud' && configuredClouds.length === 0)
          ? `<div style="margin-top:8px;padding:8px 10px;border-radius:6px;background:var(--status-warning-subtle);color:#FBBF24;font-size:11.5px;">Warning: CLOUD mode is selected, but 0 cloud API keys are configured. Switch to LOCAL ONLY or HYBRID to use Ollama, or add a cloud key in Settings.</div>`
          : '';

        routingBox.innerHTML = `
          <div class="cc-section-title" style="margin-bottom:8px;">Routing Strategy</div>
          <div class="flex gap-2" style="flex-wrap:wrap;margin-bottom:14px;">
            ${profiles.map((prof) => `
              <button class="btn btn-sm ${curModel === prof ? 'btn-primary' : ''}" onclick="MaxViews.selectModel('${prof}').then(()=>MaxStudioPanels.refreshAIControlCenter())">${prof.toUpperCase()}</button>
            `).join('')}
          </div>

          <div class="cc-section-title" style="margin-bottom:8px;">Privacy &amp; Dispatch Boundary</div>
          <div class="flex gap-2" style="flex-wrap:wrap;">
            ${privacyModes.map((pm) => `
              <button class="btn btn-sm ${curPrivacy === pm ? 'btn-primary' : ''}" onclick="MaxStudioPanels.setPrivacyModeFromControl('${pm}')">${pm === 'local' ? 'LOCAL ONLY' : pm.toUpperCase()}</button>
            `).join('')}
          </div>
          ${cloudWarning}
          <div style="margin-top:12px;font-size:12px;color:var(--text-secondary);">
            Configured Cloud Providers: <strong class="mono">${configuredClouds.length}</strong>
            ${configuredClouds.length === 0 ? ' (₹0 Local-First Mode — No Paid API Required)' : ` (${configuredClouds.map((c) => c.name).join(', ')})`}
          </div>
        `;
      }
    } catch (err) {
      statusBox.innerHTML = `<div style="color:var(--status-error);font-size:12px;">Diagnostics error: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function startOllamaFromUI() {
    try {
      toast('Starting local Ollama service...', 'info', 2500);
      const res = await api.post('/api/providers/ollama/start');
      toast(res.message || (res.started ? 'Ollama started' : 'Could not start Ollama'), res.started ? 'success' : 'warning', 4500);
      if (window.refreshTopbarModels) await window.refreshTopbarModels();
      await refreshAIControlCenter();
    } catch (err) {
      toast(`Start Ollama failed: ${err.message}`, 'error');
    }
  }

  async function reconnectOllamaFromUI() {
    try {
      const baseUrl = document.getElementById('aic-ollama-endpoint')?.value.trim() || 'http://127.0.0.1:11434';
      toast(`Reconnecting to ${baseUrl}...`, 'info', 2000);
      const res = await api.post('/api/providers/ollama/reconnect', { baseUrl });
      if (res.success) {
        toast(`Connected! Active model: ${res.activeModel} (${res.discoveredCount} local models)`, 'success');
      } else {
        toast(`Ollama unreachable at ${baseUrl}: ${res.health?.message || 'Offline'}`, 'warning');
      }
      if (window.refreshTopbarModels) await window.refreshTopbarModels();
      await refreshAIControlCenter();
      if (window.MaxViews) window.MaxViews.refreshCommandCenter();
    } catch (err) {
      toast(`Reconnect failed: ${err.message}`, 'error');
    }
  }

  async function testOllamaModelFromUI(modelId) {
    const safeId = `aic-test-result-${modelId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const box = document.getElementById(safeId);
    if (box) box.innerHTML = '<span style="color:var(--accent-cyan);" class="mono">Testing POST /api/generate &amp; POST /api/chat (with tool schema)...</span>';
    try {
      const res = await api.post('/api/providers/ollama/test', { model: modelId });
      if (box) {
        box.innerHTML = `
          <div style="padding:6px 8px;border-radius:4px;background:var(--bg-code);margin-top:4px;" class="mono">
            <div>/api/generate: <span style="color:${res.generateOk ? '#4ADE80' : '#F87171'};">${res.generateOk ? `PASS (${res.generateLatencyMs}ms) "${escapeHtml(res.generateSample || '')}"` : `FAIL (${escapeHtml(res.generateError || '')})`}</span></div>
            <div>/api/chat + tools: <span style="color:${res.chatOk ? '#4ADE80' : '#FBBF24'};">${escapeHtml(res.toolCallingDetails)} (${res.chatLatencyMs}ms)</span></div>
          </div>
        `;
      }
    } catch (err) {
      if (box) box.innerHTML = `<span style="color:var(--status-error);">Probe failed: ${escapeHtml(err.message)}</span>`;
    }
  }

  async function setPrivacyModeFromControl(mode) {
    await api.post('/api/mode', { mode });
    const pill = document.getElementById('sb-privacy-mode');
    if (pill) pill.textContent = mode === 'local' ? 'LOCAL ONLY' : mode.toUpperCase();
    toast(`Privacy mode set to ${mode.toUpperCase()}`, 'success');
    await refreshAIControlCenter();
  }

  return {
    refreshProjectIntelligence,
    reindexProjectIntelligence,
    saveProjectMemoryForm,
    refreshAIControlCenter,
    startOllamaFromUI,
    reconnectOllamaFromUI,
    testOllamaModelFromUI,
    setPrivacyModeFromControl,
  };
})();
