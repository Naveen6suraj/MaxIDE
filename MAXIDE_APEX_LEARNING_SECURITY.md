# MAXIDE APEX — LEARNING SECURITY & POLICY GOVERNANCE

**Module:** `src/intelligence/PolicyGovernance.ts`

---

## 1. Immutable Safety Locks

The Adaptive Intelligence Engine enforces hard-coded, non-overridable safety invariants:
- `coreSystemPromptLocked: true` (`canModifyCoreSystemInstructions() === false`) — Adaptive learning can NEVER rewrite or weaken MaxIDE's core engineering rules or system instructions.
- `securityBoundariesLocked: true` (`canModifySecurityPolicies() === false`) — SafeTerminal approval rules, Windows reserved device path protection (`CON`, `NUL`, `COM1-9`, `LPT1-9`), and workspace containment cannot be altered by RL or experience memory.
- `rewardCalculationTrustedOnly: true` (`canAgentManipulateOwnReward() === false`) — Rewards are computed strictly inside trusted backend runtime code from actual filesystem/build/test outcomes; the LLM has zero write access to reward tables or weights.

---

## 2. Mandatory Secret & Credential Sanitization

Before ANY record is inserted into SQLite (`episodic_memory`, `semantic_memory`, `procedural_memory`, `user_feedback`, `governance_settings`) or exported to JSON backups, `PolicyGovernance.sanitizeSecretText()` and `PolicyGovernance.sanitizeObject()` redact:
- PEM Private Keys (`-----BEGIN ... PRIVATE KEY-----`) -> `[REDACTED_PRIVATE_KEY]`
- OpenAI / Anthropic style keys (`sk-...`) -> `[REDACTED_API_KEY]`
- Google / Gemini API keys (`AIza...`) -> `[REDACTED_API_KEY]`
- Groq keys (`gsk_...`) -> `[REDACTED_API_KEY]`
- GitHub Personal Access Tokens (`ghp_...`, `github_pat_...`) -> `[REDACTED_TOKEN]`
- Slack tokens (`xox...`) -> `[REDACTED_TOKEN]`
- HTTP `Bearer` JWT / OAuth tokens -> `Bearer [REDACTED_TOKEN]`
- Key-value secrets (`api_key=`, `password=`, `secret=`, `access_token=`, `private_key=`) -> `[REDACTED_SECRET]`

Verified in **Test L**: Zero leaked credentials appear in either exported JSON backups or the raw SQLite `.sqlite` file on disk.

---

## 3. Evidence Verification & Anti-Hallucination Gate

`PolicyGovernance.isSuccessEvidenceVerified()` ensures no AI claim is ever stored as verified positive knowledge unless supported by real runtime execution evidence (non-zero tool actions or modified artifacts, passing build if attempted, passing tests if attempted, zero false completion claims, and zero security violations).

---

## 4. Regression-Blocking Policy Promotion & User Controls

- **Gated Promotion (`approvePolicyUpdate`)**: Rejects policy updates if learning is paused, if evaluated sample size $< 3$, if any core/security modification is attempted, or if candidate score regresses below baseline.
- **User Sovereignty**: Users can toggle Adaptive Learning ON/OFF, toggle Cross-Project Transfer ON/OFF, edit or delete individual memory records, clear memory, export sanitized JSON backups, and roll back to any prior policy version in 1 click from the **APEX Intelligence Center**.
