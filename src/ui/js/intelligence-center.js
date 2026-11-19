/* ==========================================================================
   MAXIDE APEX — Mission 7: APEX INTELLIGENCE CENTER Controller
   Displays ACTUAL SQLite metrics only (zero fabricated percentages):
   1. Reasoning Strategy       6. Strategy Performance (Contextual Bandit)
   2. Experience Memory        7. Evaluation Results (Trusted Reward)
   3. Learning History         8. Policy Versions & Offline Eval / Rollback
   4. Model Performance        9. User Preferences (UCB1 / Thompson)
   5. Tool Performance        10. Privacy & Learning Controls
   ========================================================================== */

window.MaxIntelligenceCenter = (function () {
  const { api, escapeHtml, toast, confirmDialog, formatRelativeTime } = window.MaxUI;

  let currentSubTab = 'apex-center'; // 'apex-center' | 'codebase-index'
  let currentMemTab = 'episodic';    // 'episodic' | 'semantic' | 'procedural'
  let scopeFilter = 'all';           // 'all' | 'project'
  let snapshotCache = null;

  function switchSubTab(sub) {
    currentSubTab = sub;
    const apexPane = document.getElementById('intel-pane-apex');
    const codePane = document.getElementById('intel-pane-codebase');
    const btnApex = document.getElementById('intel-subtab-apex');
    const btnCode = document.getElementById('intel-subtab-codebase');
    if (apexPane) apexPane.classList.toggle('hidden', sub !== 'apex-center');
    if (codePane) codePane.classList.toggle('hidden', sub !== 'codebase-index');
    if (btnApex) btnApex.classList.toggle('active', sub === 'apex-center');
    if (btnCode) btnCode.classList.toggle('active', sub === 'codebase-index');

    if (sub === 'apex-center') {
      refreshDashboard();
    } else if (window.MaxStudioPanels) {
      window.MaxStudioPanels.refreshProjectIntelligence();
    }
  }

  function setMemoryTab(tab) {
    currentMemTab = tab;
    ['episodic', 'semantic', 'procedural'].forEach((t) => {
      const btn = document.getElementById(`ic-memtab-${t}`);
      if (btn) btn.classList.toggle('active', t === tab);
    });
    renderExperienceMemory();
  }

  function setScope(scope) {
    scopeFilter = scope;
    refreshDashboard();
  }

  async function refreshDashboard() {
    const kpiEl = document.getElementById('ic-kpi-grid');
    if (!kpiEl) return;
    try {
      const url = scopeFilter === 'project'
        ? '/api/intelligence-center/dashboard?scope=project'
        : '/api/intelligence-center/dashboard';
      const data = await api.get(url);
      snapshotCache = data;
      renderAll(data);
    } catch (err) {
      toast(`APEX Intelligence Center load failed: ${err.message}`, 'error');
    }
  }

  function renderAll(data) {
    renderKpis(data);
    renderReasoningStrategy(data.lastDecisionPlan);
    renderStrategyPerformance(data.strategyStats || []);
    renderModelPerformance(data.modelPerformance || []);
    renderToolPerformance(data.toolPerformance || []);
    renderLearningHistory(data.episodicMemory || []);
    renderExperienceMemory();
    renderEvaluationResults(data.evaluations || []);
    renderPolicyVersions(data.policyVersions || [], data.lastOfflineEval);
    renderRollbackHistory(data.rollbackHistory || []);
    renderValidationAnalytics(data);
    renderOutcomeQuality(data);
    renderPreferencesAndGovernance(data);
  }

  function renderKpis(data) {
    const el = document.getElementById('ic-kpi-grid');
    if (!el) return;
    const ms = data.memoryStats || {};
    const dbKb = ms.dbSizeBytes ? `${(ms.dbSizeBytes / 1024).toFixed(1)} KB` : '0 KB';
    const verifiedRateText = ms.episodicCount > 0 ? `${ms.verifiedCompletionRate}%` : 'No data yet';
    el.innerHTML = `
      <div class="cc-metric-box">
        <span class="cc-metric-label">Recorded Episodes</span>
        <span class="cc-metric-val mono">${ms.episodicCount || 0}</span>
        <span style="font-size:10.5px;color:var(--text-muted);">${ms.verifiedSuccessCount || 0} verified • ${ms.failedCount || 0} failed</span>
      </div>
      <div class="cc-metric-box">
        <span class="cc-metric-label">Verified Completion Rate</span>
        <span class="cc-metric-val mono" style="color:var(--accent-cyan);">${verifiedRateText}</span>
        <span style="font-size:10.5px;color:var(--text-muted);">Actual runtime evidence only</span>
      </div>
      <div class="cc-metric-box">
        <span class="cc-metric-label">Active RL Policy</span>
        <span class="cc-metric-val mono">${escapeHtml(data.banditAlgorithm || 'UCB1')}</span>
        <span style="font-size:10.5px;color:var(--text-muted);">${(data.strategyStats || []).length} tracked strategy arms</span>
      </div>
      <div class="cc-metric-box">
        <span class="cc-metric-label">SQLite Experience Store</span>
        <span class="cc-metric-val mono">${dbKb}</span>
        <span style="font-size:10.5px;color:var(--text-muted);">${ms.semanticCount || 0} semantic • ${ms.proceduralCount || 0} procedural</span>
      </div>
    `;
  }

  // Section 1: Reasoning Strategy
  function renderReasoningStrategy(plan) {
    const el = document.getElementById('ic-reasoning-body');
    if (!el) return;
    if (!plan) {
      el.innerHTML = `<div style="font-size:12px;color:var(--text-muted);">No engineering decision recorded in this session yet. Enter an objective above and click <strong>Simulate Reasoning Plan</strong>, or run an APEX Agent task.</div>`;
      return;
    }

    const scoreMap = new Map((plan.banditSelection?.scores || []).map((s) => [s.strategyId, s]));
    const rows = (plan.candidates || []).map((c) => {
      const isSelected = c.id === plan.selectedStrategy?.id;
      const bs = scoreMap.get(c.id);
      return `
        <tr style="border-bottom:1px solid var(--border-subtle);${isSelected ? 'background:rgba(139,92,246,0.12);' : ''}">
          <td style="padding:6px 8px;font-weight:${isSelected ? '600' : '400'};">
            ${isSelected ? '<span class="badge badge-accent" style="margin-right:6px;">SELECTED</span>' : ''}
            ${escapeHtml(c.name)}
            <div class="mono" style="font-size:10px;color:var(--text-muted);">${escapeHtml(c.id)} • ${escapeHtml(c.targetPlatform)}</div>
          </td>
          <td class="mono" style="padding:6px 8px;">${Number(c.weightedHeuristicScore || 0).toFixed(3)}</td>
          <td class="mono" style="padding:6px 8px;">${bs ? bs.score.toFixed(3) : '—'}</td>
          <td class="mono" style="padding:6px 8px;">${bs ? bs.pulls : 0}</td>
        </tr>
      `;
    }).join('');

    el.innerHTML = `
      <div style="padding:10px 12px;background:var(--bg-secondary);border-radius:var(--radius-sm);border-left:3px solid var(--accent-primary);margin-bottom:10px;font-size:12px;">
        <div class="flex items-center gap-2" style="margin-bottom:4px;flex-wrap:wrap;">
          <span class="badge badge-cyan">${escapeHtml(plan.analysis?.taskCategory || 'TASK')}</span>
          <span class="badge badge-accent">${escapeHtml(plan.analysis?.targetPlatform || 'WEB_APP')}</span>
          <span class="mono" style="font-size:11px;color:var(--text-muted);">Selected: ${escapeHtml(plan.selectedStrategy?.id || '')}</span>
        </div>
        <div style="color:var(--text-primary);line-height:1.45;">${escapeHtml(plan.decisionRationale || '')}</div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
          <thead>
            <tr style="text-align:left;color:var(--text-muted);border-bottom:1px solid var(--border-default);">
              <th style="padding:5px 8px;">Evaluated Strategy</th>
              <th style="padding:5px 8px;">9-Criteria Heuristic</th>
              <th style="padding:5px 8px;">Bandit Score</th>
              <th style="padding:5px 8px;">Pulls</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="margin-top:10px;">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em;">Ordered Execution Stages</div>
        <ol style="margin:0;padding-left:18px;font-size:11.5px;color:var(--text-secondary);line-height:1.55;">
          ${(plan.orderedStages || []).map((st) => `<li>${escapeHtml(st)}</li>`).join('')}
        </ol>
      </div>
    `;
  }

  async function runPlanPreview() {
    const inp = document.getElementById('ic-plan-preview-input');
    const prompt = (inp ? inp.value : '').trim();
    if (!prompt) return toast('Enter an engineering objective to evaluate strategies.', 'warning');
    try {
      const res = await api.post('/api/intelligence-center/plan-preview', { prompt });
      if (res.plan) {
        if (snapshotCache) snapshotCache.lastDecisionPlan = res.plan;
        renderReasoningStrategy(res.plan);
        toast(`Strategy selected: ${res.plan.selectedStrategy?.name}`, 'success');
      }
    } catch (err) {
      toast(`Reasoning preview failed: ${err.message}`, 'error');
    }
  }

  // Section 2: Experience Memory (Episodic / Semantic / Procedural)
  function renderExperienceMemory() {
    const el = document.getElementById('ic-memory-list');
    if (!el || !snapshotCache) return;
    const searchEl = document.getElementById('ic-memory-search');
    const q = (searchEl ? searchEl.value : '').trim().toLowerCase();

    if (currentMemTab === 'episodic') {
      const items = (snapshotCache.episodicMemory || []).filter((e) =>
        !q || `${e.prompt} ${e.strategyId} ${e.taskCategory} ${e.summary}`.toLowerCase().includes(q)
      );
      if (items.length === 0) {
        el.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">No episodic memories match this filter.</div>';
        return;
      }
      el.innerHTML = items.slice(0, 20).map((e) => `
        <div style="padding:8px 0;border-bottom:1px solid var(--border-subtle);font-size:12px;">
          <div class="flex items-center justify-between gap-2">
            <span class="truncate" style="font-weight:500;">${escapeHtml(e.prompt)}</span>
            <div class="flex items-center gap-1 shrink-0">
              <span class="badge ${e.verified && e.status === 'COMPLETED' ? 'badge-success' : e.status === 'FAILED' ? 'badge-error' : 'badge-warning'}">${escapeHtml(e.status)}</span>
              <span class="mono badge">${e.reward >= 0 ? '+' : ''}${Number(e.reward).toFixed(2)}</span>
              <button class="btn btn-xs btn-ghost" title="Delete Episode" onclick="MaxIntelligenceCenter.deleteMemoryRecord('episodic_memory','${escapeHtml(e.id)}')">×</button>
            </div>
          </div>
          <div class="mono" style="font-size:10.5px;color:var(--text-muted);margin-top:3px;">
            ${escapeHtml(e.taskCategory)} • ${escapeHtml(e.platform)} • ${escapeHtml(e.strategyId)} • ${escapeHtml(e.modelId)} • v${e.version}
          </div>
        </div>
      `).join('');
    } else if (currentMemTab === 'semantic') {
      const items = (snapshotCache.semanticMemory || []).filter((s) =>
        !q || `${s.key} ${s.value} ${s.category} ${s.projectId}`.toLowerCase().includes(q)
      );
      if (items.length === 0) {
        el.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">No semantic project knowledge recorded yet.</div>';
        return;
      }
      el.innerHTML = items.slice(0, 25).map((s) => `
        <div style="padding:8px 0;border-bottom:1px solid var(--border-subtle);font-size:12px;">
          <div class="flex items-center justify-between gap-2">
            <span><span class="badge badge-accent">${escapeHtml(s.category)}</span> <strong class="mono">${escapeHtml(s.key)}</strong></span>
            <div class="flex items-center gap-1">
              <button class="btn btn-xs btn-ghost" onclick="MaxIntelligenceCenter.editSemanticPrompt('${escapeHtml(s.id)}', '${escapeHtml(s.value).replace(/'/g, "\\'")}')">Edit</button>
              <button class="btn btn-xs btn-ghost" onclick="MaxIntelligenceCenter.deleteMemoryRecord('semantic_memory','${escapeHtml(s.id)}')">×</button>
            </div>
          </div>
          <div style="font-size:11.5px;color:var(--text-secondary);margin-top:3px;">${escapeHtml(s.value)}</div>
        </div>
      `).join('');
    } else {
      const items = (snapshotCache.proceduralMemory || []).filter((p) =>
        !q || `${p.procedureName} ${p.strategyId} ${p.taskCategory}`.toLowerCase().includes(q)
      );
      if (items.length === 0) {
        el.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">No procedural workflows recorded yet.</div>';
        return;
      }
      el.innerHTML = items.slice(0, 20).map((p) => `
        <div style="padding:8px 0;border-bottom:1px solid var(--border-subtle);font-size:12px;">
          <div class="flex items-center justify-between gap-2">
            <span style="font-weight:500;">${escapeHtml(p.procedureName)}</span>
            <div class="flex items-center gap-1">
              <span class="badge badge-success">${p.successCount} ok</span>
              <span class="badge badge-error">${p.failureCount} fail</span>
              <span class="mono badge">avg ${Number(p.avgReward).toFixed(2)}</span>
              <button class="btn btn-xs btn-ghost" onclick="MaxIntelligenceCenter.deleteMemoryRecord('procedural_memory','${escapeHtml(p.id)}')">×</button>
            </div>
          </div>
          <div class="mono" style="font-size:10.5px;color:var(--text-muted);margin-top:2px;">${escapeHtml(p.taskCategory)} • ${escapeHtml(p.strategyId)} • ${p.steps.length} stages</div>
        </div>
      `).join('');
    }
  }

  // Section 3: Learning History (with User Feedback controls)
  function renderLearningHistory(episodes) {
    const el = document.getElementById('ic-learning-history');
    if (!el) return;
    if (episodes.length === 0) {
      el.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">No task learning history recorded yet. Completed and failed engineering tasks appear here with verified reward scores.</div>';
      return;
    }
    el.innerHTML = episodes.slice(0, 15).map((ep) => `
      <div style="padding:8px 0;border-bottom:1px solid var(--border-subtle);font-size:12px;">
        <div class="flex items-center justify-between gap-2">
          <span class="truncate" style="font-weight:500;">${escapeHtml(ep.prompt)}</span>
          <div class="flex items-center gap-1 shrink-0">
            <button class="btn btn-xs ${ep.userFeedbackRating === 1 ? 'btn-success' : 'btn-ghost'}" title="Mark helpful (+reward)" onclick="MaxIntelligenceCenter.submitFeedback('${escapeHtml(ep.id)}', 1)">👍</button>
            <button class="btn btn-xs ${ep.userFeedbackRating === -1 ? 'btn-danger' : 'btn-ghost'}" title="Mark unhelpful (-reward)" onclick="MaxIntelligenceCenter.submitFeedback('${escapeHtml(ep.id)}', -1)">👎</button>
          </div>
        </div>
        <div class="flex items-center justify-between" style="font-size:10.5px;color:var(--text-muted);margin-top:3px;">
          <span class="mono">${escapeHtml(ep.strategyId)} • ${ep.verified ? 'VERIFIED' : 'UNVERIFIED'} • reward ${ep.reward >= 0 ? '+' : ''}${Number(ep.reward).toFixed(2)}</span>
          <span>${formatRelativeTime(ep.createdAt)}</span>
        </div>
      </div>
    `).join('');
  }

  // Section 4: Model Performance
  function renderModelPerformance(models) {
    const el = document.getElementById('ic-model-perf');
    if (!el) return;
    if (models.length === 0) {
      el.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">No model execution statistics recorded yet.</div>';
      return;
    }
    el.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
        <thead>
          <tr style="text-align:left;color:var(--text-muted);border-bottom:1px solid var(--border-default);">
            <th style="padding:5px 6px;">Model</th>
            <th style="padding:5px 6px;">Tasks</th>
            <th style="padding:5px 6px;">Verified %</th>
            <th style="padding:5px 6px;">Avg Reward</th>
          </tr>
        </thead>
        <tbody>
          ${models.map((m) => `
            <tr style="border-bottom:1px solid var(--border-subtle);">
              <td class="mono" style="padding:5px 6px;">${escapeHtml(m.modelId)}</td>
              <td class="mono" style="padding:5px 6px;">${m.totalTasks} (${m.verifiedSuccesses}✓/${m.failures}✗)</td>
              <td class="mono" style="padding:5px 6px;color:var(--accent-cyan);">${m.verifiedRate}%</td>
              <td class="mono" style="padding:5px 6px;">${m.avgReward >= 0 ? '+' : ''}${Number(m.avgReward).toFixed(3)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  // Section 5: Tool Performance
  function renderToolPerformance(tools) {
    const el = document.getElementById('ic-tool-perf');
    if (!el) return;
    if (tools.length === 0) {
      el.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">No tool execution telemetry recorded yet.</div>';
      return;
    }
    el.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
        <thead>
          <tr style="text-align:left;color:var(--text-muted);border-bottom:1px solid var(--border-default);">
            <th style="padding:5px 6px;">Tool</th>
            <th style="padding:5px 6px;">Calls</th>
            <th style="padding:5px 6px;">Success %</th>
            <th style="padding:5px 6px;">Avg Latency</th>
          </tr>
        </thead>
        <tbody>
          ${tools.slice(0, 15).map((t) => `
            <tr style="border-bottom:1px solid var(--border-subtle);">
              <td class="mono" style="padding:5px 6px;">${escapeHtml(t.toolName)}</td>
              <td class="mono" style="padding:5px 6px;">${t.calls}</td>
              <td class="mono" style="padding:5px 6px;color:${t.successRate >= 80 ? 'var(--color-success)' : 'var(--color-warning)'};">${t.successRate}%</td>
              <td class="mono" style="padding:5px 6px;">${t.avgLatencyMs} ms</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  // Section 6: Strategy Performance (Contextual Bandit Arms)
  function renderStrategyPerformance(arms) {
    const el = document.getElementById('ic-strategy-perf');
    if (!el) return;
    if (arms.length === 0) {
      el.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">No bandit arm pulls recorded yet. Strategy arms populate automatically as tasks are evaluated.</div>';
      return;
    }
    el.innerHTML = `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
          <thead>
            <tr style="text-align:left;color:var(--text-muted);border-bottom:1px solid var(--border-default);">
              <th style="padding:5px 6px;">Strategy &amp; Context</th>
              <th style="padding:5px 6px;">Pulls</th>
              <th style="padding:5px 6px;">Success %</th>
              <th style="padding:5px 6px;">Mean Reward</th>
              <th style="padding:5px 6px;">Beta (α/β)</th>
            </tr>
          </thead>
          <tbody>
            ${arms.slice(0, 20).map((a) => `
              <tr style="border-bottom:1px solid var(--border-subtle);">
                <td style="padding:5px 6px;">
                  <div class="mono" style="font-weight:500;">${escapeHtml(a.strategyId)}</div>
                  <div class="mono" style="font-size:10px;color:var(--text-muted);">${escapeHtml(a.contextKey)}</div>
                </td>
                <td class="mono" style="padding:5px 6px;">${a.pulls}</td>
                <td class="mono" style="padding:5px 6px;">${a.successRate}%</td>
                <td class="mono" style="padding:5px 6px;color:${a.meanReward >= 0 ? 'var(--color-success)' : 'var(--color-error)'};">${a.meanReward >= 0 ? '+' : ''}${Number(a.meanReward).toFixed(3)}</td>
                <td class="mono" style="padding:5px 6px;color:var(--text-muted);">${Number(a.alpha).toFixed(1)} / ${Number(a.beta).toFixed(1)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Section 7: Evaluation Results
  function renderEvaluationResults(evals) {
    const el = document.getElementById('ic-evaluations-list');
    if (!el) return;
    if (evals.length === 0) {
      el.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">No trusted evaluations recorded yet.</div>';
      return;
    }
    el.innerHTML = evals.slice(0, 12).map((ev) => `
      <div style="padding:8px 0;border-bottom:1px solid var(--border-subtle);font-size:11.5px;">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="badge ${ev.status === 'COMPLETED' ? 'badge-success' : ev.status === 'FAILED' ? 'badge-error' : 'badge-warning'}">${escapeHtml(ev.status)}</span>
            <span class="mono" style="font-weight:600;">Reward ${ev.reward >= 0 ? '+' : ''}${Number(ev.reward).toFixed(3)}</span>
            <span class="mono" style="font-size:10px;color:var(--text-muted);">v${escapeHtml(ev.rewardVersion || '1.0.0')}</span>
          </div>
          <span style="font-size:10.5px;color:var(--text-muted);">${formatRelativeTime(ev.createdAt)}</span>
        </div>
        <div style="color:var(--text-secondary);margin-top:4px;">${escapeHtml(ev.explanation || '')}</div>
      </div>
    `).join('');
  }

  // Section 8: Policy Versions & Offline Evaluation
  function renderPolicyVersions(versions, lastOfflineEval) {
    const el = document.getElementById('ic-policy-versions');
    const evalBanner = document.getElementById('ic-offline-eval-result');
    if (evalBanner) {
      if (lastOfflineEval) {
        evalBanner.innerHTML = `
          <div style="padding:8px 10px;border-radius:var(--radius-sm);background:var(--bg-secondary);border:1px solid ${lastOfflineEval.approved ? 'rgba(34,197,94,0.35)' : 'rgba(245,158,11,0.35)'};font-size:11.5px;margin-bottom:10px;">
            <div class="flex items-center justify-between">
              <strong>Offline Benchmark (${lastOfflineEval.sampleSize} scenarios)</strong>
              <span class="badge ${lastOfflineEval.approved ? 'badge-success' : 'badge-warning'}">${lastOfflineEval.approved ? 'APPROVED' : 'HELD'}</span>
            </div>
            <div class="mono" style="margin-top:4px;color:var(--text-secondary);">
              Baseline Reward: ${lastOfflineEval.baselineMeanReward} → Learned: ${lastOfflineEval.candidateMeanReward} (Δ ${lastOfflineEval.rewardDelta >= 0 ? '+' : ''}${lastOfflineEval.rewardDelta}) • Shifts: ${lastOfflineEval.strategyShiftCount}
            </div>
            <div style="margin-top:3px;color:var(--text-muted);">${escapeHtml(lastOfflineEval.reason || '')}</div>
          </div>
        `;
      } else {
        evalBanner.innerHTML = '';
      }
    }

    if (!el) return;
    if (versions.length === 0) {
      el.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">No policy snapshots stored yet.</div>';
      return;
    }
    el.innerHTML = versions.slice(0, 10).map((v) => `
      <div class="flex items-center justify-between gap-2" style="padding:7px 0;border-bottom:1px solid var(--border-subtle);font-size:11.5px;">
        <div class="truncate">
          <div class="flex items-center gap-2">
            <span class="mono" style="font-weight:600;">${escapeHtml(v.versionId)}</span>
            ${v.isActive ? '<span class="badge badge-success">ACTIVE</span>' : ''}
            <span class="badge">${escapeHtml(v.algorithm)}</span>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${escapeHtml(v.notes || '')} (score=${Number(v.benchmarkScore).toFixed(3)})</div>
        </div>
        ${v.isActive ? '' : `<button class="btn btn-xs" onclick="MaxIntelligenceCenter.rollbackPolicy('${escapeHtml(v.versionId)}')">Rollback</button>`}
      </div>
    `).join('');
  }

  function renderRollbackHistory(rollbacks) {
    const el = document.getElementById('ic-rollback-history');
    if (!el) return;
    if (rollbacks.length === 0) {
      el.innerHTML = '<div style="font-size:11.5px;color:var(--text-muted);">No policy rollbacks recorded yet.</div>';
      return;
    }
    el.innerHTML = rollbacks.slice(0, 10).map((rb) => `
      <div style="padding:5px 0;border-bottom:1px solid var(--border-subtle);font-size:11px;">
        <div class="flex items-center justify-between gap-2">
          <span class="mono">${escapeHtml(rb.fromVersion)} → <strong style="color:var(--accent-cyan);">${escapeHtml(rb.toVersion)}</strong></span>
          <span style="color:var(--text-muted);">${formatRelativeTime(rb.createdAt)}</span>
        </div>
        <div style="color:var(--text-muted);margin-top:2px;">${escapeHtml(rb.reason || '')}</div>
      </div>
    `).join('');
  }

  function renderValidationAnalytics(data) {
    const runs = data.validationRuns || [];
    const failed = data.failedLearningExperiments || [];
    const dist = data.strategyDistribution || [];

    // 1. Strategy Selection Distribution
    const distEl = document.getElementById('ic-strategy-dist');
    if (distEl) {
      if (dist.length === 0) {
        distEl.innerHTML = '<div style="font-size:11.5px;color:var(--text-muted);">No live strategy pulls recorded yet.</div>';
      } else {
        distEl.innerHTML = dist.slice(0, 8).map((d) => `
          <div style="margin-bottom:6px;">
            <div class="flex items-center justify-between mono" style="font-size:11px;margin-bottom:2px;">
              <span class="truncate">${escapeHtml(d.strategyId)}</span>
              <span>${d.pulls} pulls (${d.sharePct.toFixed(1)}%) • ${d.verifiedSuccessRate.toFixed(1)}% ok</span>
            </div>
            <div style="height:5px;background:var(--bg-secondary);border-radius:99px;overflow:hidden;">
              <div style="height:100%;width:${Math.max(4, Math.min(100, d.sharePct))}%;background:var(--accent-primary);"></div>
            </div>
          </div>
        `).join('');
      }
    }

    // 1b. Mission 9 Live Intent & Feasibility & Memory Quality Telemetry
    const intentEl = document.getElementById('ic-intent-distribution');
    if (intentEl && data.intentStats) {
      const entries = Object.entries(data.intentStats);
      intentEl.innerHTML = entries.length === 0
        ? '<div style="font-size:11.5px;color:var(--text-muted);">No task intents routed yet.</div>'
        : entries.map(([intent, cnt]) => `<span class="badge" style="margin:2px 4px 2px 0;"><strong>${escapeHtml(intent)}</strong>: ${cnt}</span>`).join('');
    }

    const feasEl = document.getElementById('ic-feasibility-stats');
    if (feasEl && data.feasibilityStats) {
      const f = data.feasibilityStats;
      feasEl.innerHTML = `
        <div class="mono" style="font-size:11px;color:var(--text-secondary);">
          Plans: <strong>${f.totalPlans}</strong> • Feasible Evaluated: <strong>${f.totalCandidatesEvaluated - f.totalFilteredOut}/${f.totalCandidatesEvaluated}</strong> • Filtered Out Infeasible: <strong style="color:var(--color-warning);">${f.totalFilteredOut}</strong> • Blocked: <strong style="color:${f.blockedCount > 0 ? 'var(--color-error)' : 'var(--color-success)'};">${f.blockedCount}</strong>
        </div>
      `;
    }

    const mqEl = document.getElementById('ic-memory-quality-metrics');
    if (mqEl && data.memoryQualityStats) {
      const q = data.memoryQualityStats;
      mqEl.innerHTML = `
        <div class="mono" style="font-size:11px;color:var(--text-secondary);line-height:1.5;">
          <div>Unique Episodes: <strong>${q.uniqueEpisodes}</strong> • Duplicate Writes Merged: <strong style="color:var(--accent-cyan);">${q.duplicatesPrevented}</strong></div>
          <div>Fresh (&le;30d): <strong>${q.freshCount30d}</strong> • Stale (&ge;90d): <strong>${q.staleCount90d}</strong> • Avg Recency Weight: <strong>${q.avgRecencyWeight}</strong></div>
        </div>
      `;
    }

    const ptrEl = document.getElementById('ic-post-task-reviews');
    if (ptrEl) {
      const reviews = data.postTaskReviews || [];
      ptrEl.innerHTML = reviews.length === 0
        ? '<div style="font-size:11.5px;color:var(--text-muted);">Self-improvement reviews record automatically after task completions.</div>'
        : reviews.slice(0, 6).map((r) => `
          <div style="padding:6px 0;border-bottom:1px solid var(--border-subtle);font-size:11px;">
            <div class="flex items-center justify-between">
              <span class="mono" style="font-weight:600;">${escapeHtml(r.strategyId)} (${escapeHtml(r.intent)})</span>
              <span class="badge ${r.requirementsMet ? 'badge-success' : 'badge-error'}">${r.requirementsMet ? 'MET' : 'UNMET'}</span>
            </div>
            <div style="color:var(--text-secondary);margin-top:2px;">${escapeHtml((r.improvements || []).slice(0, 2).join('; ') || 'Criteria met.')}</div>
          </div>
        `).join('');
    }

    // 2. Latest Benchmark 4-System Comparison + Learning Curves + Memory Effectiveness
    const latestFull = runs.find((r) => Array.isArray(r.summary?.systemComparison));
    const compEl = document.getElementById('ic-m8-comparison');
    const curveEl = document.getElementById('ic-m8-learning-curves');
    const memEffEl = document.getElementById('ic-memory-effectiveness');

    if (compEl) {
      if (!latestFull) {
        compEl.innerHTML = '<div style="font-size:11.5px;color:var(--text-muted);">Click <strong>Run 120-Scenario Benchmark</strong> to evaluate Systems A, B, C, D with 95% confidence intervals.</div>';
      } else {
        const rows = (latestFull.summary.systemComparison || []).map((s) => `
          <tr style="border-bottom:1px solid var(--border-subtle);">
            <td style="padding:5px 6px;">${escapeHtml(s.label)}</td>
            <td class="mono" style="padding:5px 6px;color:var(--accent-cyan);">${Number(s.metrics?.verifiedCompletionRate || 0).toFixed(1)}%</td>
            <td class="mono" style="padding:5px 6px;color:var(--text-muted);">[${s.completionCI95?.ci95Low}%, ${s.completionCI95?.ci95High}%]</td>
            <td class="mono" style="padding:5px 6px;">${Number(s.metrics?.meanReward || 0).toFixed(3)}</td>
          </tr>
        `).join('');
        compEl.innerHTML = `
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
              <thead>
                <tr style="text-align:left;color:var(--text-muted);border-bottom:1px solid var(--border-default);">
                  <th style="padding:4px 6px;">System (${escapeHtml(latestFull.benchmarkVersion)})</th>
                  <th style="padding:4px 6px;">Verified %</th>
                  <th style="padding:4px 6px;">95% CI</th>
                  <th style="padding:4px 6px;">Reward</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `;
      }
    }

    if (curveEl) {
      if (!latestFull || !Array.isArray(latestFull.summary?.learningCurves)) {
        curveEl.innerHTML = '';
      } else {
        curveEl.innerHTML = `
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Learning Curve (Holdout Verified Completion % by Experience Budget)</div>
          ${latestFull.summary.learningCurves.map((pt) => `
            <div style="margin-bottom:5px;">
              <div class="flex items-center justify-between mono" style="font-size:10.5px;">
                <span>Budget ${pt.budget} tasks</span>
                <span>Sys C: ${pt.systemC_completion?.mean}% • Sys D: ${pt.systemD_completion?.mean}% (CI [${pt.systemD_completion?.ci95Low}%, ${pt.systemD_completion?.ci95High}%])</span>
              </div>
              <div style="height:5px;background:var(--bg-secondary);border-radius:99px;overflow:hidden;">
                <div style="height:100%;width:${Math.max(4, Math.min(100, pt.systemD_completion?.mean || 0))}%;background:var(--accent-cyan);"></div>
              </div>
            </div>
          `).join('')}
        `;
      }
    }

    if (memEffEl) {
      if (latestFull && Array.isArray(latestFull.summary?.systemComparison)) {
        const sysC = latestFull.summary.systemComparison.find((s) => s.system === 'C_BANDIT_NO_MEM');
        const sysD = latestFull.summary.systemComparison.find((s) => s.system === 'D_BANDIT_WITH_MEM');
        const delta = sysC && sysD ? (sysD.metrics.verifiedCompletionRate - sysC.metrics.verifiedCompletionRate).toFixed(1) : '0.0';
        memEffEl.innerHTML = `
          <div class="mono" style="font-size:11px;color:var(--text-secondary);">
            Bandit w/o Memory (C): ${sysC?.metrics.verifiedCompletionRate ?? '—'}% • Bandit + Memory (D): ${sysD?.metrics.verifiedCompletionRate ?? '—'}% (Δ ${Number(delta) >= 0 ? '+' : ''}${delta}%)
            <span class="badge" style="margin-left:6px;">SIMULATED BENCHMARK</span>
          </div>
        `;
      } else {
        const ms = data.memoryStats || {};
        memEffEl.innerHTML = `<div class="mono" style="font-size:11px;color:var(--text-muted);">${ms.episodicCount || 0} live episodes stored (${ms.verifiedSuccessCount || 0} verified). Run 120-Scenario Benchmark to measure C vs D ablation delta.</div>`;
      }
    }

    // 3. Benchmark History (explicit 3-way separation: SIMULATED BENCHMARK vs CONTROLLED LIVE EXPERIMENT vs USER EXECUTION)
    const histEl = document.getElementById('ic-m8-benchmark-history');
    if (histEl) {
      if (runs.length === 0) {
        histEl.innerHTML = '<div style="font-size:11.5px;color:var(--text-muted);">No persisted benchmark runs yet.</div>';
      } else {
        histEl.innerHTML = runs.slice(0, 12).map((r) => {
          const badgeCls = r.source === 'CONTROLLED_LIVE_EXPERIMENT' ? 'badge-cyan' : r.source === 'USER_ENGINEERING_EXECUTION' ? 'badge-accent' : '';
          const badgeTxt = r.source === 'CONTROLLED_LIVE_EXPERIMENT' ? 'CONTROLLED LIVE EXPERIMENT' : r.source === 'USER_ENGINEERING_EXECUTION' ? 'USER EXECUTION' : 'SIMULATED BENCHMARK';
          return `
          <div style="padding:6px 0;border-bottom:1px solid var(--border-subtle);font-size:11px;">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1" style="flex-wrap:wrap;">
                <span class="badge ${badgeCls}">${badgeTxt}</span>
                <span class="badge ${r.approved ? 'badge-success' : 'badge-error'}">${r.approved ? 'APPROVED' : 'REJECTED'}</span>
                <span class="mono">${escapeHtml(r.benchmarkVersion)}</span>
              </div>
              <span style="color:var(--text-muted);">${formatRelativeTime(r.createdAt)}</span>
            </div>
            <div class="mono" style="color:var(--text-secondary);margin-top:3px;">
              Baseline ${r.baselineCompletionPct.toFixed(1)}% → Learned ${r.learnedCompletionPct.toFixed(1)}%${r.ci95Low !== null ? ` (95% CI [${r.ci95Low}%, ${r.ci95High}%])` : ''} • Reward ${r.baselineReward.toFixed(3)} → ${r.learnedReward.toFixed(3)}
            </div>
          </div>
        `;
        }).join('');
      }
    }

    // 4. Failed / Rejected Learning Experiments
    const failEl = document.getElementById('ic-failed-experiments');
    if (failEl) {
      if (failed.length === 0) {
        failEl.innerHTML = '<div style="font-size:11.5px;color:var(--text-muted);">No rejected or regressive learning experiments recorded.</div>';
      } else {
        failEl.innerHTML = failed.slice(0, 8).map((f) => `
          <div style="padding:5px 0;border-bottom:1px solid var(--border-subtle);font-size:11px;">
            <div class="flex items-center justify-between">
              <span class="badge badge-error">REJECTED</span>
              <span class="mono" style="color:var(--text-muted);">${escapeHtml(f.benchmarkVersion)} • ${formatRelativeTime(f.createdAt)}</span>
            </div>
            <div style="color:var(--text-secondary);margin-top:2px;">${escapeHtml(f.summary?.reason || `Baseline ${f.baselineCompletionPct}% vs Learned ${f.learnedCompletionPct}%`)}</div>
          </div>
        `).join('');
      }
    }
  }

  async function runMission8Benchmark() {
    const btn = document.getElementById('btn-run-m8-bench');
    if (btn) { btn.disabled = true; btn.textContent = 'Running 120 Scenarios...'; }
    try {
      toast('Running deterministic 120-scenario Mission 8 benchmark...', 'info', 2500);
      const res = await api.post('/api/intelligence-center/run-mission8-benchmark', { exploitOnHoldout: true });
      toast(res.approved ? `Benchmark passed & recorded (${res.reason})` : `Benchmark held: ${res.reason}`, res.approved ? 'success' : 'warning');
      refreshDashboard();
    } catch (err) {
      toast(`Benchmark failed: ${err.message}`, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Run 120-Scenario Benchmark'; }
    }
  }

  // Sections 9 & 10: User Preferences & Privacy / Learning Controls
  function renderPreferencesAndGovernance(data) {
    const algoSel = document.getElementById('ic-bandit-algo-select');
    if (algoSel) algoSel.value = data.banditAlgorithm || 'UCB1';

    const learnChk = document.getElementById('ic-toggle-learning');
    if (learnChk) learnChk.checked = Boolean(data.governance?.learningEnabled);

    const crossChk = document.getElementById('ic-toggle-cross-project');
    if (crossChk) crossChk.checked = Boolean(data.governance?.allowCrossProjectProceduralTransfer);

    const weightsEl = document.getElementById('ic-reward-weights-view');
    if (weightsEl && data.rewardWeights) {
      const w = data.rewardWeights;
      weightsEl.innerHTML = `
        <div class="mono" style="font-size:11px;color:var(--text-secondary);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 12px;">
          <span>Req Coverage: +${w.requirementCoverage}</span>
          <span>Test Success: +${w.testSuccess}</span>
          <span>Build Success: +${w.buildSuccess}</span>
          <span>User Accept: +${w.userAcceptance}</span>
          <span>False Claim: ${w.falseCompletionPenalty}</span>
          <span>Security Violation: ${w.securityViolationPenalty}</span>
        </div>
      `;
    }
  }

  async function submitFeedback(episodeId, rating) {
    try {
      await api.post('/api/intelligence-center/feedback', { episodeId, rating });
      toast(rating > 0 ? 'Positive feedback recorded into Experience Memory & Bandit.' : 'Negative feedback recorded — strategy weight adjusted.', 'success');
      refreshDashboard();
    } catch (err) {
      toast(`Feedback error: ${err.message}`, 'error');
    }
  }

  async function runOfflineEval() {
    try {
      toast('Running deterministic offline policy evaluation...', 'info', 1600);
      const res = await api.post('/api/intelligence-center/offline-eval', { promoteIfApproved: true });
      if (res.report) {
        toast(res.report.approved ? `Policy promoted (Δ reward ${res.report.rewardDelta >= 0 ? '+' : ''}${res.report.rewardDelta})` : res.report.reason, res.report.approved ? 'success' : 'warning');
      }
      refreshDashboard();
    } catch (err) {
      toast(`Offline eval failed: ${err.message}`, 'error');
    }
  }

  async function rollbackPolicy(versionId) {
    const ok = await confirmDialog('Rollback Policy Version', `Restore bandit strategy statistics and algorithm to ${versionId}?`);
    if (!ok) return;
    try {
      await api.post('/api/intelligence-center/policy/rollback', { versionId });
      toast(`Rolled back active policy to ${versionId}`, 'success');
      refreshDashboard();
    } catch (err) {
      toast(`Rollback failed: ${err.message}`, 'error');
    }
  }

  async function setBanditAlgorithm(algo) {
    try {
      await api.post('/api/intelligence-center/policy/algorithm', { algorithm: algo });
      toast(`Contextual Bandit algorithm switched to ${algo}`, 'success');
      refreshDashboard();
    } catch (err) {
      toast(`Algorithm update failed: ${err.message}`, 'error');
    }
  }

  async function updateGovernance() {
    const learningEnabled = Boolean(document.getElementById('ic-toggle-learning')?.checked);
    const allowCrossProjectProceduralTransfer = Boolean(document.getElementById('ic-toggle-cross-project')?.checked);
    try {
      await api.post('/api/intelligence-center/governance', { learningEnabled, allowCrossProjectProceduralTransfer });
      toast(`Governance updated: Adaptive Learning ${learningEnabled ? 'ENABLED' : 'PAUSED'}`, 'success');
      refreshDashboard();
    } catch (err) {
      toast(`Governance update failed: ${err.message}`, 'error');
    }
  }

  async function deleteMemoryRecord(table, id) {
    try {
      await api.del(`/api/intelligence-center/memory/${encodeURIComponent(table)}/${encodeURIComponent(id)}`);
      toast('Memory record deleted.', 'info');
      refreshDashboard();
    } catch (err) {
      toast(`Delete failed: ${err.message}`, 'error');
    }
  }

  async function editSemanticPrompt(id, currentVal) {
    const next = window.prompt('Edit semantic memory entry (secrets are automatically scrubbed):', currentVal);
    if (next === null) return;
    try {
      await api.put(`/api/intelligence-center/memory/semantic/${encodeURIComponent(id)}`, { value: next });
      toast('Semantic memory updated.', 'success');
      refreshDashboard();
    } catch (err) {
      toast(`Edit failed: ${err.message}`, 'error');
    }
  }

  async function clearAllMemory() {
    const ok = await confirmDialog('Clear Experience Memory', 'Delete all stored episodes, evaluations, and bandit statistics? Policy snapshots remain for audit.');
    if (!ok) return;
    try {
      await api.post('/api/intelligence-center/memory/clear', { scope: scopeFilter });
      toast('Experience memory cleared.', 'warning');
      refreshDashboard();
    } catch (err) {
      toast(`Clear failed: ${err.message}`, 'error');
    }
  }

  async function exportMemoryBackup() {
    try {
      const backup = await api.get('/api/intelligence-center/memory/export');
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `maxide-apex-intelligence-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Sanitized intelligence backup exported.', 'success');
    } catch (err) {
      toast(`Export failed: ${err.message}`, 'error');
    }
  }

  // Section 13: Outcome Quality & Acceptance Engine (Mission 10)
  function renderOutcomeQuality(data) {
    const scEl = document.getElementById('ic-outcome-scorecard');
    const rdEl = document.getElementById('ic-outcome-repair-directives');
    const outcome = data.lastOutcomeAcceptance;

    if (scEl) {
      if (!outcome) {
        scEl.innerHTML = '<div style="font-size:11.5px;color:var(--text-muted);">No outcome evaluations recorded yet. Run an autonomous task or click "Run 12-Criterion Benchmark".</div>';
      } else {
        const sc = outcome.scorecard || {};
        const statusBadge = outcome.status === 'COMPLETED'
          ? '<span class="badge badge-success">COMPLETED (100% Verified)</span>'
          : outcome.status === 'PARTIALLY_COMPLETED'
          ? '<span class="badge badge-warning">PARTIALLY COMPLETED</span>'
          : outcome.status === 'BLOCKED'
          ? '<span class="badge badge-error">BLOCKED</span>'
          : '<span class="badge badge-error">FAILED</span>';

        scEl.innerHTML = `
          <div style="padding:10px 12px;background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);font-size:12px;">
            <div class="flex items-center justify-between" style="margin-bottom:8px;">
              <span><strong>Status:</strong> ${statusBadge}</span>
              <span class="mono" style="font-weight:700;color:var(--accent-primary);">Quality Score: ${Math.round((sc.compositeQualityScore || 0) * 100)}%</span>
            </div>
            <div class="grid grid-cols-2 gap-2 mono" style="font-size:11px;color:var(--text-secondary);">
              <div>Req Coverage: <strong>${Math.round((sc.requirementCoverage || 0) * 100)}%</strong></div>
              <div>Functional: <strong>${Math.round((sc.functionalCompleteness || 0) * 100)}%</strong></div>
              <div>Visual: <strong>${Math.round((sc.visualCompleteness || 0) * 100)}%</strong></div>
              <div>Runtime Stability: <strong>${Math.round((sc.runtimeStability || 0) * 100)}%</strong></div>
            </div>
            ${outcome.rejectionReason ? `<div style="margin-top:6px;color:var(--color-warning);font-size:11px;"><em>${escapeHtml(outcome.rejectionReason)}</em></div>` : ''}
          </div>
        `;
      }
    }

    if (rdEl) {
      if (!outcome || !outcome.repairDirectives || outcome.repairDirectives.length === 0) {
        rdEl.innerHTML = '<div style="color:var(--text-muted);">Zero active repair directives. All outcome criteria satisfied.</div>';
      } else {
        rdEl.innerHTML = outcome.repairDirectives.map((d) => `
          <div style="padding:3px 0;color:var(--color-warning);">• ${escapeHtml(d)}</div>
        `).join('');
      }
    }
  }

  async function runCafeBenchmark() {
    const btn = document.getElementById('ic-btn-run-cafe-benchmark');
    const resEl = document.getElementById('ic-cafe-benchmark-results');
    const thumbsEl = document.getElementById('ic-outcome-visual-thumbnails');
    if (btn) btn.disabled = true;
    if (resEl) resEl.innerHTML = '<div style="font-size:11.5px;color:var(--accent-primary);">Executing 12-criterion Playwright benchmark against local server...</div>';

    try {
      const res = await api.post('/api/intelligence-center/run-cafe-benchmark', {});
      if (resEl) {
        const badge = res.success
          ? '<span class="badge badge-success">100% PASS (12/12)</span>'
          : `<span class="badge badge-warning">${res.passedCount}/${res.totalCount} PASSED</span>`;

        resEl.innerHTML = `
          <div style="margin-bottom:8px;" class="flex items-center justify-between">
            <span><strong>Result:</strong> ${badge}</span>
            <span class="mono" style="font-size:11px;color:var(--text-muted);">${res.totalDurationMs} ms</span>
          </div>
          <div style="max-height:160px;overflow-y:auto;font-size:11px;">
            ${(res.results || []).map((r) => `
              <div style="padding:3px 0;border-bottom:1px solid var(--border-subtle);" class="flex items-center justify-between">
                <span>[${r.passed ? '✓' : '✗'}] ${escapeHtml(r.name)}</span>
                <span class="mono" style="color:${r.passed ? 'var(--color-success)' : 'var(--color-error)'};">${r.passed ? 'PASS' : 'FAIL'}</span>
              </div>
            `).join('')}
          </div>
        `;
      }

      if (thumbsEl && (res.desktopScreenshot || res.mobileScreenshot)) {
        thumbsEl.innerHTML = `
          <div style="font-size:11px;color:var(--text-secondary);line-height:1.4;">
            <div>🖥️ <strong>Desktop (1280x800):</strong> <span class="mono">${escapeHtml(res.desktopScreenshot || '')}</span></div>
            <div>📱 <strong>Mobile (390x844):</strong> <span class="mono">${escapeHtml(res.mobileScreenshot || '')}</span></div>
          </div>
        `;
      }
      toast(`Cafe Benchmark: ${res.passedCount}/${res.totalCount} passed.`, res.success ? 'success' : 'warning');
      refreshDashboard();
    } catch (err) {
      if (resEl) resEl.innerHTML = `<div style="color:var(--color-error);font-size:11.5px;">Benchmark error: ${escapeHtml(err.message)}</div>`;
      toast(`Benchmark failed: ${err.message}`, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  return {
    switchSubTab,
    setMemoryTab,
    setScope,
    refreshDashboard,
    runPlanPreview,
    renderExperienceMemory,
    submitFeedback,
    runOfflineEval,
    runMission8Benchmark,
    runCafeBenchmark,
    rollbackPolicy,
    setBanditAlgorithm,
    updateGovernance,
    deleteMemoryRecord,
    editSemanticPrompt,
    clearAllMemory,
    exportMemoryBackup,
  };
})();
