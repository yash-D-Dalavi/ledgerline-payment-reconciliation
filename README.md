
# Ledgerline — Month-End Payment Reconciliation & Anomaly Detection Workbench

> **Onelab Ventures — AI Native Engineer Assessment (November 2026)**
>
> **Live Deployed Application:** [Ledgerline Workbench](https://fintech-audit-workbe-pkma.bolt.host)

---

## 1. Executive Summary & Problem Statement

At month-end, a payment company's internal **Platform Ledger**, which records customer payment authorizations instantaneously, often fails to balance against the **Bank Settlement Statement**, where funds are batched and settled 1–2 business days later.

**Ledgerline** is a deterministic, audit-grade payment reconciliation engine and interactive FinTech workbench designed to:

- Ingest and reconcile Platform Ledger and Bank Settlement datasets.
- Identify timing differences and structural discrepancies.
- Eliminate floating-point precision errors using integer micro-cent arithmetic.
- Detect duplicate transactions, orphan refunds, unrecorded bank fees, and cumulative rounding drift.
- Generate ERP-ready double-entry journal postings.
- Maintain a verifiable SHA-256 audit fingerprint.
- Prove zero unexplained variance (`$0.00`) across reconciled batches.

The primary objective is to provide a transparent, deterministic, and auditable reconciliation workflow suitable for month-end financial operations.

---

## 2. Explicit Accounting & Technical Assumptions

Every reconciliation rule is governed by explicit accounting and technical assumptions surfaced directly inside the application.

### 2.1 Currency & Integer Micro-Cent Precision

- Primary currency: USD (`$`).
- Supports a live INR currency toggle.
- Platform Ledger stores amounts up to 4 decimal places.
- Bank Settlement Statement records amounts rounded to 2 decimal places.
- Internal calculations use integer micro-cent representation to eliminate IEEE-754 floating-point precision errors.

**Normalization Logic:**

```javascript
Math.round(amount * 10000)
```

Integer arithmetic using `BigInt` is applied where required for precise aggregation and comparison.

This prevents errors such as:

```javascript
0.1 + 0.2 !== 0.30000000000000004
```

### 2.2 Settlement Lag (T+1 to T+2 Business Days)

- Platform events are timestamped immediately when a payment is processed.
- Platform timestamps use `created_at` in UTC.
- Bank settlements arrive 1–2 business days later.
- Bank timestamps use `settled_at` in UTC.

### 2.3 Month-End Cutoff Boundary

The accounting cutoff is strictly defined as:

```text
2026-10-31 23:59:59 UTC
```

Valid transactions processed on October 30–31, 2026, but settled on November 1–2, 2026, are classified as:

`NEXT_MONTH_SETTLEMENT`

These transactions are treated as settlements in transit rather than missing funds or financial losses.

### 2.4 Primary Keys & Referential Integrity

- Primary deterministic matching key: `transaction_id`.
- Refund transactions are represented as negative outflows in the bank statement.
- Refunds require valid foreign-key linkage through `original_transaction_id`.
- Duplicate transaction identifiers are independently checked in both datasets.

---

## 3. System Architecture & Multi-Pass Matching Pipeline

Ledgerline implements a deterministic **3-Pass Matching Pipeline** supported by integer normalization, temporal validation, referential integrity checks, and an immutable SHA-256 audit run fingerprint.

### 3.1 Architecture Diagram

```text
┌─────────────────────────┐     ┌─────────────────────────┐
│    Platform Ledger      │     │    Bank Statement      │
│  (4-Decimal Precision)  │     │  (2-Decimal Settled)   │
└────────────┬────────────┘     └────────────┬────────────┘
             │                               │
             └──────────────┬────────────────┘
                            ▼
             ┌──────────────────────────────┐
             │  Integer Micro-Cent         │
             │       Normalizer             │
             │   (Amount × 10,000 → Int)    │
             └──────────────┬───────────────┘
                            ▼
       ┌────────────────────────────────────────┐
       │ PASS 1: Deterministic Exact Matching    │
       │ • Exact transaction_id matching        │
       │ • Integer micro-cent comparison        │
       └────────────────────┬───────────────────┘
                            ▼
       ┌────────────────────────────────────────┐
       │ PASS 2: Temporal & Precision Validation │
       │ • T+1 / T+2 settlement boundary         │
       │ • Month-end cutoff validation          │
       │ • Row-level vs batch-level drift        │
       └────────────────────┬───────────────────┘
                            ▼
       ┌────────────────────────────────────────┐
       │ PASS 3: Cardinality & Referential       │
       │        Integrity Validation             │
       │ • Duplicate transaction detection      │
       │ • Orphan refund detection               │
       │ • Parent foreign-key validation        │
       └────────────────────┬───────────────────┘
                            ▼
       ┌────────────────────────────────────────┐
       │ Signed Reconciliation Bridge & GL      │
       │ • Signed financial adjustments         │
       │ • ERP-ready double-entry journals      │
       │ • Zero unexplained variance proof      │
       └────────────────────────────────────────┘
```

### 3.2 Matching Pipeline Explanation

| Pass | Validation | Purpose |
|---|---|---|
| Pass 1 | Deterministic Matching | Matches transactions using exact transaction IDs and normalized amounts. |
| Pass 2 | Temporal & Precision Checks | Identifies settlement timing differences and cumulative rounding drift. |
| Pass 3 | Cardinality & Referential Integrity | Detects duplicate records, orphan refunds, and invalid relationships. |
| Final | Reconciliation Bridge | Calculates signed adjustments and generates accounting journal entries. |

---

## 4. Planted Anomalies & Signed Reconciliation Math

The **Default Month-End Audit (October 2026)** scenario contains four mandatory discrepancy categories and one additional real-world unrecorded bank fee edge case.

### 4.1 Reconciliation Summary

| Component | Count | Signed Impact | Root Cause / Detection Logic | Recommended Accounting Action |
|---|---:|---:|---|---|
| Platform Gross Volume | 119 rows | **$65,678.01** | Total authorized platform volume for October 2026. | Baseline Ledger Total |
| Next-Month Settlements | 5 rows | -$582.00 | October 30–31 transactions settled on November 1–2 (`txn_late_1` to `txn_late_5`). | Memo only: Settlements in transit |
| Platform Duplicates | 1 row | -$124.50 | Repeated webhook log (`txn_dup_platform`) inflating platform ledger volume. | `Dr 4010 Payment Revenue / Cr 1200 PSP Clearing` |
| Bank Duplicates | 2 rows | +$131.44 | Duplicate bank settlement records (`txn_dup_bank_1`, `txn_dup_bank_2`). | `Dr 1010 Bank Settlement / Cr 2210 Overpayment Payable` |
| Orphan Refunds | 2 rows | -$67.30 | Bank refunds (`REF-9901`, `REF-9902`) without matching original payment records. | `Dr 1290 Refund Suspense / Cr 1200 PSP Clearing` |
| Unrecorded Bank Fee | 1 row | -$5.00 | Bank wire/chargeback fee (`txn_bank_fee_001`) absent from the platform ledger. | `Dr 5120 Bank Charges / Cr 1200 PSP Clearing` |
| Cumulative Rounding Drift | 20 rows | -$0.08 | 20 individually acceptable differences of $0.004 accumulate to $0.08. | `Dr 5130 Rounding Differences / Cr 1200 PSP Clearing` |
| Bank Settled Volume | 118 rows | **$65,030.57** | Actual bank settlement statement volume. | Reconciled Bank Total |

### 4.2 Mathematical Identity Proof

The reconciliation engine uses a signed adjustment bridge to explain every difference between the Platform Ledger and Bank Statement.

**Reconciliation Formula:**

```text
Platform Gross Volume + Sum(Signed Adjustments)
= Bank Settled Volume
```

**Substituting the Default Audit Values:**

```text
$65,678.01
+ (-$582.00)
+ (-$124.50)
+ (+$131.44)
+ (-$67.30)
+ (-$5.00)
+ (-$0.08)
----------------
= $65,030.57
```

**Final Reconciliation Identity:**

```text
Platform Gross Volume     = $65,678.01
Bank Settled Volume       = $65,030.57
Raw Discrepancy           = -$647.44
Explained Variance        = -$647.44
Unexplained Variance      =   $0.00
```

The reconciliation engine ensures that every identified discrepancy is accounted for through a documented adjustment or timing classification.

**Expected Result: `$0.00` Unexplained Variance.**

---

## 5. Key Features & Scenario Laboratory

Ledgerline includes an interactive Scenario Laboratory to validate reconciliation behavior under different financial conditions.

### 5.1 Scenario Laboratory

**Scenario 1: Default Month-End Audit (October 2026)**

- Validates all four mandatory anomaly categories.
- Includes an additional unrecorded bank fee.
- Tests October month-end cutoff handling.
- Detects cumulative rounding drift.
- Generates signed reconciliation adjustments.
- Verifies zero unexplained variance.

**Scenario 2: High-Volume Stress Test (500 Transactions)**

- Dynamically generates 500 synthetic transactions.
- Simulates randomized T+1 and T+2 settlement lags.
- Introduces multi-decimal precision differences.
- Injects duplicate transaction records.
- Simulates orphan refunds.
- Validates reconciliation accuracy at higher transaction volumes.

**Scenario 3: Clean Balanced Ledger**

- Uses matching platform and bank datasets.
- Validates the normal reconciliation workflow.
- Ensures zero false positives.
- Confirms a balanced ledger with zero unexplained variance.

**Scenario 4: Chaos Injection**

- Includes an interactive `Inject unexplained $50` button.
- Introduces an unexplained financial discrepancy.
- Tests live anomaly alerting.
- Verifies that the reconciliation engine identifies the imbalance rather than silently accepting it.

### 5.2 Custom CSV Ingestion & Audit Export

- Upload custom `platform_ledger.csv` files.
- Upload custom `bank_settlements.csv` files.
- Process uploaded datasets through the reconciliation engine.
- Export complete audit trails.
- Export generated accounting journal entries.
- Supports CSV and JSON output formats.

### 5.3 In-Browser Live Test Runner

The application includes a dedicated **Verify Logic** tab.

Features include:

- Executes live assertions directly against the reconciliation engine.
- Validates reconciliation invariants.
- Tests anomaly detection logic.
- Provides immediate test results inside the browser.
- Complements the automated Vitest CLI test suite.

---

## 6. Automated Test Suite (Vitest)

Ledgerline includes a comprehensive automated test suite designed to verify financial correctness, precision handling, and anomaly detection.

| Test Case | Validation | Expected Result |
|---|---|---|
| Boundary Cutoff Test | Validates October 31 transactions settling on November 1. | Classified as `NEXT_MONTH_SETTLEMENT`. |
| Cumulative Rounding Drift Test | Validates 20 paired rows with individual $0.004 differences. | Triggers `CUMULATIVE_ROUNDING` at $0.08. |
| Platform Duplicate Detection | Checks duplicate transaction IDs in the Platform Ledger. | Duplicate platform records identified. |
| Bank Duplicate Detection | Checks duplicate transaction IDs in the Bank Statement. | Duplicate bank records identified. |
| Orphan Refund Integrity Test | Checks negative bank entries without valid original transaction references. | Orphan refunds flagged. |
| Mathematical Identity Invariant | Validates signed reconciliation adjustments. | Unexplained variance equals zero. |

### 6.1 Important Test Assertions

**Boundary Cutoff:**

```text
Transaction Created:
2026-10-31 23:58:00 UTC

Bank Settlement:
2026-11-01

Expected Classification:
NEXT_MONTH_SETTLEMENT
```

**Cumulative Rounding Drift:**

```text
Number of Rows       = 20
Individual Difference = $0.004
Individual Tolerance  = < $0.01
Cumulative Difference = $0.08

Expected Alert:
CUMULATIVE_ROUNDING
```

**Mathematical Invariant:**

```javascript
expect(unexplainedVariance).toBe(0);
```

The mathematical identity invariant is tested across preset and randomized datasets.

---

## 7. Technology Stack

| Category | Technology / Concept |
|---|---|
| Frontend | Modern Web Application |
| Language | JavaScript / TypeScript |
| Financial Arithmetic | Integer Micro-Cents / BigInt |
| Precision Handling | Deterministic Integer Normalization |
| Matching Engine | Three-Pass Reconciliation Pipeline |
| Audit Integrity | SHA-256 Fingerprinting |
| Testing Framework | Vitest |
| Data Import | CSV Ingestion |
| Data Export | CSV / JSON |
| Accounting | Double-Entry Journal Posting |
| Deployment | Bolt Hosting |

---

## 8. Local Setup & Running Tests

Follow these steps to run Ledgerline locally.

### Prerequisites

- Node.js
- npm
- Git

### Step 1: Clone the Repository

```bash
git clone https://github.com/yash-D-Dalavi/ledgerline-payment-reconciliation.git
```

### Step 2: Navigate to the Project Directory

```bash
cd ledgerline-payment-reconciliation
```

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Start the Development Server

```bash
npm run dev
```

### Step 5: Run Automated Tests

```bash
npx vitest run
```

The application will start on the local development server URL displayed in the terminal.

---

## 9. Production Limitations & Critical Evaluation

Although Ledgerline provides deterministic reconciliation for the defined assessment scenarios, real-world production payment systems require additional financial and operational complexity.

### 9.1 Partial Refunds, Chargebacks & Multi-Currency FX

The current heuristic engine does not fully model partial refunds, multi-stage chargeback reversals, or foreign-exchange fluctuations occurring between payment authorization and bank settlement.

A production implementation would require refund lifecycle tracking, chargeback state management, and currency-specific FX conversion rules.

### 9.2 Batched Net-of-Fee Gateway Payouts

Real payment processors such as Stripe and Razorpay may deduct processing fees, GST/VAT, and rolling reserves before depositing a consolidated payout into the bank account.

The current engine does not fully model these net settlement structures.

A production implementation would require processor-specific payout reconciliation and fee allocation logic.

### 9.3 Calendar-Aware Settlement & Fuzzy Descriptor Matching

Real banking systems introduce timezone differences, regional bank holidays, delayed settlement windows, and truncated transaction descriptors.

Strict transaction-ID matching and fixed settlement windows may not be sufficient for every real-world scenario.

A production implementation would benefit from calendar-aware settlement logic and probabilistic descriptor matching with confidence scoring and human review.

---

## 10. Repository Artifacts

The repository contains the following major components:

| Directory / File | Description |
|---|---|
| `src/` | Core application source code. |
| Reconciliation Engine | Integer micro-cent reconciliation and matching logic. |
| Synthetic Data Generator | Generates default, clean, stress-test, and anomaly datasets. |
| UI Components | Interactive FinTech workbench and scenario laboratory. |
| Vitest Test Suite | Automated unit and boundary tests. |
| `raw_prompt.md` | Unedited iterative prompt sequence used during development. |
| `distilled_prompt.md` | Consolidated single-shot architectural specification. |
| `bolt_execution_thread.md` | AI coding execution log, including workspace recovery iterations. |

---

## 11. Final Outcome

Ledgerline demonstrates a deterministic and transparent approach to month-end payment reconciliation.

The project brings together:

- Financial precision through integer micro-cent arithmetic.
- Deterministic three-pass transaction matching.
- Detection of structural and timing-related discrepancies.
- Referential integrity and duplicate validation.
- Signed reconciliation bridge calculations.
- ERP-ready double-entry journal postings.
- SHA-256 audit run fingerprinting.
- Automated Vitest validation.
- Interactive scenario-based anomaly testing.
- Custom CSV ingestion and audit exports.

**Core Success Criteria:**

```text
Platform Ledger Reconciliation
              +
Bank Settlement Validation
              +
Deterministic Anomaly Detection
              +
Signed Accounting Adjustments
              |
              ▼
    ZERO UNEXPLAINED VARIANCE
              |
              ▼
             $0.00
```

**Ledgerline — Making Every Payment Accountable.**

---

## 12. Project Links

- **Live Application:** https://fintech-audit-workbe-pkma.bolt.host
- **GitHub Repository:** https://github.com/yash-D-Dalavi/ledgerline-payment-reconciliation

---

**Developed as part of the Onelab Ventures — AI Native Engineer Assessment (November 2026).**
