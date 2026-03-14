# backend/services/analyzer.py
"""
Core analysis engine. All functions are pure (take df, return data).
No I/O here — session storage is handled by routers.
"""
import pandas as pd
from utils.constants import (
    PASS_GRADES, FAIL_GRADES, ABSENT_GRADES,
    DETAINED_GRADES, NOT_EXAMINED_GRADES, NON_CREDIT_GRADES,
    KNOWN_CATEGORIES, CATEGORY_DISPLAY
)


# ── Grade classification ─────────────────────────────────────────────────────

def classify_grade(grade: str, credits_registered: float) -> str:
    g = str(grade).strip().upper()
    if g in FAIL_GRADES:
        return "FAIL"
    if g in ABSENT_GRADES:
        return "ABSENT"
    if g in DETAINED_GRADES:
        return "DX"
    if g in NOT_EXAMINED_GRADES:
        return "NE"
    if g in NON_CREDIT_GRADES or credits_registered == 0:
        return "NON_CREDIT_PASS"
    if g in PASS_GRADES:
        return "PASS"
    return "UNKNOWN"


def add_status_column(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["status"] = df.apply(
        lambda r: classify_grade(r["grade"], r.get("credits_registered", 0)),
        axis=1
    )
    return df


# ── Subject-wise analysis ────────────────────────────────────────────────────

def analyze_subjects(df: pd.DataFrame, enrichment: dict) -> list[dict]:
    """
    Per subject: appeared, passed, failed, AB, DX, NP, pass%.
    enrichment: { "COURSE_CODE": { "staff_name": str, "class_strength": int } }
    """
    df = add_status_column(df)
    # Only analyze credit-bearing subjects
    credit_df = df[df["credits_registered"] > 0].copy()

    results = []
    for course_code, group in credit_df.groupby("course_code"):
        course_title = group["course_title"].iloc[0]

        appeared   = len(group[~group["status"].isin(["DX", "NE"])])
        passed     = len(group[group["status"].isin(["PASS"])])
        failed     = len(group[group["status"] == "FAIL"])
        absent     = len(group[group["status"] == "ABSENT"])
        dx_count   = len(group[group["status"] == "DX"])
        np_count   = len(group[group["status"] == "NON_CREDIT_PASS"])

        pass_pct = round(passed / appeared * 100, 2) if appeared > 0 else 0.0

        enrich = enrichment.get(course_code, {})

        results.append({
            "sl_no": None,
            "course_code": course_code,
            "course_title": course_title,
            "staff_name": enrich.get("staff_name", ""),
            "class_strength": enrich.get("class_strength", len(group)),
            "appeared": appeared,
            "passed": passed,
            "failed": failed,
            "absent": absent,
            "dx": dx_count,
            "np": np_count,
            "pass_percentage": pass_pct,
        })

    results.sort(key=lambda x: x["course_code"])
    for i, r in enumerate(results):
        r["sl_no"] = i + 1

    return results


# ── Toppers list ─────────────────────────────────────────────────────────────

def compute_toppers(df: pd.DataFrame, top_n: int = 5) -> list[dict]:
    """
    Top N students by SGPA, tiebreak by CGPA, then USN for deterministic order.
    If rank N ties with rank N+1, include all tied students.
    """
    students = df.drop_duplicates(subset=["usn"])[
        ["usn", "name", "sgpa", "cgpa"]
    ].copy()

    students["sgpa"] = pd.to_numeric(students["sgpa"], errors="coerce").fillna(0)
    students["cgpa"] = pd.to_numeric(students["cgpa"], errors="coerce").fillna(0)
    students["usn"] = students["usn"].astype(str)

    students = students.sort_values(
        ["sgpa", "cgpa", "usn"], ascending=[False, False, True]
    ).reset_index(drop=True)

    if students.empty or top_n <= 0:
        return []

    cutoff_idx = min(top_n, len(students)) - 1
    cutoff_sgpa = students.iloc[cutoff_idx]["sgpa"]
    cutoff_cgpa = students.iloc[cutoff_idx]["cgpa"]

    eligible = students[
        (students["sgpa"] > cutoff_sgpa)
        | ((students["sgpa"] == cutoff_sgpa) & (students["cgpa"] >= cutoff_cgpa))
    ]

    toppers = []
    prev_sgpa, prev_cgpa, rank = None, None, 0
    display_rank = 0

    for _, row in eligible.iterrows():
        sgpa = round(float(row["sgpa"]), 2)
        cgpa = round(float(row["cgpa"]), 2)
        rank += 1

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


# ── Backlog analysis ─────────────────────────────────────────────────────────

def compute_backlog(df: pd.DataFrame) -> dict:
    """
    Count backlog subjects per student.

    A backlog is any credit-bearing subject where the student earned 0 credits,
    excluding non-credit outcomes.

    This captures F, AB, DX, and NE on credit-bearing subjects.
    """
    df = df.copy()

    credit_df = df[df["credits_registered"] > 0].copy()
    credit_df["_grade"] = credit_df["grade"].astype(str).str.strip().str.upper()

    non_backlog_grades = {"NP", "PP", "P"}
    credit_df = credit_df[~credit_df["_grade"].isin(non_backlog_grades)]

    credit_df["is_backlog"] = (
        pd.to_numeric(credit_df["credits_earned"], errors="coerce").fillna(0) == 0
    )

    per_student = credit_df.groupby("usn").agg(
        backlog_count=("is_backlog", "sum"),
        name=("name", "first")
    ).reset_index()
    per_student["backlog_count"] = per_student["backlog_count"].astype(int)

    distribution = {str(i): 0 for i in range(1, 7)}
    distribution["6+"] = 0

    student_details = []
    for _, row in per_student[per_student["backlog_count"] > 0].iterrows():
        count = int(row["backlog_count"])
        bucket = str(count) if count <= 6 else "6+"
        distribution[bucket] = distribution.get(bucket, 0) + 1

        backlog_subjects = credit_df[
            (credit_df["usn"] == row["usn"]) & credit_df["is_backlog"]
        ][["course_title", "_grade"]].apply(
            lambda r: f"{r['course_title']} ({r['_grade']})", axis=1
        ).tolist()

        student_details.append({
            "usn": str(row["usn"]),
            "name": str(row["name"]),
            "backlog_count": count,
            "subjects": backlog_subjects
        })

    student_details.sort(key=lambda x: x["backlog_count"], reverse=True)

    return {
        "distribution": distribution,
        "student_details": student_details
    }


# ── Category-wise result ─────────────────────────────────────────────────────

def compute_category_wise(df: pd.DataFrame) -> list[dict] | None:
    """
    Group students by admission category from 'remarks' column.
    Returns None if no recognizable category data found.
    """
    if "remarks" not in df.columns:
        return None

    df = df.copy()
    df["_category"] = df["remarks"].astype(str).str.strip().str.upper()

    has_category = df["_category"].isin(KNOWN_CATEGORIES).any()
    if not has_category:
        return None

    fail_usns = set(df[df["grade"].str.strip().str.upper() == "F"]["usn"])

    students = df.drop_duplicates(subset=["usn"])[["usn", "_category"]].copy()
    students = students[students["_category"].isin(KNOWN_CATEGORIES)]
    students["result"] = students["usn"].apply(
        lambda u: "fail" if u in fail_usns else "pass"
    )

    category_results = []
    for category, group in students.groupby("_category"):
        total = len(group)
        passed = len(group[group["result"] == "pass"])
        failed = len(group[group["result"] == "fail"])
        category_results.append({
            "category": CATEGORY_DISPLAY.get(category, category),
            "total": total,
            "pass": passed,
            "fail": failed,
        })

    return category_results


# ── Overall stats ────────────────────────────────────────────────────────────

def compute_overall_stats(df: pd.DataFrame) -> dict:
    """Class-level summary stats."""
    df = add_status_column(df)
    total_students = df["usn"].nunique()

    # Students who are purely DX/NE across all credit subjects = did not appear
    did_not_appear = set()
    for usn, group in df[df["credits_registered"] > 0].groupby("usn"):
        if group["status"].isin(["DX", "NE"]).all():
            did_not_appear.add(usn)

    appeared = total_students - len(did_not_appear)
    fail_usns = set(df[df["status"] == "FAIL"]["usn"]) - did_not_appear
    passed = appeared - len(fail_usns)
    failed = len(fail_usns)
    pass_pct = round(passed / appeared * 100, 2) if appeared > 0 else 0.0

    sgpa_vals = df.drop_duplicates("usn")["sgpa"]
    sgpa_vals = pd.to_numeric(sgpa_vals, errors="coerce").dropna()

    return {
        "total_students": total_students,
        "appeared": appeared,
        "passed": passed,
        "failed": failed,
        "absent": len(did_not_appear),
        "pass_percentage": pass_pct,
        "avg_sgpa": round(float(sgpa_vals.mean()), 2) if len(sgpa_vals) > 0 else 0,
        "max_sgpa": round(float(sgpa_vals.max()), 2) if len(sgpa_vals) > 0 else 0,
        "min_sgpa": round(float(sgpa_vals.min()), 2) if len(sgpa_vals) > 0 else 0,
    }


# ── Grade distribution ───────────────────────────────────────────────────────

def compute_grade_distribution(df: pd.DataFrame) -> dict:
    """Count occurrences of each grade across all credit subjects."""
    credit_df = df[df["credits_registered"] > 0]
    counts = credit_df["grade"].str.strip().str.upper().value_counts().to_dict()
    return counts


# ── Full report builder ──────────────────────────────────────────────────────

def build_full_report(df: pd.DataFrame, enrichment: dict, group_filter: str | None = None) -> dict:
    """
    Run all analyses and return combined report dict.
    If group_filter is provided (e.g. "IS"), only analyze that group.
    """
    from services.merger import detect_grouping

    df = detect_grouping(df)
    if group_filter and "group" in df.columns:
        df = df[df["group"] == group_filter]

    return {
        "overall": compute_overall_stats(df),
        "subjects": analyze_subjects(df, enrichment),
        "toppers": compute_toppers(df),
        "backlog": compute_backlog(df),
        "category_wise": compute_category_wise(df),
        "grade_distribution": compute_grade_distribution(df),
    }
