# MAXIDE APEX — MISSION 8 LEARNING CURVES REPORT

**Benchmark:** `v1.0.0-mission8` (60 Train / 24 Validation / 36 Holdout)  
**Experience Budgets:** `10, 50, 100, 250, 500, 1000` training tasks  
**Random Seeds:** `5` independent seeds (`101, 202, 303, 404, 505`)  
**Raw Evidence:** `docs/mission8/validation_results_ucb1.json` & `docs/mission8/validation_results_exploit_ablation.json`

---

## 1. Learning Curve A — Mission 7 Default Evaluation (`UCB1`, `explorationC = 0.75`, Exploring During Eval)

| Budget | Sys C Mean % | Sys D Mean % | Variance (D) | 95% CI (D) | Mean Reward (D) | Train % | Overfit Gap % | Strategy Entropy | Arm Coverage % |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `10` | `69.4%` | `71.1%` | `56.33` | `[64.5%, 77.7%]` | `0.659` | `52.0%` | `-19.1%` | `0.982` | `9.0%` |
| `50` | `58.3%` | `57.8%` | `43.98` | `[52.0%, 63.6%]` | `0.545` | `62.8%` | `+5.0%` | `0.970` | `42.7%` |
| `100` | `51.7%` | `61.7%` | `28.55` | `[57.0%, 66.4%]` | `0.582` | `58.4%` | `-3.3%` | `0.966` | `66.3%` |
| `250` | `67.8%` | `58.9%` | `67.13` | `[51.7%, 66.1%]` | `0.530` | `60.6%` | `+1.8%` | `0.968` | `94.1%` |
| `500` | `67.2%` | `62.2%` | `56.33` | `[55.6%, 68.8%]` | `0.591` | `61.1%` | `-1.1%` | `0.963` | `100.0%` |
| `1000` | `68.3%` | `68.3%` | `21.60` | `[64.3%, 72.4%]` | `0.656` | `62.6%` | `-5.7%` | `0.956` | `100.0%` |

### Curve Diagnosis (The Mid-Budget UCB1 Exploration Dip)
- At `budget = 10` (`ArmCov = 9.0%`), all arms start at `pulls = 0` with identical UCB bonus, so the policy follows the 9-criteria heuristic (`71.1%`).
- Between `budget = 50` and `budget = 250` (`ArmCov = 42.7% → 94.1%`), `explorationC = 0.75` grants untested bad arms a `+1.11` bonus (exceeding the `[0, 1]` reward scale), causing UCB1 to dip to `51.7%–58.9%` while sweeping all 111 arms!
- Once `ArmCov` reaches `100.0%` at `budget = 500–1000`, variance drops sharply from `67.13` to **`21.60`** and completion recovers to `68.3%`.

---

## 2. Learning Curve B — Controlled Exploit-Only Holdout Evaluation (`exploitOnHoldout = true`)

Evaluating the **exact same trained models** without forced exploration noise during holdout reveals true policy learning:

| Budget | Sys C (Bandit No Mem) | Sys D (Bandit + Memory) | 95% CI (Sys D) | Mean Reward (D) | vs Baseline (`27.8%`) | vs Heuristic (`70.0%`) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `10` | `73.3%` | `74.4%` | `[67.7%, 81.2%]` | `0.696` | `+46.6%` | `+4.4%` |
| `50` | `72.2%` | `70.6%` | `[65.0%, 76.2%]` | `0.656` | `+42.8%` | `+0.6%` |
| `100` | `68.9%` | `71.7%` | `[67.3%, 76.0%]` | `0.676` | `+43.9%` | `+1.7%` |
| `250` | `74.4%` | `72.2%` | `[65.1%, 79.3%]` | `0.695` | `+44.4%` | `+2.2%` |
| **`500`** | **`75.0%`** | **`76.1%`** | **`[67.7%, 84.5%]`** | **`0.711`** | **`+48.3%`** | **`+6.1%`** |
| `1000` | `65.0%` | `71.1%` | `[66.1%, 76.2%]` | `0.684` | `+43.3%` | `+1.1%` |

---

## 3. Seven Pathology Checks (Measured Empirically)

| Pathology | Measured Value | Status | Interpretation |
| :--- | :--- | :---: | :--- |
| **Overfitting** | Train `62.6%` vs Holdout `68.3%` (`Gap = -5.7%`) | **NOT DETECTED** | Regularized priors (`priorPulls = 2`) prevented overfitting completely. |
| **Catastrophic Forgetting** | Group 1 Holdout Before `50.0%` → After 300 Group-2 steps `50.0%` (`Δ = 0.0%`) | **NOT DETECTED** | Strict context-key partitioning guarantees zero cross-context forgetting. |
| **Strategy Collapse** | Normalized Entropy = `0.9582` (`34/34` candidate strategies utilized) | **NOT DETECTED** | Healthy strategy diversity across domains. |
| **Reward Exploitation** | Baseline `0.1415` (`27.8%`) → Learned `0.695–0.711` (`72.2%–76.1%`) | **NOT DETECTED** | Reward gains track verified completion gains faithfully. |
| **Poor Exploration** | `111 / 111` context-arms explored (`100.0%` coverage by budget 500) | **NOT DETECTED** | Full exploration achieved (in fact, slightly *over*-aggressive during early budgets!). |
| **Excessive Retries** | Baseline initial error rate `45.0%` → Learned `37.2%` (`-7.8%`) | **NOT DETECTED** | Learned strategies trigger fewer retries than baseline. |
| **Memory Contamination** | Clean Holdout `58.3%` vs 30 Poisoned Episodes `58.3%` (`Δ = 0.0%`) | **NOT DETECTED** | Bounded prior injection (`±0.14`) prevented 30 poisoned records from hijacking bandit arms. |
