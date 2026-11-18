# MAXIDE APEX — MISSION 9 MEMORY IMPROVEMENTS SPECIFICATION

**Module:** `src/intelligence/ExperienceMemory.ts`  
**Regression Tests:** `src/tests/mission9_regression_suite.test.ts` (Tests 10–12, 16)

---

## 1. Episode Deduplication via Stable SHA-256 Fingerprints

In Mission 8 Audit Test 7.3, inserting 5 identical tasks created 5 separate rows, saturating top-$K$ retrieval. Mission 9 computes a deterministic fingerprint:

$$\text{fingerprint} = \text{SHA256}(\text{projectId} \parallel \text{taskCategory} \parallel \text{normalizedPrompt} \parallel \text{strategyId} \parallel \text{status} \parallel \text{sortedFiles})[0..24]$$

When a matching fingerprint is recorded within the same project:
- Increments `repeat_count` (e.g., $1 \rightarrow 2 \rightarrow 5$).
- Updates reward and duration as running weighted averages.
- Updates `created_at` timestamp and bumps `version`.
- **Zero duplicate rows created**. Tested in Test 10: 5 identical writes produced **exactly 1 stored row** (`repeatCount=5`, `duplicatesPrevented=4`), while distinct tasks were preserved cleanly.

---

## 2. Configurable Temporal Recency Decay

Mission 8 Audit Test 7.4 revealed that a 180-day-old episode scored identically to a 0-day fresh episode. Mission 9 implements half-life exponential decay with a guaranteed floor:

$$\text{recencyWeight} = \max\left(\text{minRecencyFloor}, \exp\left(-\frac{\ln 2 \cdot \text{ageDays}}{\text{halfLifeDays}}\right)\right)$$

- Default configuration: `halfLifeDays = 45`, `minRecencyFloor = 0.25`.
- **Fresh evidence outranks stale evidence**: At 0 days, $\text{weight} = 1.0$; at 90 days, $\text{weight} = 0.25$.
- **High-quality older memories are NEVER discarded**: The $0.25$ floor ensures that verified past architectures remain retrievable when relevant.

---

## 3. Five-Tier Memory Confidence Model

$$\text{effectiveWeight} = \text{relevanceSimilarity} \times \text{recencyWeight} \times \text{confidenceWeight}$$

| Confidence Tier | Criteria | Weight |
| :--- | :--- | :---: |
| **`FULLY_VERIFIED`** | `status === 'COMPLETED'` and verified with real runtime evidence | **`1.00`** |
| **`PARTIALLY_VERIFIED`** | `status === 'PARTIALLY_COMPLETED'` with partial test/build passes | **`0.70`** |
| **`UNVERIFIED`** | AI assertion without independent test/build evidence | **`0.35`** |
| **`SUPERSEDED`** | Architecture updated or replaced by newer project convention | **`0.20`** |
| **`USER_REJECTED`** | Received explicit thumbs-down ($-1$) feedback from engineer | **`0.15`** |

This guarantees that unverified assertions and user-rejected approaches cannot outrank real, verified, fresh engineering successes during retrieval.
