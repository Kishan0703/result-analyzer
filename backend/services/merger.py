# backend/services/merger.py
"""
Handles reading one or more xlsx files, normalizing columns,
merging into a single clean dataframe, and detecting groupings.
"""
import re
import pandas as pd
import openpyxl
from utils.constants import COLUMN_ALIASES, REQUIRED_COLUMNS


# ── Header detection ────────────────────────────────────────────────────────

def find_header_row(ws) -> int:
    """Scan first 10 rows, return 0-indexed row with most recognized column keywords."""
    keywords = {"usn", "name", "grade", "semester", "sgpa", "cgpa", "course", "credits"}
    best_row, best_score = 0, 0
    for i, row in enumerate(ws.iter_rows(min_row=1, max_row=10, values_only=True)):
        row_values = [str(v).lower().strip() for v in row if v is not None]
        score = sum(1 for v in row_values if any(k in v for k in keywords))
        if score > best_score:
            best_score, best_row = score, i
    return best_row


# ── Column normalization ─────────────────────────────────────────────────────

def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Map actual column names → internal standard names. Raises on missing required cols."""
    rename_map = {}
    for standard_name, aliases in COLUMN_ALIASES.items():
        for col in df.columns:
            if str(col).strip().lower() in [a.lower() for a in aliases]:
                rename_map[col] = standard_name
                break

    df = df.rename(columns=rename_map)

    missing = [r for r in REQUIRED_COLUMNS if r not in df.columns]
    if missing:
        raise ValueError(f"Required columns not found: {missing}")

    return df


# ── Data cleaning ────────────────────────────────────────────────────────────

def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    - Drop rows where USN is null/empty
    - Strip whitespace from string columns
    - Normalize grade to uppercase stripped string
    - Coerce numeric columns
    - Drop completely empty columns
    """
    df = df.dropna(subset=["usn"])
    df = df[df["usn"].astype(str).str.strip() != ""]

    # Drop fully empty columns
    df = df.dropna(axis=1, how="all")

    # Strip string columns
    str_cols = ["usn", "name", "course_code", "course_title", "grade"]
    for col in str_cols:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip()

    # Normalize grade
    if "grade" in df.columns:
        df["grade"] = df["grade"].str.upper()

    # Coerce numerics
    for col in ["credits_registered", "credits_earned", "sgpa", "cgpa", "cia", "total"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    # SEE can be 'NE', 'AB' or numeric — keep as-is but strip
    if "see" in df.columns:
        df["see"] = df["see"].astype(str).str.strip()

    return df


# ── Multi-file merge ─────────────────────────────────────────────────────────

def merge_files(file_paths: list[str]) -> tuple[pd.DataFrame, list[dict]]:
    """
    Read, normalize, and merge multiple xlsx files.
    Returns (merged_df, warnings_list).
    """
    frames = []
    warnings = []
    semester_values = set()

    for path in file_paths:
        try:
            wb = openpyxl.load_workbook(path, data_only=True)
            ws = wb.active
            header_row_idx = find_header_row(ws)

            df = pd.read_excel(path, header=header_row_idx)
            df = normalize_columns(df)
            df = clean_dataframe(df)

            if "semester" in df.columns:
                sems = df["semester"].dropna().unique().tolist()
                semester_values.update(sems)

            frames.append(df)

        except ValueError as e:
            warnings.append({
                "type": "file_error",
                "file": path,
                "message": str(e)
            })
        except Exception as e:
            warnings.append({
                "type": "file_error",
                "file": path,
                "message": f"Could not read file: {str(e)}"
            })

    if not frames:
        raise ValueError("No valid files could be processed. Check file format.")

    if len(semester_values) > 1:
        warnings.append({
            "type": "mixed_semester",
            "message": f"Files contain mixed semesters: {sorted(semester_values)}. Verify this is intended."
        })

    combined = pd.concat(frames, ignore_index=True)

    # Deduplicate: keep entry with higher numeric SEE score
    combined["_see_numeric"] = pd.to_numeric(combined["see"], errors="coerce").fillna(-1)
    combined = combined.sort_values("_see_numeric", ascending=False)

    dup_mask = combined.duplicated(subset=["usn", "course_code"], keep=False)
    for (usn, course), group in combined[dup_mask].groupby(["usn", "course_code"]):
        if len(group) > 1:
            warnings.append({
                "type": "duplicate",
                "usn": str(usn),
                "course_code": str(course),
                "action": "Kept entry with higher SEE score"
            })

    combined = combined.drop_duplicates(subset=["usn", "course_code"], keep="first")
    combined = combined.drop(columns=["_see_numeric"])
    combined = combined.reset_index(drop=True)

    return combined, warnings


# ── Section/group detection ──────────────────────────────────────────────────

def extract_dept_from_usn(usn: str) -> str:
    """Extract 2-letter department code from USN. e.g. '1BY23IS062' → 'IS'"""
    match = re.search(r'[A-Z]{1,3}\d{2}([A-Z]{2,3})\d{3}', str(usn).upper())
    if match:
        return match.group(1)
    return "UNKNOWN"


def detect_grouping(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add 'group' column.
    Priority: explicit 'section' col > explicit 'cluster' col > USN dept code.
    """
    df = df.copy()
    if "section" in df.columns and df["section"].notna().any():
        df["group"] = df["section"].astype(str).str.strip().str.upper()
    elif "cluster" in df.columns and df["cluster"].notna().any():
        df["group"] = df["cluster"].astype(str).str.strip().str.upper()
    else:
        df["group"] = df["usn"].apply(extract_dept_from_usn)
    return df
