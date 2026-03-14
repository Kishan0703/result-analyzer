# Cursor Prompt — Fix Backlog Undercounting + Topper Tie-breaking

## Root cause analysis of all 3 bugs

---

### BUG 1 — Backlog undercounting (most critical)

**Location:** `backend/services/analyzer.py` → `compute_backlog()`

**Current wrong logic:**
```python
df["is_fail"] = df["grade"].str.strip().str.upper() == "F"
```
This only marks grade `"F"` as a backlog. But students with grade `"AB"` 
(absent in exam) also earn 0 credits on a credit-bearing subject and must 
count as a backlog. Same applies to `"DX"` (detained) on credit subjects.

**Rule (from the institution's marking system):**
A subject counts as a backlog if ALL of these are true:
1. `credits_registered > 0` (it is a credit-bearing subject)
2. `credits_earned == 0` (student earned no credits)
3. Grade is NOT in `{"NP", "PP"}` (non-credit pass subjects don't count as backlogs)

This naturally catches F, AB, DX, and NE — any outcome where the student 
failed to earn the credit.

**Fix — replace `compute_backlog` entirely:**

```python
def compute_backlog(df: pd.DataFrame) -> dict:
    """
    Count backlog subjects per student.

    A backlog is any credit-bearing subject where the student earned 0 credits,
    excluding non-credit subjects (NP/PP grades or credits_registered == 0).

    This correctly captures: F (fail), AB (absent), DX (detained), NE (not examined).
    """
    df = df.copy()

    # Only consider credit-bearing subjects
    credit_df = df[df["credits_registered"] > 0].copy()

    # Normalize grade
    credit_df["_grade"] = credit_df["grade"].astype(str).str.strip().str.upper()

    # Exclude non-credit pass outcomes — these are not backlogs
    NON_BACKLOG_GRADES = {"NP", "PP", "P"}
    credit_df = credit_df[~credit_df["_grade"].isin(NON_BACKLOG_GRADES)]

    # A subject is a backlog if credits_earned == 0
    credit_df["is_backlog"] = (
        pd.to_numeric(credit_df["credits_earned"], errors="coerce").fillna(0) == 0
    )

    # Count backlogs per student
    per_student = (
        credit_df.groupby("usn")
        .agg(
            backlog_count=("is_backlog", "sum"),
            name=("name", "first")
        )
        .reset_index()
    )
    per_student["backlog_count"] = per_student["backlog_count"].astype(int)

    # Build distribution buckets
    distribution = {str(i): 0 for i in range(1, 7)}
    distribution["6+"] = 0

    student_details = []
    for _, row in per_student[per_student["backlog_count"] > 0].iterrows():
        count = int(row["backlog_count"])
        bucket = str(count) if count <= 6 else "6+"
        distribution[bucket] = distribution.get(bucket, 0) + 1

        # List the actual backlog subjects for this student
        backlog_subjects = credit_df[
            (credit_df["usn"] == row["usn"]) & credit_df["is_backlog"]
        ][["course_title", "_grade"]].apply(
            lambda r: f"{r['course_title']} ({r['_grade']})", axis=1
        ).tolist()

        student_details.append({
            "usn": str(row["usn"]),
            "name": str(row["name"]),
            "backlog_count": count,
            "subjects": backlog_subjects,  # now shows grade too e.g. "CALCULUS (AB)"
        })

    student_details.sort(key=lambda x: x["backlog_count"], reverse=True)

    return {
        "distribution": distribution,
        "student_details": student_details,
    }
```

---

### BUG 2 — Topper tie-breaking inconsistency (combined + section B)

**Location:** `backend/services/analyzer.py` → `compute_toppers()`

**Current wrong logic:**
```python
students = students.sort_values(
    ["sgpa", "cgpa"], ascending=[False, False]
).reset_index(drop=True)

toppers = []
for _, row in students.head(top_n).iterrows():  # ← hard cutoff at top_n
    toppers.append({...})
```

**Problems:**
1. `head(top_n)` does a hard cutoff — if rank 5 and rank 6 share the same 
   SGPA+CGPA, rank 6 is silently dropped even though they're tied.
2. `drop_duplicates(subset=["usn"])` is correct, but `sort_values` is not 
   stable across ties — order depends on DataFrame row order, which varies 
   by section/file upload order. This causes different students to appear 
   in rank 4/5 depending on which section is being processed.
3. For Section B specifically: after `drop_duplicates`, if Karthik Kumar's 
   USN appears later in the DataFrame than other rank-4/5 students with the 
   same SGPA, he gets dropped by `head(5)` non-deterministically.

**Fix — replace `compute_toppers` entirely:**

```python
def compute_toppers(df: pd.DataFrame, top_n: int = 5) -> list[dict]:
    """
    Top N students by SGPA, tiebreak by CGPA, then by USN (alphabetical)
    for full determinism. If rank N ties with rank N+1, include all tied
    students (so result may have more than top_n rows in a tie scenario).
    """
    students = df.drop_duplicates(subset=["usn"])[
        ["usn", "name", "sgpa", "cgpa"]
    ].copy()

    students["sgpa"] = pd.to_numeric(students["sgpa"], errors="coerce").fillna(0)
    students["cgpa"] = pd.to_numeric(students["cgpa"], errors="coerce").fillna(0)

    # Sort: SGPA desc, CGPA desc, USN asc (deterministic tiebreak)
    students = students.sort_values(
        ["sgpa", "cgpa", "usn"],
        ascending=[False, False, True]
    ).reset_index(drop=True)

    if students.empty:
        return []

    # Find the score threshold at rank top_n
    # Include all students that tie at that boundary
    cutoff_idx = min(top_n, len(students)) - 1
    cutoff_sgpa = students.iloc[cutoff_idx]["sgpa"]
    cutoff_cgpa = students.iloc[cutoff_idx]["cgpa"]

    # Include everyone who is >= the cutoff score (handles ties at boundary)
    eligible = students[
        (students["sgpa"] > cutoff_sgpa) |
        ((students["sgpa"] == cutoff_sgpa) & (students["cgpa"] >= cutoff_cgpa))
    ]

    # But cap at top_n if there's no tie at the boundary
    # (i.e. the top_n-th and (top_n+1)-th students have different scores)
    if len(eligible) > top_n:
        # Only keep the extras if they are truly tied with the Nth student
        nth_sgpa = students.iloc[top_n - 1]["sgpa"]
        nth_cgpa = students.iloc[top_n - 1]["cgpa"]
        eligible = students[
            (students["sgpa"] > nth_sgpa) |
            ((students["sgpa"] == nth_sgpa) & (students["cgpa"] >= nth_cgpa))
        ]

    toppers = []
    prev_sgpa, prev_cgpa, rank = None, None, 0
    display_rank = 0

    for _, row in eligible.iterrows():
        sgpa = round(float(row["sgpa"]), 2)
        cgpa = round(float(row["cgpa"]), 2)
        rank += 1

        # Only increment display rank if score actually changed
        if sgpa != prev_sgpa or cgpa != prev_cgpa:
            display_rank = rank
            prev_sgpa, prev_cgpa = sgpa, cgpa

        toppers.append({
            "rank": display_rank,
            "usn": str(row["usn"]),
            "name": str(row["name"]),
            "sgpa": sgpa,
            "cgpa": cgpa,
        })

    return toppers
```

---

### BUG 3 — Chart data backlog uses old compute_backlog

**Location:** `routers/analysis.py` → `get_chart_data()` endpoint

The chart data endpoint calls `compute_backlog` directly. Since we're fixing
`compute_backlog` in `analyzer.py`, the chart data will automatically be fixed
too — **no separate change needed here** as long as the import points to the
updated function.

But double-check the import line in `routers/analysis.py`:
```python
from services.analyzer import (
    analyze_subjects, compute_backlog,      # ← must import from analyzer.py
    compute_overall_stats, add_status_column
)
```

---

## Verification checklist — how to confirm fixes are correct

After applying, run this quick sanity check in a Python shell or add as a 
test script at `backend/tests/test_backlog.py`:

```python
import pandas as pd
from services.analyzer import compute_backlog, compute_toppers

# ── Test 1: AB grades count as backlog ──────────────────────────────────────
data = {
    "usn":                ["S1",  "S1",  "S2",  "S2"],
    "name":               ["A",   "A",   "B",   "B"],
    "course_code":        ["C1",  "C2",  "C1",  "C2"],
    "course_title":       ["Math","Phy", "Math","Phy"],
    "grade":              ["F",   "AB",  "O",   "F"],
    "credits_registered": [4,     4,     4,     4],
    "credits_earned":     [0,     0,     4,     0],
}
df = pd.DataFrame(data)
result = compute_backlog(df)

# S1 has 2 backlogs (F + AB), S2 has 1 backlog (F)
assert result["distribution"]["2"] == 1, "S1 should have 2 backlogs"
assert result["distribution"]["1"] == 1, "S2 should have 1 backlog"
print("✓ Test 1 passed: AB grades counted as backlog")

# ── Test 2: NP/PP grades NOT counted as backlog ─────────────────────────────
data2 = {
    "usn":                ["S3",  "S3"],
    "name":               ["C",   "C"],
    "course_code":        ["C1",  "C2"],
    "course_title":       ["Math","Phy"],
    "grade":              ["NP",  "F"],
    "credits_registered": [0,     4],    # NP subject has 0 credits_registered
    "credits_earned":     [0,     0],
}
df2 = pd.DataFrame(data2)
result2 = compute_backlog(df2)
assert result2["distribution"]["1"] == 1, "Only F should count, not NP"
print("✓ Test 2 passed: NP not counted as backlog")

# ── Test 3: Deterministic tiebreak ──────────────────────────────────────────
data3 = {
    "usn":  ["USN_B", "USN_A", "USN_C"],
    "name": ["Bob",   "Alice", "Carol"],
    "sgpa": [9.5,     9.5,     9.5],
    "cgpa": [9.0,     9.0,     9.0],
    "course_code": ["X", "X", "X"],
    "grade": ["O", "O", "O"],
    "credits_registered": [4, 4, 4],
    "credits_earned": [4, 4, 4],
}
df3 = pd.DataFrame(data3)
toppers = compute_toppers(df3, top_n=2)
# All 3 are tied — all should appear since they tie at rank 2
assert len(toppers) == 3, f"All tied students should appear, got {len(toppers)}"
# USN order should be deterministic: USN_A, USN_B, USN_C
assert toppers[0]["usn"] == "USN_A", "USN_A should come first alphabetically"
print("✓ Test 3 passed: tied students all included, sorted by USN")

print("\nAll tests passed ✓")
```

Run with:
```bash
cd backend
python -m pytest tests/test_backlog.py -v
# or just:
python tests/test_backlog.py
```

---

## Summary of changes

| File | Function | Change |
|---|---|---|
| `services/analyzer.py` | `compute_backlog` | Use `credits_earned == 0` instead of `grade == "F"` |
| `services/analyzer.py` | `compute_toppers` | Add USN tiebreak, include all tied boundary students |
| `routers/analysis.py` | `get_chart_data` | No change needed — imports fixed function automatically |

**Only 2 functions in 1 file need editing.**
