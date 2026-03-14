# Data Specification

## Input xlsx Format

### Expected Columns (row 4 is header in dummy, but app should auto-detect header row)
| Column Name | Type | Notes |
|---|---|---|
| USN | string | Unique Student Number, e.g. `1BY23IS062` |
| Name | string | Student full name |
| Semester | int | 1–8 |
| Course Code | string | e.g. `BCS301` |
| Course Title | string | Subject full name |
| CIA | int/float | Internal marks |
| SEE | int/float/string | External marks. Can be `NE`, `AB`, or numeric |
| Total | int/float | CIA + SEE |
| Credits Registered | int | |
| Credits Earned | int | 0 if failed/absent |
| Grade | string | O, A+, A, B+, B, C, P, F, AB, DX, NP, PP, NE |
| Grade Point | float | 0–10 |
| SGPA | float | Current semester GPA |
| CGPA | float | Cumulative GPA |
| Attendance in % | float | |
| Remarks | string | Optional. May contain quota: CET, Comed-K, Mgmt, DIP, PIO, SNQ |

### Optional Columns (if present, override USN-based detection)
| Column Name | Notes |
|---|---|
| Section | A, B, C etc. |
| Cluster | Cluster name or number |

## Column Name Aliases
The backend must handle case-insensitive and alternate spellings:
```python
COLUMN_ALIASES = {
    "usn": ["usn", "USN", "Usn", "student id", "roll no", "roll number"],
    "name": ["name", "Name", "student name", "NAME"],
    "semester": ["semester", "Semester", "sem", "SEM"],
    "course_code": ["course code", "Course Code", "subject code", "Subject Code", "code"],
    "course_title": ["course title", "Course Title", "subject", "Subject", "subject name"],
    "cia": ["cia", "CIA", "internal", "Internal Marks"],
    "see": ["see", "SEE", "external", "External Marks"],
    "total": ["total", "Total", "total marks"],
    "credits_registered": ["credits registered", "Credits Registered", "max credits", "credits"],
    "credits_earned": ["credits earned", "Credits Earned", "earned"],
    "grade": ["grade", "Grade", "GRADE"],
    "grade_point": ["grade point", "Grade Point", "gp", "GP"],
    "sgpa": ["sgpa", "SGPA"],
    "cgpa": ["cgpa", "CGPA"],
    "attendance": ["attendance in %", "Attendance in %", "attendance", "Attendance", "att %"],
    "remarks": ["remarks", "Remarks", "REMARKS", "category", "quota"],
    "section": ["section", "Section", "sec", "SEC"],
    "cluster": ["cluster", "Cluster", "CLUSTER"],
}
```

## USN Structure
```
1 B Y 2 3 I S 0 6 2
│ │ │ │  │ ││ │ │ └─ Roll number (3 digits)
│ │ │ │  │ │└─┘     Department code (2 letters): IS, CS, EC, ME, CV etc.
│ │ │ └──┘           Year of joining (2 digits): 23 = 2023
│ │ └─ Institution code
│ └─ University code
└─ Scheme
```

### Department Code Extraction
```python
import re

def extract_dept_from_usn(usn: str) -> str:
    # Pattern: digits + letters (institution) + 2digits (year) + 2letters (dept) + 3digits (roll)
    match = re.search(r'[A-Z]{1,2}\d{2}([A-Z]{2})\d{3}', str(usn).upper())
    if match:
        return match.group(1)  # e.g. "IS", "CS", "EC"
    return "UNKNOWN"
```

## Grade → Status Mapping
```python
PASS_GRADES = {"O", "A+", "A", "B+", "B", "C", "P", "PP", "NP"}
FAIL_GRADES = {"F"}
ABSENT_GRADES = {"AB"}
DETAINED_GRADES = {"DX"}
NOT_EXAMINED_GRADES = {"NE"}
NON_CREDIT_GRADES = {"NP", "PP"}  # Passed but no credits (like mandatory subjects)

def classify_grade(grade: str, credits_registered: int) -> str:
    g = str(grade).strip().upper()
    if g in FAIL_GRADES:
        return "FAIL"
    if g in ABSENT_GRADES:
        return "ABSENT"
    if g in DETAINED_GRADES:
        return "DX"
    if g in NOT_EXAMINED_GRADES:
        return "NE"
    if g in NON_CREDIT_GRADES:
        return "NON_CREDIT_PASS"
    if credits_registered == 0:
        return "NON_CREDIT_PASS"
    return "PASS"
```

## Multi-File Merge Rules
1. Stack all dataframes vertically after normalizing column names
2. Deduplicate on (USN, Course Code) — keep row with higher SEE numeric value
3. If SEE is non-numeric in both (e.g. both "NE"), keep first occurrence
4. Collect all conflict rows → return as warnings to frontend
5. Validate that all files have the same Semester value — warn if mixed

## Session Data Schema (stored as parquet)
```
/tmp/result_sessions/<session_id>/
    ├── raw_merged.parquet       # Merged and cleaned dataframe
    ├── enrichment.json          # Staff names, class strength per subject
    ├── metadata.json            # Semester, dept, section, upload timestamp
    └── analysis_cache.json      # Cached analysis results (invalidated on re-upload)
```
