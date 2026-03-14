"""
GET /api/analysis/{session_id}?group=IS    → run analysis and return JSON results
    - group param is optional; if omitted, returns all groups combined
    - results are cached in session; cache invalidated on re-upload or enrichment change
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from utils.session_store import (
    session_exists, load_merged_df, load_enrichment,
    save_analysis_cache, load_analysis_cache
)
from services.analyzer import build_full_report
from utils.session_store import load_merged_df as _load_merged_df_for_sgpa
import pandas as pd

router = APIRouter()

@router.get("/{session_id}")
def get_analysis(session_id: str, group: Optional[str] = Query(None)):
    if not session_exists(session_id):
        raise HTTPException(404, "Session not found or expired")

    # Try cache first (group-specific cache key)
    cache_key = f"group_{group}" if group else "all"
    cache = load_analysis_cache(session_id)
    if cache and cache.get("cache_key") == cache_key:
        return cache["data"]

    df = load_merged_df(session_id)
    enrichment = load_enrichment(session_id)

    try:
        report = build_full_report(df, enrichment, group_filter=group)
    except Exception as e:
        raise HTTPException(500, f"Analysis failed: {str(e)}")

    save_analysis_cache(session_id, {"cache_key": cache_key, "data": report})
    return report


@router.get("/{session_id}/sgpa-distribution")
def sgpa_distribution(session_id: str, group: Optional[str] = Query(None)):
    if not session_exists(session_id):
        raise HTTPException(404, "Session not found or expired")

    df = _load_merged_df_for_sgpa(session_id)
    if group and "group" in df.columns:
        df = df[df["group"] == group]

    students = df.drop_duplicates("usn")
    sgpa_vals = pd.to_numeric(students["sgpa"], errors="coerce").dropna()

    buckets = {"<5": 0, "5-6": 0, "6-7": 0, "7-8": 0, "8-9": 0, "9-10": 0}
    for v in sgpa_vals:
        if v < 5: buckets["<5"] += 1
        elif v < 6: buckets["5-6"] += 1
        elif v < 7: buckets["6-7"] += 1
        elif v < 8: buckets["7-8"] += 1
        elif v < 9: buckets["8-9"] += 1
        else: buckets["9-10"] += 1

    return buckets


@router.get("/{session_id}/chart-data")
def get_chart_data(session_id: str, group: Optional[str] = Query(None)):
    """
    Returns structured data for all 4 charts.
    If group is None -> returns section-comparison data too (Chart 5).
    If group is set -> returns data filtered to that group only.
    """
    if not session_exists(session_id):
        raise HTTPException(404, "Session not found or expired")

    df = load_merged_df(session_id)
    enrichment = load_enrichment(session_id)

    from services.merger import detect_grouping
    from services.analyzer import analyze_subjects, compute_backlog

    df = detect_grouping(df)

    if group and "group" in df.columns:
        working_df = df[df["group"] == group].copy()
    else:
        working_df = df.copy()

    subjects = analyze_subjects(working_df, enrichment)
    chart1 = {
        "labels": [s["course_code"] for s in subjects],
        "values": [s["pass_percentage"] for s in subjects],
        "full_titles": [s["course_title"] for s in subjects],
    }

    students = working_df.drop_duplicates("usn")
    sgpa_vals = pd.to_numeric(students["sgpa"], errors="coerce").dropna()

    buckets = {"<5": 0, "5-6": 0, "6-7": 0, "7-8": 0, "8-9": 0, "9-10": 0}
    for v in sgpa_vals:
        if v < 5:
            buckets["<5"] += 1
        elif v < 6:
            buckets["5-6"] += 1
        elif v < 7:
            buckets["6-7"] += 1
        elif v < 8:
            buckets["7-8"] += 1
        elif v < 9:
            buckets["8-9"] += 1
        else:
            buckets["9-10"] += 1

    avg_sgpa = round(float(sgpa_vals.mean()), 2) if len(sgpa_vals) > 0 else 0
    chart3 = {
        "labels": list(buckets.keys()),
        "values": list(buckets.values()),
        "avg_sgpa": avg_sgpa,
    }

    backlog = compute_backlog(working_df)
    dist = backlog["distribution"]
    chart4 = {
        "labels": ["1 Backlog", "2 Backlogs", "3 Backlogs", "4 Backlogs", "5 Backlogs", "6+ Backlogs"],
        "values": [
            dist.get("1", 0),
            dist.get("2", 0),
            dist.get("3", 0),
            dist.get("4", 0),
            dist.get("5", 0),
            dist.get("6+", 0),
        ],
    }

    chart5 = None
    if not group and "group" in df.columns:
        section_data = []
        for grp, grp_df in df.groupby("group"):
            grp_subjects = analyze_subjects(grp_df, enrichment)
            total_appeared = sum(s["appeared"] for s in grp_subjects if s["appeared"] > 0)
            total_passed = sum(s["passed"] for s in grp_subjects)
            overall_pct = round(total_passed / total_appeared * 100, 2) if total_appeared > 0 else 0
            section_data.append({"section": grp, "pass_percentage": overall_pct})

        section_data.sort(key=lambda x: x["section"])
        chart5 = {
            "labels": [f"{s['section']}-Sec" for s in section_data],
            "values": [s["pass_percentage"] for s in section_data],
        }

    return {
        "chart1": chart1,
        "chart3": chart3,
        "chart4": chart4,
        "chart5": chart5,
    }

