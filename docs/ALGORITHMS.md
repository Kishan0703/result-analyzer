# Algorithms & Business Logic

## 1. Header Detection Algorithm
xlsx files may have metadata rows before the actual header.
```python
def find_header_row(ws) -> int:
    """
    Scan first 10 rows. Return index of row that contains
    the most recognized column keywords.
    """
    keywords = {"usn", "name", "grade", "semester", "sgpa", "cgpa", "course"}
    best_row, best_score = 0, 0
    for i, row in enumerate(ws.iter_rows(min_row=1, max_row=10, values_only=True)):
        row_values = [str(v).lower().strip() for v in row if v is not None]
        score = sum(1 for v in row_values if any(k in v for k in keywords))
        if score > best_score:
            best_score, best_row = score, i
    return best_row  # 0-indexed
```

## 2. Column Normalization Algorithm
```python
def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Map actual column names to internal standard names using COLUMN_ALIASES.
    Raises ValueError listing any required columns not found.
    """
    rename_map = {}
    for standard_name, aliases in COLUMN_ALIASES.items():
        for col in df.columns:
            if str(col).strip().lower() in [a.lower() for a in aliases]:
                rename_map[col] = standard_name
                break
    
    df = df.rename(columns=rename_map)
    
    required = ["usn", "name", "course_code", "course_title", "grade", 
                "credits_registered", "credits_earned", "sgpa", "cgpa"]
    missing = [r for r in required if r not in df.columns]
    if missing:
        raise ValueError(f"Required columns not found: {missing}")
    
    return df
```

## 3. Multi-File Merge Algorithm
```python
def merge_files(file_paths: list[str]) -> tuple[pd.DataFrame, list[dict]]:
    """
    Returns (merged_df, warnings_list)
    warnings_list: [{"type": "duplicate", "usn": "...", "course": "...", "action": "kept higher SEE"}]
    """
    frames = []
    warnings = []
    semester_values = set()

    for path in file_paths:
        wb = openpyxl.load_workbook(path)
        ws = wb.active
        header_row = find_header_row(ws)
        df = pd.read_excel(path, header=header_row)
        df = normalize_columns(df)
        df = clean_dataframe(df)
        semester_values.update(df["semester"].dropna().unique())
        frames.append(df)

    if len(semester_values) > 1:
        warnings.append({
            "type": "mixed_semester",
            "message": f"Files contain mixed semesters: {semester_values}. Verify this is intended."
        })

    combined = pd.concat(frames, ignore_index=True)

    # Deduplicate on (usn, course_code)
    combined["_see_numeric"] = pd.to_numeric(combined["see"], errors="coerce").fillna(-1)
    combined = combined.sort_values("_see_numeric", ascending=False)
    
    duplicates = combined[combined.duplicated(subset=["usn", "course_code"], keep=False)]
    for (usn, course), group in duplicates.groupby(["usn", "course_code"]):
        if len(group) > 1:
            warnings.append({
                "type": "duplicate",
                "usn": str(usn),
                "course_code": str(course),
                "action": "Kept entry with higher SEE score"
            })

    combined = combined.drop_duplicates(subset=["usn", "course_code"], keep="first")
    combined = combined.drop(columns=["_see_numeric"])

    return combined, warnings
```

## 4. Section Detection Algorithm
```python
def detect_grouping(df: pd.DataFrame) -> pd.DataFrame:
    """
    Adds a 'group' column to the dataframe.
    Priority: explicit 'section' col > explicit 'cluster' col > USN dept code
    """
    if "section" in df.columns and df["section"].notna().any():
        df["group"] = df["section"].str.strip().str.upper()
    elif "cluster" in df.columns and df["cluster"].notna().any():
        df["group"] = df["cluster"].str.strip().str.upper()
    else:
        df["group"] = df["usn"].apply(extract_dept_from_usn)
    
    return df
```

## 5. Subject-wise Analysis Algorithm
```python
def analyze_subjects(df: pd.DataFrame, enrichment: dict) -> list[dict]:
    """
    For each unique course, compute appeared/passed/failed/AB/DX/NP counts and pass%.
    enrichment: {"BCS301": {"staff_name": "Dr. Anitha", "class_strength": 72}, ...}
    
    Returns list of dicts, one per subject.
    """
    results = []
    
    # Exclude non-credit subjects from main table (credits_registered == 0)
    # but include them separately if needed
    credit_subjects = df[df["credits_registered"] > 0]
    
    for course_code, group in credit_subjects.groupby("course_code"):
        course_title = group["course_title"].iloc[0]
        
        statuses = group["grade"].apply(
            lambda g: classify_grade(g, group.loc[group["grade"]==g, "credits_registered"].iloc[0])
            if len(group.loc[group["grade"]==g]) > 0 else "UNKNOWN"
        )
        # Better approach: apply row-wise
        group = group.copy()
        group["status"] = group.apply(
            lambda r: classify_grade(r["grade"], r["credits_registered"]), axis=1
        )
        
        appeared = len(group[~group["status"].isin(["DX", "NE"])])
        passed = len(group[group["status"].isin(["PASS", "NON_CREDIT_PASS"])])
        failed = len(group[group["status"] == "FAIL"])
        absent = len(group[group["status"] == "ABSENT"])
        dx = len(group[group["status"] == "DX"])
        np_count = len(group[group["status"] == "NON_CREDIT_PASS"])
        
        pass_pct = round((passed / appeared * 100), 2) if appeared > 0 else 0.0
        
        enrich = enrichment.get(course_code, {})
        
        results.append({
            "sl_no": None,  # filled after sorting
            "course_code": course_code,
            "course_title": course_title,
            "staff_name": enrich.get("staff_name", ""),
            "class_strength": enrich.get("class_strength", len(group)),
            "appeared": appeared,
            "passed": passed,
            "failed": failed,
            "absent": absent,
            "dx": dx,
            "np": np_count,
            "pass_percentage": pass_pct,
        })
    
    results.sort(key=lambda x: x["course_code"])
    for i, r in enumerate(results):
        r["sl_no"] = i + 1
    
    return results
```

## 6. Topper's List Algorithm
```python
def compute_toppers(df: pd.DataFrame, top_n: int = 5) -> list[dict]:
    """
    Get unique students, rank by SGPA desc, tiebreak by CGPA desc.
    Return top_n students.
    """
    # One row per student (SGPA/CGPA is same across all subject rows for a student)
    students = df.drop_duplicates(subset=["usn"])[
        ["usn", "name", "sgpa", "cgpa"]
    ].copy()
    
    students = students.sort_values(
        ["sgpa", "cgpa"], ascending=[False, False]
    ).reset_index(drop=True)
    
    toppers = []
    for i, row in students.head(top_n).iterrows():
        toppers.append({
            "rank": len(toppers) + 1,
            "usn": row["usn"],
            "name": row["name"],
            "sgpa": round(float(row["sgpa"]), 2),
            "cgpa": round(float(row["cgpa"]), 2),
        })
    
    return toppers
```

## 7. Backlog Analysis Algorithm
```python
def compute_backlog(df: pd.DataFrame) -> dict:
    """
    Count F-grade subjects per student.
    Returns:
    {
        "distribution": {"1": 3, "2": 1, "3": 0, "4": 0, "5": 0, "6+": 0},
        "student_details": [{"usn": ..., "name": ..., "backlog_count": 2, "subjects": [...]}]
    }
    """
    df = df.copy()
    df["is_fail"] = df["grade"].str.strip().str.upper() == "F"
    
    backlog_counts = df.groupby("usn")["is_fail"].sum().reset_index()
    backlog_counts.columns = ["usn", "backlog_count"]
    backlog_counts = backlog_counts.merge(
        df[["usn", "name"]].drop_duplicates(), on="usn"
    )
    
    distribution = {str(i): 0 for i in range(1, 7)}
    distribution["6+"] = 0
    
    student_details = []
    for _, row in backlog_counts[backlog_counts["backlog_count"] > 0].iterrows():
        count = int(row["backlog_count"])
        bucket = str(count) if count <= 6 else "6+"
        if bucket in distribution:
            distribution[bucket] += 1
        else:
            distribution["6+"] += 1
        
        failed_subjects = df[
            (df["usn"] == row["usn"]) & (df["is_fail"])
        ]["course_title"].tolist()
        
        student_details.append({
            "usn": row["usn"],
            "name": row["name"],
            "backlog_count": count,
            "subjects": failed_subjects
        })
    
    student_details.sort(key=lambda x: x["backlog_count"], reverse=True)
    
    return {
        "distribution": distribution,
        "student_details": student_details
    }
```

## 8. Category-wise Analysis Algorithm
```python
def compute_category_wise(df: pd.DataFrame) -> list[dict] | None:
    """
    Groups students by quota category from 'remarks' column.
    Returns None if no category data found.
    
    KNOWN_CATEGORIES: CET, Comed-K, Mgmt, DIP, PIO, SNQ, MNG+PIO+JK
    """
    KNOWN_CATEGORIES = {"CET", "COMED-K", "COMEDK", "MGMT", "MANAGEMENT", 
                        "DIP", "DIPLOMA", "PIO", "SNQ", "MNG+PIO+JK"}
    
    if "remarks" not in df.columns:
        return None
    
    df = df.copy()
    df["category"] = df["remarks"].str.strip().str.upper()
    
    has_category = df["category"].isin(KNOWN_CATEGORIES).any()
    if not has_category:
        return None
    
    # One row per student
    students = df.drop_duplicates(subset=["usn"])[["usn", "category", "sgpa"]].copy()
    
    # A student passes if SGPA > 0 (has earned at least some credits)
    # A student fails if they have any F grade
    fail_usns = set(df[df["grade"].str.strip().str.upper() == "F"]["usn"])
    students["result"] = students["usn"].apply(
        lambda u: "fail" if u in fail_usns else "pass"
    )
    
    category_results = []
    for category, group in students.groupby("category"):
        if category not in KNOWN_CATEGORIES:
            continue
        total = len(group)
        passed = len(group[group["result"] == "pass"])
        failed = len(group[group["result"] == "fail"])
        category_results.append({
            "category": category,
            "total": total,
            "pass": passed,
            "fail": failed,
        })
    
    return category_results
```

## 9. Overall Stats Algorithm
```python
def compute_overall_stats(df: pd.DataFrame) -> dict:
    """
    Compute class-level summary stats shown at top of report.
    """
    total_students = df["usn"].nunique()
    
    # Students with any F grade
    fail_usns = set(df[df["grade"].str.strip().str.upper() == "F"]["usn"])
    
    # Students who appeared (not all DX)
    dx_only_usns = set()
    for usn, group in df.groupby("usn"):
        credit_subjects = group[group["credits_registered"] > 0]
        if len(credit_subjects) > 0:
            all_dx = credit_subjects["grade"].str.strip().str.upper().isin({"DX", "NE"}).all()
            if all_dx:
                dx_only_usns.add(usn)
    
    appeared = total_students - len(dx_only_usns)
    passed = appeared - len(fail_usns - dx_only_usns)
    failed = len(fail_usns - dx_only_usns)
    pass_pct = round(passed / appeared * 100, 2) if appeared > 0 else 0
    
    sgpa_values = df.drop_duplicates("usn")["sgpa"].dropna()
    
    return {
        "total_students": total_students,
        "appeared": appeared,
        "passed": passed,
        "failed": failed,
        "pass_percentage": pass_pct,
        "avg_sgpa": round(float(sgpa_values.mean()), 2) if len(sgpa_values) > 0 else 0,
        "max_sgpa": round(float(sgpa_values.max()), 2) if len(sgpa_values) > 0 else 0,
        "min_sgpa": round(float(sgpa_values.min()), 2) if len(sgpa_values) > 0 else 0,
    }
```

## 10. Session TTL Cleanup
```python
# Run as FastAPI background task on startup
import asyncio, time, shutil, os

async def cleanup_expired_sessions(session_dir: str, ttl_hours: int = 24):
    while True:
        now = time.time()
        if os.path.exists(session_dir):
            for session_id in os.listdir(session_dir):
                session_path = os.path.join(session_dir, session_id)
                meta_path = os.path.join(session_path, "metadata.json")
                try:
                    with open(meta_path) as f:
                        meta = json.load(f)
                    created_at = meta.get("created_at", 0)
                    if now - created_at > ttl_hours * 3600:
                        shutil.rmtree(session_path)
                except Exception:
                    pass  # Skip malformed sessions
        await asyncio.sleep(3600)  # Check every hour
```
