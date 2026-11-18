/**
 * MaxIDE APEX — Mission 7: Persistent Experience Memory Engine (Module B)
 * Real SQLite 3 storage (via MIT-licensed sql.js WASM) storing:
 * - EPISODIC MEMORY: tasks, outcomes, failures, repairs, user feedback, verification results
 * - SEMANTIC MEMORY: project architecture, frameworks, conventions, decisions, dependencies
 * - PROCEDURAL MEMORY: verified strategies, debugging workflows, tool/model selection procedures
 *
 * Features: atomic disk persistence, token-similarity retrieval, strict project isolation,
 * schema versioning, user edit/delete/clear/export, and mandatory secret sanitization.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { PolicyGovernance } from './PolicyGovernance.js';

const _require = createRequire(import.meta.url);
const initSqlJs: any = _require('sql.js');

export type EvidenceSource =
  | 'SIMULATED_BENCHMARK'
  | 'CONTROLLED_LIVE_EXPERIMENT'
  | 'USER_ENGINEERING_EXECUTION';

export type MemoryConfidenceTier =
  | 'FULLY_VERIFIED'
  | 'PARTIALLY_VERIFIED'
  | 'UNVERIFIED'
  | 'USER_REJECTED'
  | 'SUPERSEDED';

export interface RecencyDecayConfig {
  halfLifeDays: number;
  minRecencyFloor: number;
}

export const DEFAULT_RECENCY_DECAY: RecencyDecayConfig = {
  halfLifeDays: 45,
  minRecencyFloor: 0.25,
};

export const CONFIDENCE_TIER_WEIGHTS: Record<MemoryConfidenceTier, number> = {
  FULLY_VERIFIED: 1.0,
  PARTIALLY_VERIFIED: 0.7,
  UNVERIFIED: 0.35,
  USER_REJECTED: 0.15,
  SUPERSEDED: 0.2,
};

export interface EpisodicRecord {
  id: string;
  projectId: string;
  taskCategory: string;
  platform: string;
  prompt: string;
  strategyId: string;
  modelId: string;
  status: 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'FAILED' | 'BLOCKED' | 'CANCELLED';
  verified: boolean;
  reward: number;
  durationMs: number;
  filesChanged: string[];
  toolFailures: string[];
  testPassed: boolean;
  userFeedbackRating?: number; // -1, 0, +1
  summary: string;
  version: number;
  createdAt: string;
  fingerprint?: string;
  repeatCount?: number;
  confidenceTier?: MemoryConfidenceTier;
  evidenceSource?: EvidenceSource;
  deduplicated?: boolean;
}

export interface SemanticRecord {
  id: string;
  projectId: string;
  category: 'architecture' | 'framework' | 'dependency' | 'decision' | 'convention' | 'knowledge';
  key: string;
  value: string;
  version: number;
  updatedAt: string;
}

export interface ProceduralRecord {
  id: string;
  projectId: string; // 'global' or project-specific id
  taskCategory: string;
  strategyId: string;
  procedureName: string;
  steps: string[];
  modelId?: string;
  successCount: number;
  failureCount: number;
  avgReward: number;
  version: number;
  updatedAt: string;
}

export interface SimilarExperienceMatch {
  episode: EpisodicRecord;
  similarity: number;
  recencyWeight?: number;
  confidenceWeight?: number;
  effectiveWeight?: number;
  ageDays?: number;
}

export class ExperienceMemory {
  private dbPath: string;
  private db: any = null;
  private readyPromise: Promise<void>;
  private flushSeq: number = 0;
  private recencyConfig: RecencyDecayConfig = { ...DEFAULT_RECENCY_DECAY };

  constructor(dbPath: string, recencyConfig?: Partial<RecencyDecayConfig>) {
    this.dbPath = path.resolve(dbPath);
    if (recencyConfig) this.recencyConfig = { ...DEFAULT_RECENCY_DECAY, ...recencyConfig };
    this.readyPromise = this.initialize();
  }

  public getRecencyConfig(): RecencyDecayConfig {
    return { ...this.recencyConfig };
  }

  public setRecencyConfig(cfg: Partial<RecencyDecayConfig>): RecencyDecayConfig {
    if (cfg.halfLifeDays !== undefined) this.recencyConfig.halfLifeDays = Math.max(1, cfg.halfLifeDays);
    if (cfg.minRecencyFloor !== undefined) this.recencyConfig.minRecencyFloor = Math.max(0.05, Math.min(1.0, cfg.minRecencyFloor));
    return this.getRecencyConfig();
  }

  public async ready(): Promise<void> {
    await this.readyPromise;
  }

  public getDbPath(): string {
    return this.dbPath;
  }

  public getDb(): any {
    if (!this.db) throw new Error('ExperienceMemory SQLite database not initialized. Call await ready() first.');
    return this.db;
  }

  private async initialize(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const wasmDir = path.dirname(_require.resolve('sql.js/dist/sql-wasm.wasm'));
    const SQL = await initSqlJs({
      locateFile: (file: string) => path.join(wasmDir, file),
    });

    if (fs.existsSync(this.dbPath)) {
      try {
        const buf = fs.readFileSync(this.dbPath);
        if (buf.length < 16 || !buf.subarray(0, 16).toString('utf8').startsWith('SQLite format 3')) {
          throw new Error('Invalid SQLite file magic header');
        }
        this.db = new SQL.Database(new Uint8Array(buf));
        // Force immediate integrity verification so sql.js surfaces corrupt pages inside catch
        this.db.exec('PRAGMA quick_check;');
      } catch {
        // Quarantine corrupt DB and start fresh cleanly
        try {
          fs.renameSync(this.dbPath, `${this.dbPath}.corrupt.${Date.now()}`);
        } catch {}
        this.db = new SQL.Database();
      }
    } else {
      this.db = new SQL.Database();
    }

    this.createSchema();
    this.flush();
  }

  private createSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS episodic_memory (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        task_category TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT 'WEB_APP',
        prompt TEXT NOT NULL,
        strategy_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        status TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0,
        reward REAL NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        files_changed_json TEXT NOT NULL DEFAULT '[]',
        tool_failures_json TEXT NOT NULL DEFAULT '[]',
        test_passed INTEGER NOT NULL DEFAULT 0,
        user_feedback_rating INTEGER,
        summary TEXT NOT NULL DEFAULT '',
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_episodic_project ON episodic_memory(project_id);
      CREATE INDEX IF NOT EXISTS idx_episodic_category ON episodic_memory(task_category);
      CREATE INDEX IF NOT EXISTS idx_episodic_strategy ON episodic_memory(strategy_id);

      CREATE TABLE IF NOT EXISTS semantic_memory (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, category, key)
      );

      CREATE INDEX IF NOT EXISTS idx_semantic_project ON semantic_memory(project_id);

      CREATE TABLE IF NOT EXISTS procedural_memory (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        task_category TEXT NOT NULL,
        strategy_id TEXT NOT NULL,
        procedure_name TEXT NOT NULL,
        steps_json TEXT NOT NULL DEFAULT '[]',
        model_id TEXT,
        success_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0,
        avg_reward REAL NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, task_category, strategy_id)
      );

      CREATE TABLE IF NOT EXISTS user_feedback (
        id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        rating INTEGER NOT NULL,
        comment TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bandit_arms (
        context_key TEXT NOT NULL,
        strategy_id TEXT NOT NULL,
        pulls INTEGER NOT NULL DEFAULT 0,
        total_reward REAL NOT NULL DEFAULT 0,
        sum_sq_reward REAL NOT NULL DEFAULT 0,
        alpha REAL NOT NULL DEFAULT 1.0,
        beta REAL NOT NULL DEFAULT 1.0,
        successes INTEGER NOT NULL DEFAULT 0,
        failures INTEGER NOT NULL DEFAULT 0,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        last_updated TEXT NOT NULL,
        PRIMARY KEY (context_key, strategy_id)
      );

      CREATE TABLE IF NOT EXISTS policy_versions (
        version_id TEXT PRIMARY KEY,
        algorithm TEXT NOT NULL,
        exploration_c REAL NOT NULL,
        reward_weights_json TEXT NOT NULL,
        arms_snapshot_json TEXT NOT NULL,
        benchmark_score REAL NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS evaluations (
        id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL,
        reward REAL NOT NULL,
        scores_json TEXT NOT NULL,
        explanation TEXT NOT NULL,
        reward_version TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tool_telemetry (
        tool_name TEXT PRIMARY KEY,
        calls INTEGER NOT NULL DEFAULT 0,
        successes INTEGER NOT NULL DEFAULT 0,
        failures INTEGER NOT NULL DEFAULT 0,
        avg_latency_ms REAL NOT NULL DEFAULT 0,
        last_updated TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS governance_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS validation_runs (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        benchmark_version TEXT NOT NULL,
        algorithm TEXT NOT NULL,
        approved INTEGER NOT NULL DEFAULT 0,
        baseline_completion_pct REAL NOT NULL DEFAULT 0,
        learned_completion_pct REAL NOT NULL DEFAULT 0,
        baseline_reward REAL NOT NULL DEFAULT 0,
        learned_reward REAL NOT NULL DEFAULT 0,
        ci95_low REAL,
        ci95_high REAL,
        summary_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS policy_rollbacks (
        id TEXT PRIMARY KEY,
        from_version TEXT NOT NULL,
        to_version TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS post_task_reviews (
        id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        strategy_id TEXT NOT NULL,
        intent TEXT NOT NULL,
        evidence_source TEXT NOT NULL DEFAULT 'USER_ENGINEERING_EXECUTION',
        requirements_met INTEGER NOT NULL DEFAULT 0,
        unnecessary_changes_json TEXT NOT NULL DEFAULT '[]',
        failed_approaches_json TEXT NOT NULL DEFAULT '[]',
        improvements_json TEXT NOT NULL DEFAULT '[]',
        offline_eval_scheduled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);

    // Backward-compatible Mission 9 schema migrations for existing SQLite files
    const migrations = [
      `ALTER TABLE episodic_memory ADD COLUMN fingerprint TEXT`,
      `ALTER TABLE episodic_memory ADD COLUMN repeat_count INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE episodic_memory ADD COLUMN confidence_tier TEXT NOT NULL DEFAULT 'UNVERIFIED'`,
      `ALTER TABLE episodic_memory ADD COLUMN evidence_source TEXT NOT NULL DEFAULT 'USER_ENGINEERING_EXECUTION'`,
    ];
    for (const sql of migrations) {
      try { this.db.run(sql); } catch {}
    }
    try { this.db.run(`CREATE INDEX IF NOT EXISTS idx_episodic_fingerprint ON episodic_memory(fingerprint)`); } catch {}
  }

  /**
   * Atomically flush in-memory SQLite database to disk with monotonic sequence number.
   */
  public flush(): void {
    if (!this.db) return;
    const data: Uint8Array = this.db.export();
    this.flushSeq++;
    const tmp = `${this.dbPath}.tmp.${process.pid}.${Date.now()}.${this.flushSeq}`;
    fs.writeFileSync(tmp, Buffer.from(data));
    try {
      fs.renameSync(tmp, this.dbPath);
    } catch {
      // Windows fallback when target file handle is briefly locked by AV/indexer
      fs.copyFileSync(tmp, this.dbPath);
      try { fs.unlinkSync(tmp); } catch {}
    }
  }

  public queryAll(sql: string, params: any[] = []): Record<string, any>[] {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const rows: Record<string, any>[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  public execute(sql: string, params: any[] = [], autoFlush: boolean = true): void {
    this.db.run(sql, params);
    if (autoFlush) this.flush();
  }

  public static computeEpisodeFingerprint(input: {
    projectId: string;
    taskCategory: string;
    prompt: string;
    strategyId: string;
    status: string;
    filesChanged?: string[];
  }): string {
    const normPrompt = String(input.prompt || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .slice(0, 240);
    const normFiles = [...(input.filesChanged || [])]
      .map((f) => String(f).trim().toLowerCase())
      .sort()
      .join(',');
    const payload = [
      input.projectId.toLowerCase().trim(),
      input.taskCategory.toUpperCase().trim(),
      normPrompt,
      input.strategyId.toLowerCase().trim(),
      input.status.toUpperCase().trim(),
      normFiles,
    ].join('|');
    return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 24);
  }

  public static classifyConfidenceTier(params: {
    verified: boolean;
    status: EpisodicRecord['status'];
    userFeedbackRating?: number;
    superseded?: boolean;
  }): MemoryConfidenceTier {
    if (params.superseded) return 'SUPERSEDED';
    if (params.userFeedbackRating === -1) return 'USER_REJECTED';
    if (params.verified && params.status === 'COMPLETED') return 'FULLY_VERIFIED';
    if (params.verified && params.status === 'PARTIALLY_COMPLETED') return 'PARTIALLY_VERIFIED';
    return 'UNVERIFIED';
  }

  // =========================================================================
  // EPISODIC MEMORY (WITH FINGERPRINT DEDUPLICATION & CONFIDENCE TIERS)
  // =========================================================================
  public recordEpisode(
    input: Omit<EpisodicRecord, 'id' | 'version' | 'createdAt'> & { id?: string; disableDeduplication?: boolean }
  ): EpisodicRecord {
    const createdAt = new Date().toISOString();
    const safePrompt = PolicyGovernance.sanitizeSecretText(input.prompt);
    const safeSummary = PolicyGovernance.sanitizeSecretText(input.summary);
    const safeFiles = (input.filesChanged || []).map((f) => PolicyGovernance.sanitizeSecretText(f));
    const safeFailures = (input.toolFailures || []).map((f) => PolicyGovernance.sanitizeSecretText(f));

    // Only allow verified=true when status is COMPLETED or PARTIALLY_COMPLETED
    const verified = Boolean(input.verified && (input.status === 'COMPLETED' || input.status === 'PARTIALLY_COMPLETED'));
    const confidenceTier =
      input.confidenceTier ||
      ExperienceMemory.classifyConfidenceTier({
        verified,
        status: input.status,
        userFeedbackRating: input.userFeedbackRating,
      });
    const evidenceSource: EvidenceSource = input.evidenceSource || 'USER_ENGINEERING_EXECUTION';
    const fingerprint =
      input.fingerprint ||
      ExperienceMemory.computeEpisodeFingerprint({
        projectId: input.projectId,
        taskCategory: input.taskCategory,
        prompt: safePrompt,
        strategyId: input.strategyId,
        status: input.status,
        filesChanged: safeFiles,
      });

    // Safe duplicate merging when no explicit unique ID collision override is forced
    if (!input.disableDeduplication) {
      const existing = this.queryAll(
        `SELECT * FROM episodic_memory WHERE fingerprint = ? AND project_id = ? LIMIT 1`,
        [fingerprint, input.projectId]
      )[0];
      if (existing && (!input.id || input.id === existing.id)) {
        const prevRepeat = Number(existing.repeat_count || 1);
        const nextRepeat = prevRepeat + 1;
        const prevReward = Number(existing.reward || 0);
        const mergedReward = Math.round(((prevReward * prevRepeat + input.reward) / nextRepeat) * 10000) / 10000;
        const prevDur = Number(existing.duration_ms || 0);
        const mergedDur = Math.max(0, Math.round((prevDur * prevRepeat + (input.durationMs || 0)) / nextRepeat));
        const nextVer = Number(existing.version || 1) + 1;

        this.execute(
          `UPDATE episodic_memory
           SET reward = ?, duration_ms = ?, repeat_count = ?, version = ?, confidence_tier = ?, summary = ?, created_at = ?
           WHERE id = ?`,
          [mergedReward, mergedDur, nextRepeat, nextVer, confidenceTier, safeSummary || existing.summary, createdAt, existing.id]
        );
        return {
          id: existing.id,
          projectId: input.projectId,
          taskCategory: input.taskCategory,
          platform: input.platform || 'WEB_APP',
          prompt: safePrompt,
          strategyId: input.strategyId,
          modelId: input.modelId,
          status: input.status,
          verified,
          reward: mergedReward,
          durationMs: mergedDur,
          filesChanged: safeFiles,
          toolFailures: safeFailures,
          testPassed: Boolean(input.testPassed),
          userFeedbackRating: input.userFeedbackRating,
          summary: safeSummary || existing.summary,
          version: nextVer,
          createdAt,
          fingerprint,
          repeatCount: nextRepeat,
          confidenceTier,
          evidenceSource,
          deduplicated: true,
        };
      }
    }

    const id = input.id || `ep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    this.execute(
      `INSERT OR REPLACE INTO episodic_memory
       (id, project_id, task_category, platform, prompt, strategy_id, model_id, status, verified, reward, duration_ms, files_changed_json, tool_failures_json, test_passed, user_feedback_rating, summary, version, created_at, fingerprint, repeat_count, confidence_tier, evidence_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1, ?, ?)`,
      [
        id,
        input.projectId,
        input.taskCategory,
        input.platform || 'WEB_APP',
        safePrompt,
        input.strategyId,
        input.modelId,
        input.status,
        verified ? 1 : 0,
        input.reward,
        Math.max(0, Math.round(input.durationMs || 0)),
        JSON.stringify(safeFiles),
        JSON.stringify(safeFailures),
        input.testPassed ? 1 : 0,
        input.userFeedbackRating ?? null,
        safeSummary,
        createdAt,
        fingerprint,
        confidenceTier,
        evidenceSource,
      ]
    );

    return {
      id,
      projectId: input.projectId,
      taskCategory: input.taskCategory,
      platform: input.platform || 'WEB_APP',
      prompt: safePrompt,
      strategyId: input.strategyId,
      modelId: input.modelId,
      status: input.status,
      verified,
      reward: input.reward,
      durationMs: Math.max(0, Math.round(input.durationMs || 0)),
      filesChanged: safeFiles,
      toolFailures: safeFailures,
      testPassed: Boolean(input.testPassed),
      userFeedbackRating: input.userFeedbackRating,
      summary: safeSummary,
      version: 1,
      createdAt,
      fingerprint,
      repeatCount: 1,
      confidenceTier,
      evidenceSource,
      deduplicated: false,
    };
  }

  public markEpisodeSuperseded(id: string): boolean {
    this.execute(
      `UPDATE episodic_memory SET confidence_tier = 'SUPERSEDED', version = version + 1 WHERE id = ?`,
      [id]
    );
    return true;
  }

  public getEpisodes(options: { projectId?: string; taskCategory?: string; verifiedOnly?: boolean; limit?: number } = {}): EpisodicRecord[] {
    const clauses: string[] = [];
    const params: any[] = [];
    if (options.projectId) {
      clauses.push('project_id = ?');
      params.push(options.projectId);
    }
    if (options.taskCategory) {
      clauses.push('task_category = ?');
      params.push(options.taskCategory);
    }
    if (options.verifiedOnly) {
      clauses.push('verified = 1');
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = Math.min(5000, Math.max(1, options.limit || 50));
    const rows = this.queryAll(`SELECT * FROM episodic_memory ${where} ORDER BY created_at DESC LIMIT ?`, [...params, limit]);
    return rows.map(this.mapEpisodicRow);
  }

  private mapEpisodicRow(r: Record<string, any>): EpisodicRecord {
    let filesChanged: string[] = [];
    let toolFailures: string[] = [];
    try { filesChanged = JSON.parse(r.files_changed_json || '[]'); } catch {}
    try { toolFailures = JSON.parse(r.tool_failures_json || '[]'); } catch {}
    return {
      id: r.id,
      projectId: r.project_id,
      taskCategory: r.task_category,
      platform: r.platform,
      prompt: r.prompt,
      strategyId: r.strategy_id,
      modelId: r.model_id,
      status: r.status,
      verified: Boolean(r.verified),
      reward: Number(r.reward || 0),
      durationMs: Number(r.duration_ms || 0),
      filesChanged,
      toolFailures,
      testPassed: Boolean(r.test_passed),
      userFeedbackRating: r.user_feedback_rating !== null && r.user_feedback_rating !== undefined ? Number(r.user_feedback_rating) : undefined,
      summary: r.summary || '',
      version: Number(r.version || 1),
      createdAt: r.created_at,
      fingerprint: r.fingerprint || undefined,
      repeatCount: Number(r.repeat_count || 1),
      confidenceTier: (r.confidence_tier as MemoryConfidenceTier) || (r.verified ? 'FULLY_VERIFIED' : 'UNVERIFIED'),
      evidenceSource: (r.evidence_source as EvidenceSource) || 'USER_ENGINEERING_EXECUTION',
    };
  }

  /**
   * Lightweight local token cosine similarity retrieval with Mission 9 temporal recency decay
   * & verification confidence weighting:
   *   effectiveWeight = verificationConfidence * recencyWeight * relevanceWeight
   * Older high-quality verified memories remain retrievable via minRecencyFloor.
   */
  public retrieveSimilarEpisodes(
    query: string,
    options: {
      projectId?: string;
      taskCategory?: string;
      verifiedOnly?: boolean;
      topK?: number;
      minSimilarity?: number;
      nowMs?: number;
    } = {}
  ): SimilarExperienceMatch[] {
    const candidates = this.getEpisodes({
      projectId: options.projectId,
      verifiedOnly: options.verifiedOnly,
      limit: 200,
    });

    const qTokens = this.tokenize(query);
    if (qTokens.size === 0 || candidates.length === 0) return [];

    const nowMs = options.nowMs ?? Date.now();
    const { halfLifeDays, minRecencyFloor } = this.recencyConfig;
    const scored: SimilarExperienceMatch[] = [];

    for (const ep of candidates) {
      const docText = `${ep.prompt} ${ep.taskCategory} ${ep.platform} ${ep.strategyId} ${ep.summary}`;
      const dTokens = this.tokenize(docText);
      let relevance = this.cosineSimilarity(qTokens, dTokens);
      if (options.taskCategory && ep.taskCategory === options.taskCategory) {
        relevance = Math.min(1.0, relevance + 0.15);
      }
      if (relevance < (options.minSimilarity ?? 0.08)) continue;

      const createdMs = Date.parse(ep.createdAt);
      const ageDays = Number.isFinite(createdMs) ? Math.max(0, (nowMs - createdMs) / 86_400_000) : 0;
      const recencyWeight = Math.max(minRecencyFloor, Math.exp((-Math.LN2 * ageDays) / halfLifeDays));
      const tier: MemoryConfidenceTier =
        ep.confidenceTier ||
        ExperienceMemory.classifyConfidenceTier({
          verified: ep.verified,
          status: ep.status,
          userFeedbackRating: ep.userFeedbackRating,
        });
      const confidenceWeight = CONFIDENCE_TIER_WEIGHTS[tier] ?? 0.35;
      const effectiveWeight = relevance * recencyWeight * confidenceWeight;

      scored.push({
        episode: ep,
        similarity: Math.round(relevance * 1000) / 1000,
        recencyWeight: Math.round(recencyWeight * 1000) / 1000,
        confidenceWeight,
        effectiveWeight: Math.round(effectiveWeight * 1000) / 1000,
        ageDays: Math.round(ageDays * 10) / 10,
      });
    }

    scored.sort((a, b) => (b.effectiveWeight ?? b.similarity) - (a.effectiveWeight ?? a.similarity));
    return scored.slice(0, options.topK || 5);
  }

  private tokenize(text: string): Map<string, number> {
    const stop = new Set(['the', 'a', 'an', 'to', 'for', 'of', 'in', 'on', 'with', 'and', 'or', 'is', 'it', 'be', 'my', 'this', 'that', 'me']);
    const counts = new Map<string, number>();
    const words = String(text || '').toLowerCase().replace(/[^a-z0-9_+#.-]+/g, ' ').split(/\s+/);
    for (const w of words) {
      if (w.length < 2 || stop.has(w)) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }
    return counts;
  }

  private cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (const [k, v] of a.entries()) {
      normA += v * v;
      const bv = b.get(k);
      if (bv) dot += v * bv;
    }
    for (const v of b.values()) normB += v * v;
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // =========================================================================
  // SEMANTIC MEMORY (PROJECT-SPECIFIC)
  // =========================================================================
  public upsertSemantic(input: Omit<SemanticRecord, 'id' | 'version' | 'updatedAt'>): SemanticRecord {
    const safeKey = PolicyGovernance.sanitizeSecretText(input.key).trim();
    const safeVal = PolicyGovernance.sanitizeSecretText(input.value);
    const existing = this.queryAll(
      `SELECT id, version FROM semantic_memory WHERE project_id = ? AND category = ? AND key = ?`,
      [input.projectId, input.category, safeKey]
    )[0];

    const id = existing ? existing.id : `sem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const version = existing ? Number(existing.version) + 1 : 1;
    const updatedAt = new Date().toISOString();

    this.execute(
      `INSERT OR REPLACE INTO semantic_memory (id, project_id, category, key, value, version, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.projectId, input.category, safeKey, safeVal, version, updatedAt]
    );

    return { id, projectId: input.projectId, category: input.category, key: safeKey, value: safeVal, version, updatedAt };
  }

  public getSemanticMemory(projectId: string, category?: string): SemanticRecord[] {
    const sql = category
      ? `SELECT * FROM semantic_memory WHERE project_id = ? AND category = ? ORDER BY updated_at DESC`
      : `SELECT * FROM semantic_memory WHERE project_id = ? ORDER BY updated_at DESC`;
    const rows = this.queryAll(sql, category ? [projectId, category] : [projectId]);
    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      category: r.category,
      key: r.key,
      value: r.value,
      version: Number(r.version || 1),
      updatedAt: r.updated_at,
    }));
  }

  // =========================================================================
  // PROCEDURAL MEMORY (VERIFIED WORKFLOWS & STRATEGIES)
  // =========================================================================
  public recordProcedureOutcome(input: {
    projectId: string;
    taskCategory: string;
    strategyId: string;
    procedureName: string;
    steps: string[];
    modelId?: string;
    succeeded: boolean;
    reward: number;
  }): ProceduralRecord {
    const existing = this.queryAll(
      `SELECT * FROM procedural_memory WHERE project_id = ? AND task_category = ? AND strategy_id = ?`,
      [input.projectId, input.taskCategory, input.strategyId]
    )[0];

    const id = existing ? existing.id : `proc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const prevSuccess = existing ? Number(existing.success_count) : 0;
    const prevFail = existing ? Number(existing.failure_count) : 0;
    const prevTotal = prevSuccess + prevFail;
    const prevAvg = existing ? Number(existing.avg_reward) : 0;
    const nextSuccess = prevSuccess + (input.succeeded ? 1 : 0);
    const nextFail = prevFail + (input.succeeded ? 0 : 1);
    const nextAvg = (prevAvg * prevTotal + input.reward) / (prevTotal + 1);
    const version = existing ? Number(existing.version) + 1 : 1;
    const updatedAt = new Date().toISOString();
    const safeSteps = (input.steps || []).map((st) => PolicyGovernance.sanitizeSecretText(st));

    this.execute(
      `INSERT OR REPLACE INTO procedural_memory
       (id, project_id, task_category, strategy_id, procedure_name, steps_json, model_id, success_count, failure_count, avg_reward, version, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.projectId,
        input.taskCategory,
        input.strategyId,
        PolicyGovernance.sanitizeSecretText(input.procedureName),
        JSON.stringify(safeSteps),
        input.modelId || null,
        nextSuccess,
        nextFail,
        Math.round(nextAvg * 10000) / 10000,
        version,
        updatedAt,
      ]
    );

    return {
      id,
      projectId: input.projectId,
      taskCategory: input.taskCategory,
      strategyId: input.strategyId,
      procedureName: PolicyGovernance.sanitizeSecretText(input.procedureName),
      steps: safeSteps,
      modelId: input.modelId,
      successCount: nextSuccess,
      failureCount: nextFail,
      avgReward: Math.round(nextAvg * 10000) / 10000,
      version,
      updatedAt,
    };
  }

  public getProcedures(projectId?: string, taskCategory?: string): ProceduralRecord[] {
    const clauses: string[] = [];
    const params: any[] = [];
    if (projectId) {
      clauses.push('(project_id = ? OR project_id = \'global\')');
      params.push(projectId);
    }
    if (taskCategory) {
      clauses.push('task_category = ?');
      params.push(taskCategory);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.queryAll(`SELECT * FROM procedural_memory ${where} ORDER BY avg_reward DESC, success_count DESC`, params);
    return rows.map((r) => {
      let steps: string[] = [];
      try { steps = JSON.parse(r.steps_json || '[]'); } catch {}
      return {
        id: r.id,
        projectId: r.project_id,
        taskCategory: r.task_category,
        strategyId: r.strategy_id,
        procedureName: r.procedure_name,
        steps,
        modelId: r.model_id || undefined,
        successCount: Number(r.success_count || 0),
        failureCount: Number(r.failure_count || 0),
        avgReward: Number(r.avg_reward || 0),
        version: Number(r.version || 1),
        updatedAt: r.updated_at,
      };
    });
  }

  // =========================================================================
  // USER FEEDBACK, TOOL TELEMETRY, EDIT/DELETE, EXPORT
  // =========================================================================
  public recordUserFeedback(episodeId: string, projectId: string, rating: -1 | 0 | 1, comment: string = ''): { id: string; updatedReward?: number } {
    const id = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const safeComment = PolicyGovernance.sanitizeSecretText(comment);
    this.execute(
      `INSERT INTO user_feedback (id, episode_id, project_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, episodeId, projectId, rating, safeComment, new Date().toISOString()],
      false
    );
    const ep = this.queryAll(`SELECT reward FROM episodic_memory WHERE id = ?`, [episodeId])[0];
    let updatedReward: number | undefined;
    if (ep) {
      const delta = rating > 0 ? 0.15 : rating < 0 ? -0.25 : 0;
      updatedReward = Math.max(-1, Math.min(1, Number(ep.reward || 0) + delta));
      const nextTier = rating < 0 ? 'USER_REJECTED' : undefined;
      if (nextTier) {
        this.execute(
          `UPDATE episodic_memory SET user_feedback_rating = ?, reward = ?, confidence_tier = ?, version = version + 1 WHERE id = ?`,
          [rating, updatedReward, nextTier, episodeId],
          false
        );
      } else {
        this.execute(
          `UPDATE episodic_memory SET user_feedback_rating = ?, reward = ?, version = version + 1 WHERE id = ?`,
          [rating, updatedReward, episodeId],
          false
        );
      }
    }
    this.flush();
    return { id, updatedReward };
  }

  public recordToolTelemetry(toolName: string, success: boolean, latencyMs: number): void {
    const existing = this.queryAll(`SELECT * FROM tool_telemetry WHERE tool_name = ?`, [toolName])[0];
    const calls = (existing ? Number(existing.calls) : 0) + 1;
    const successes = (existing ? Number(existing.successes) : 0) + (success ? 1 : 0);
    const failures = (existing ? Number(existing.failures) : 0) + (success ? 0 : 1);
    const prevAvg = existing ? Number(existing.avg_latency_ms) : 0;
    const avgLatency = ((prevAvg * (calls - 1)) + latencyMs) / calls;
    this.execute(
      `INSERT OR REPLACE INTO tool_telemetry (tool_name, calls, successes, failures, avg_latency_ms, last_updated)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [toolName, calls, successes, failures, Math.round(avgLatency * 10) / 10, new Date().toISOString()]
    );
  }

  public getToolTelemetry(): Array<{ toolName: string; calls: number; successes: number; failures: number; successRate: number; avgLatencyMs: number }> {
    return this.queryAll(`SELECT * FROM tool_telemetry ORDER BY calls DESC`).map((r) => ({
      toolName: r.tool_name,
      calls: Number(r.calls),
      successes: Number(r.successes),
      failures: Number(r.failures),
      successRate: Number(r.calls) > 0 ? Math.round((Number(r.successes) / Number(r.calls)) * 1000) / 10 : 0,
      avgLatencyMs: Number(r.avg_latency_ms || 0),
    }));
  }

  public setSetting(key: string, value: string): void {
    this.execute(
      `INSERT OR REPLACE INTO governance_settings (key, value, updated_at) VALUES (?, ?, ?)`,
      [key, PolicyGovernance.sanitizeSecretText(value), new Date().toISOString()]
    );
  }

  public getSetting(key: string): string | null {
    const row = this.queryAll(`SELECT value FROM governance_settings WHERE key = ?`, [key])[0];
    return row ? String(row.value) : null;
  }

  public recordValidationRun(input: {
    id?: string;
    source: EvidenceSource | 'REAL_AGENT_EXECUTION';
    benchmarkVersion: string;
    algorithm: string;
    approved: boolean;
    baselineCompletionPct: number;
    learnedCompletionPct: number;
    baselineReward: number;
    learnedReward: number;
    ci95Low?: number;
    ci95High?: number;
    summary: Record<string, any>;
  }): string {
    const id = input.id || `valrun-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const safeSummary = JSON.stringify(PolicyGovernance.sanitizeObject(input.summary));
    const normalizedSource: EvidenceSource =
      input.source === 'REAL_AGENT_EXECUTION' || input.source === 'CONTROLLED_LIVE_EXPERIMENT'
        ? 'CONTROLLED_LIVE_EXPERIMENT'
        : input.source === 'USER_ENGINEERING_EXECUTION'
        ? 'USER_ENGINEERING_EXECUTION'
        : 'SIMULATED_BENCHMARK';
    this.execute(
      `INSERT OR REPLACE INTO validation_runs
       (id, source, benchmark_version, algorithm, approved, baseline_completion_pct, learned_completion_pct, baseline_reward, learned_reward, ci95_low, ci95_high, summary_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        normalizedSource,
        input.benchmarkVersion,
        input.algorithm,
        input.approved ? 1 : 0,
        input.baselineCompletionPct,
        input.learnedCompletionPct,
        input.baselineReward,
        input.learnedReward,
        input.ci95Low ?? null,
        input.ci95High ?? null,
        safeSummary,
        new Date().toISOString(),
      ]
    );
    return id;
  }

  public getValidationRuns(limit: number = 30): Array<{
    id: string;
    source: EvidenceSource;
    benchmarkVersion: string;
    algorithm: string;
    approved: boolean;
    baselineCompletionPct: number;
    learnedCompletionPct: number;
    baselineReward: number;
    learnedReward: number;
    ci95Low: number | null;
    ci95High: number | null;
    summary: Record<string, any>;
    createdAt: string;
  }> {
    return this.queryAll(`SELECT * FROM validation_runs ORDER BY created_at DESC LIMIT ?`, [limit]).map((r) => {
      let summary: Record<string, any> = {};
      try { summary = JSON.parse(r.summary_json || '{}'); } catch {}
      const src: EvidenceSource =
        r.source === 'REAL_AGENT_EXECUTION' || r.source === 'CONTROLLED_LIVE_EXPERIMENT'
          ? 'CONTROLLED_LIVE_EXPERIMENT'
          : r.source === 'USER_ENGINEERING_EXECUTION'
          ? 'USER_ENGINEERING_EXECUTION'
          : 'SIMULATED_BENCHMARK';
      return {
        id: r.id,
        source: src,
        benchmarkVersion: r.benchmark_version,
        algorithm: r.algorithm,
        approved: Boolean(r.approved),
        baselineCompletionPct: Number(r.baseline_completion_pct || 0),
        learnedCompletionPct: Number(r.learned_completion_pct || 0),
        baselineReward: Number(r.baseline_reward || 0),
        learnedReward: Number(r.learned_reward || 0),
        ci95Low: r.ci95_low !== null && r.ci95_low !== undefined ? Number(r.ci95_low) : null,
        ci95High: r.ci95_high !== null && r.ci95_high !== undefined ? Number(r.ci95_high) : null,
        summary,
        createdAt: r.created_at,
      };
    });
  }

  public recordPostTaskReview(input: {
    episodeId: string;
    projectId: string;
    strategyId: string;
    intent: string;
    evidenceSource: EvidenceSource;
    requirementsMet: boolean;
    unnecessaryChanges: string[];
    failedApproaches: string[];
    improvements: string[];
    offlineEvalScheduled: boolean;
  }): string {
    const id = `rev-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    this.execute(
      `INSERT INTO post_task_reviews
       (id, episode_id, project_id, strategy_id, intent, evidence_source, requirements_met, unnecessary_changes_json, failed_approaches_json, improvements_json, offline_eval_scheduled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.episodeId,
        input.projectId,
        input.strategyId,
        input.intent,
        input.evidenceSource,
        input.requirementsMet ? 1 : 0,
        JSON.stringify(PolicyGovernance.sanitizeObject(input.unnecessaryChanges)),
        JSON.stringify(PolicyGovernance.sanitizeObject(input.failedApproaches)),
        JSON.stringify(PolicyGovernance.sanitizeObject(input.improvements)),
        input.offlineEvalScheduled ? 1 : 0,
        new Date().toISOString(),
      ]
    );
    return id;
  }

  public getPostTaskReviews(limit: number = 25): Array<{
    id: string;
    episodeId: string;
    projectId: string;
    strategyId: string;
    intent: string;
    evidenceSource: EvidenceSource;
    requirementsMet: boolean;
    unnecessaryChanges: string[];
    failedApproaches: string[];
    improvements: string[];
    offlineEvalScheduled: boolean;
    createdAt: string;
  }> {
    return this.queryAll(`SELECT * FROM post_task_reviews ORDER BY created_at DESC LIMIT ?`, [limit]).map((r) => {
      const parse = (s: any) => { try { return JSON.parse(s || '[]'); } catch { return []; } };
      return {
        id: r.id,
        episodeId: r.episode_id,
        projectId: r.project_id,
        strategyId: r.strategy_id,
        intent: r.intent,
        evidenceSource: (r.evidence_source as EvidenceSource) || 'USER_ENGINEERING_EXECUTION',
        requirementsMet: Boolean(r.requirements_met),
        unnecessaryChanges: parse(r.unnecessary_changes_json),
        failedApproaches: parse(r.failed_approaches_json),
        improvements: parse(r.improvements_json),
        offlineEvalScheduled: Boolean(r.offline_eval_scheduled),
        createdAt: r.created_at,
      };
    });
  }

  public getMemoryQualityStats(projectId?: string): {
    uniqueEpisodes: number;
    duplicatesPrevented: number;
    freshCount30d: number;
    staleCount90d: number;
    avgRecencyWeight: number;
    confidenceTierCounts: Record<MemoryConfidenceTier, number>;
    evidenceSourceCounts: Record<EvidenceSource, number>;
  } {
    const eps = this.getEpisodes({ projectId, limit: 5000 });
    const now = Date.now();
    const { halfLifeDays, minRecencyFloor } = this.recencyConfig;
    let duplicatesPrevented = 0;
    let freshCount30d = 0;
    let staleCount90d = 0;
    let recencySum = 0;
    const confidenceTierCounts: Record<MemoryConfidenceTier, number> = {
      FULLY_VERIFIED: 0,
      PARTIALLY_VERIFIED: 0,
      UNVERIFIED: 0,
      USER_REJECTED: 0,
      SUPERSEDED: 0,
    };
    const evidenceSourceCounts: Record<EvidenceSource, number> = {
      SIMULATED_BENCHMARK: 0,
      CONTROLLED_LIVE_EXPERIMENT: 0,
      USER_ENGINEERING_EXECUTION: 0,
    };

    for (const ep of eps) {
      const rep = Number(ep.repeatCount || 1);
      if (rep > 1) duplicatesPrevented += rep - 1;
      const ageDays = Math.max(0, (now - Date.parse(ep.createdAt || '')) / 86_400_000);
      if (Number.isFinite(ageDays)) {
        if (ageDays <= 30) freshCount30d++;
        if (ageDays >= 90) staleCount90d++;
        recencySum += Math.max(minRecencyFloor, Math.exp((-Math.LN2 * ageDays) / halfLifeDays));
      } else {
        recencySum += 1;
      }
      const tier = ep.confidenceTier || 'UNVERIFIED';
      if (confidenceTierCounts[tier] !== undefined) confidenceTierCounts[tier]++;
      const src = ep.evidenceSource || 'USER_ENGINEERING_EXECUTION';
      if (evidenceSourceCounts[src] !== undefined) evidenceSourceCounts[src]++;
    }

    return {
      uniqueEpisodes: eps.length,
      duplicatesPrevented,
      freshCount30d,
      staleCount90d,
      avgRecencyWeight: eps.length > 0 ? Math.round((recencySum / eps.length) * 1000) / 1000 : 1,
      confidenceTierCounts,
      evidenceSourceCounts,
    };
  }

  public deleteRecord(table: 'episodic_memory' | 'semantic_memory' | 'procedural_memory', id: string): boolean {
    const allowed = new Set(['episodic_memory', 'semantic_memory', 'procedural_memory']);
    if (!allowed.has(table)) return false;
    this.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
    return true;
  }

  public editSemanticRecord(id: string, newValue: string): boolean {
    const safe = PolicyGovernance.sanitizeSecretText(newValue);
    this.execute(
      `UPDATE semantic_memory SET value = ?, version = version + 1, updated_at = ? WHERE id = ?`,
      [safe, new Date().toISOString(), id]
    );
    return true;
  }

  public clearMemory(projectId?: string): void {
    if (projectId) {
      this.execute(`DELETE FROM episodic_memory WHERE project_id = ?`, [projectId], false);
      this.execute(`DELETE FROM semantic_memory WHERE project_id = ?`, [projectId], false);
      this.execute(`DELETE FROM procedural_memory WHERE project_id = ?`, [projectId], false);
      this.execute(`DELETE FROM user_feedback WHERE project_id = ?`, [projectId], false);
      this.execute(`DELETE FROM evaluations WHERE project_id = ?`, [projectId], false);
    } else {
      this.execute(`DELETE FROM episodic_memory`, [], false);
      this.execute(`DELETE FROM semantic_memory`, [], false);
      this.execute(`DELETE FROM procedural_memory`, [], false);
      this.execute(`DELETE FROM user_feedback`, [], false);
      this.execute(`DELETE FROM evaluations`, [], false);
      this.execute(`DELETE FROM bandit_arms`, [], false);
      this.execute(`DELETE FROM tool_telemetry`, [], false);
    }
    this.flush();
  }

  public getStats(projectId?: string): {
    dbSizeBytes: number;
    episodicCount: number;
    verifiedSuccessCount: number;
    failedCount: number;
    verifiedCompletionRate: number;
    semanticCount: number;
    proceduralCount: number;
    feedbackCount: number;
  } {
    const where = projectId ? 'WHERE project_id = ?' : '';
    const p = projectId ? [projectId] : [];
    const epCount = Number(this.queryAll(`SELECT COUNT(*) as c FROM episodic_memory ${where}`, p)[0]?.c || 0);
    const okCount = Number(this.queryAll(`SELECT COUNT(*) as c FROM episodic_memory ${where ? where + ' AND' : 'WHERE'} status = 'COMPLETED' AND verified = 1`, p)[0]?.c || 0);
    const failCount = Number(this.queryAll(`SELECT COUNT(*) as c FROM episodic_memory ${where ? where + ' AND' : 'WHERE'} status = 'FAILED'`, p)[0]?.c || 0);
    const semCount = Number(this.queryAll(`SELECT COUNT(*) as c FROM semantic_memory ${where}`, p)[0]?.c || 0);
    const procCount = Number(this.queryAll(`SELECT COUNT(*) as c FROM procedural_memory ${where}`, p)[0]?.c || 0);
    const fbCount = Number(this.queryAll(`SELECT COUNT(*) as c FROM user_feedback ${where}`, p)[0]?.c || 0);
    let dbSizeBytes = 0;
    try { if (fs.existsSync(this.dbPath)) dbSizeBytes = fs.statSync(this.dbPath).size; } catch {}

    return {
      dbSizeBytes,
      episodicCount: epCount,
      verifiedSuccessCount: okCount,
      failedCount: failCount,
      verifiedCompletionRate: epCount > 0 ? Math.round((okCount / epCount) * 1000) / 10 : 0,
      semanticCount: semCount,
      proceduralCount: procCount,
      feedbackCount: fbCount,
    };
  }

  public exportBackup(): Record<string, any> {
    return PolicyGovernance.sanitizeObject({
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      episodicMemory: this.getEpisodes({ limit: 500 }),
      semanticMemory: this.queryAll(`SELECT * FROM semantic_memory`),
      proceduralMemory: this.getProcedures(),
      userFeedback: this.queryAll(`SELECT * FROM user_feedback`),
      banditArms: this.queryAll(`SELECT * FROM bandit_arms`),
      policyVersions: this.queryAll(`SELECT * FROM policy_versions`),
      evaluations: this.queryAll(`SELECT * FROM evaluations`),
      toolTelemetry: this.getToolTelemetry(),
    });
  }
}
