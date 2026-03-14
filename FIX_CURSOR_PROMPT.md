# Cursor Prompt — Fix & Rebuild Result Analyzer Output

## Context
The backend currently generates output in a flat format (one combined report). 
The required output must match the PDF template format with **section-wise reports** 
and a specific 4-part layout per section. The PDF download is also broken.

---

## PROBLEM 1 — Wrong Output Format

### Current (wrong)
- One combined report for all students
- Subject-wise table mixes all sections together
- No section-by-section breakdown

### Required (from PDF template)
Each section (A-Sec, B-Sec, C-Sec, D-Sec etc.) gets its **own full report** containing:

**Part 1 — Overall Result Analysis Table (Subject-wise)**
Header shows:
- Institution name, Department name
- "Result Analysis (Before Challenge Valuation - March 2025)"
- Batch, Appeared (total), Pass, Fail, Absent, Withheld counts at top
- "Result Declared on: DD/MM/YYYY"

Table columns (exactly):
| Sl.No | Subject Title | Subject Code | Name of staff handling | Class Strength | No. of students appeared | No. of students passed | AB | DX | NP | No. of students failed | With Held | Percentage of pass % |

**Part 2 — Topper's List**
Table columns: Sl.No | USN | Name | SGPA | CGPA
Top 5 students of THAT section only

**Part 3 — Overall Category-wise Result**
Table columns: Quota | Pass | Fail | Total
Rows: CET+SNQ | Comed-K | MNG+PIO+JK | DIP

**Part 4 — Category-wise Analysis (Backlog)**
Table columns: Category | CET | Comed-K | Mgmt. | PMSSS-AICTE | PIO | SNQ | Dip | Total
Rows:
- No. of Student Appeared
- No. of Students Attended Exam  
- No. of Passes
- No. of Failures
- % of Pass
- Single Backlog
- Two Backlog
- Three Backlog
- Four Backlog
- Five Backlog
- Six & above Backlog

**After all section reports → One combined/overall report** with same 4 parts but for all sections merged.

---

## PROBLEM 2 — PDF Download Broken

The `FileResponse` in FastAPI does not work reliably when the temp file is created with 
`NamedTemporaryFile` because the file handle may still be open or deleted too early on Windows/Linux.

### Fix in `routers/export.py`

Replace the current pattern with this reliable pattern:

```python
# backend/routers/export.py

import os
import tempfile
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse
from typing import Optional

from utils.session_store import session_exists, load_merged_df, load_enrichment, load_metadata
from services.analyzer import build_full_report
from services.pdf_generator import generate_pdf
from services.excel_generator import generate_excel

router = APIRouter()

def _cleanup(path: str):
    try:
        os.unlink(path)
    except Exception:
        pass

@router.get("/{session_id}/pdf")
def export_pdf(
    session_id: str,
    background_tasks: BackgroundTasks,
    group: Optional[str] = Query(None)
):
    if not session_exists(session_id):
        raise HTTPException(404, "Session not found or expired")

    df = load_merged_df(session_id)
    enrichment = load_enrichment(session_id)
    metadata = load_metadata(session_id)

    # Use mkstemp — safer than NamedTemporaryFile
    fd, tmp_path = tempfile.mkstemp(suffix=".pdf")
    os.close(fd)  # Close file descriptor immediately

    try:
        generate_pdf(df, enrichment, metadata, output_path=tmp_path, group_filter=group)
    except Exception as e:
        os.unlink(tmp_path)
        raise HTTPException(500, f"PDF generation failed: {str(e)}")

    background_tasks.add_task(_cleanup, tmp_path)

    filename = f"result_report_{group or 'all'}.pdf"
    return FileResponse(
        path=tmp_path,
        media_type="application/pdf",
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.get("/{session_id}/excel")
def export_excel(
    session_id: str,
    background_tasks: BackgroundTasks,
    group: Optional[str] = Query(None)
):
    if not session_exists(session_id):
        raise HTTPException(404, "Session not found or expired")

    df = load_merged_df(session_id)
    enrichment = load_enrichment(session_id)
    metadata = load_metadata(session_id)

    fd, tmp_path = tempfile.mkstemp(suffix=".xlsx")
    os.close(fd)

    try:
        generate_excel(df, enrichment, metadata, output_path=tmp_path, group_filter=group)
    except Exception as e:
        os.unlink(tmp_path)
        raise HTTPException(500, f"Excel generation failed: {str(e)}")

    background_tasks.add_task(_cleanup, tmp_path)

    filename = f"result_report_{group or 'all'}.xlsx"
    return FileResponse(
        path=tmp_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
```

---

## PROBLEM 3 — Rebuild `pdf_generator.py`

The current `pdf_generator.py` generates one flat HTML report. 
Rebuild it to generate **one PDF with multiple sections**, one section per page-break.

### New signature
```python
def generate_pdf(df, enrichment, metadata, output_path, group_filter=None):
```

### Logic
```python
from services.analyzer import build_full_report
from services.merger import detect_grouping

def generate_pdf(df, enrichment, metadata, output_path, group_filter=None):
    df = detect_grouping(df)  # ensure 'group' column exists
    
    if group_filter:
        groups_to_render = [group_filter]
    else:
        groups_to_render = sorted(df["group"].unique().tolist())
        groups_to_render.append("ALL")  # combined report at the end
    
    all_html_sections = []
    
    for group in groups_to_render:
        if group == "ALL":
            group_df = df
            group_label = "All Sections (Combined)"
        else:
            group_df = df[df["group"] == group]
            group_label = f"Semester 3 ({group}-Sec)"
        
        report = build_full_report(group_df, enrichment)
        section_html = build_section_html(report, metadata, group_label)
        all_html_sections.append(section_html)
    
    full_html = build_full_html(all_html_sections)
    HTML(string=full_html).write_pdf(output_path)
```

### `build_section_html(report, metadata, group_label)` — full HTML for one section

```python
def build_section_html(report, metadata, group_label):
    """
    Returns HTML string for one section's complete report.
    Includes all 4 parts. Wrapped in a div with page-break-after.
    """
    overall = report["overall"]
    subjects = report["subjects"]
    toppers = report["toppers"]
    category_wise = report.get("category_wise") or []
    backlog = report["backlog"]
    
    date_str = datetime.date.today().strftime("%d/%m/%Y")
    institution = "BMS Institute of Technology and Management"
    department = "Department of Information Science & Engineering"
    
    # ── Part 1: Subject-wise table ──
    subject_rows = ""
    for s in subjects:
        subject_rows += f"""
        <tr>
            <td>{s['sl_no']}</td>
            <td class="text-left">{s['course_title']}</td>
            <td>{s['course_code']}</td>
            <td class="text-left">{s['staff_name'] or '—'}</td>
            <td>{s['class_strength']}</td>
            <td>{s['appeared']}</td>
            <td>{s['passed']}</td>
            <td>{s['absent']}</td>
            <td>{s['dx']}</td>
            <td>{s['np']}</td>
            <td>{s['failed']}</td>
            <td>—</td>
            <td class="{'pass-high' if s['pass_percentage'] >= 90 else 'pass-mid' if s['pass_percentage'] >= 75 else 'pass-low'}">{s['pass_percentage']}%</td>
        </tr>"""
    
    # ── Part 2: Toppers ──
    topper_rows = ""
    for t in toppers:
        topper_rows += f"""
        <tr>
            <td>{t['rank']}</td>
            <td>{t['usn']}</td>
            <td class="text-left">{t['name']}</td>
            <td>{t['sgpa']}</td>
            <td>{t['cgpa']}</td>
        </tr>"""
    
    # ── Part 3: Category-wise result ──
    if category_wise:
        cat_rows = "".join(
            f"<tr><td class='text-left'>{c['category']}</td><td>{c['pass']}</td><td>{c['fail']}</td><td>{c['total']}</td></tr>"
            for c in category_wise
        )
        part3_html = f"""
        <div class="section-block">
            <h3>3. Overall Category-wise Result</h3>
            <table>
                <thead><tr><th>Quota</th><th>Pass</th><th>Fail</th><th>Total</th></tr></thead>
                <tbody>{cat_rows}</tbody>
            </table>
        </div>"""
    else:
        part3_html = ""
    
    # ── Part 4: Category-wise backlog analysis ──
    # Build the cross-tab: rows = stat categories, cols = quota categories
    # This requires a more detailed breakdown - see note below
    part4_html = build_backlog_analysis_html(report, backlog)
    
    return f"""
    <div class="report-section">
        <!-- Header -->
        <div class="report-header">
            <div class="institution-logo"><!-- optional: img tag --></div>
            <div class="header-text">
                <h1>{institution}</h1>
                <h2>{department}</h2>
                <h3>Result Analysis (Before Challenge Valuation - March 2025)</h3>
                <p>Result Analysis - {group_label} [AY 2024–25] [ODD SEMESTER]</p>
            </div>
        </div>
        
        <!-- Overall summary bar -->
        <div class="summary-bar">
            <div class="summary-item"><span class="label">Sl.No</span><span class="value">01</span></div>
            <div class="summary-item"><span class="label">Batch</span><span class="value">2023</span></div>
            <div class="summary-item"><span class="label">Appeared</span><span class="value">{overall['appeared']}</span></div>
            <div class="summary-item"><span class="label">Pass</span><span class="value">{overall['passed']}</span></div>
            <div class="summary-item"><span class="label">Fail</span><span class="value">{overall['failed']}</span></div>
            <div class="summary-item"><span class="label">Absent</span><span class="value">{overall['absent']}</span></div>
            <div class="summary-item"><span class="label">Pass %</span><span class="value">{overall['pass_percentage']}%</span></div>
            <div class="summary-item"><span class="label">Result Declared</span><span class="value">{date_str}</span></div>
        </div>
        
        <!-- Part 1 -->
        <div class="section-block">
            <h3>1. Overall Result Analysis (Before Challenge Valuation)</h3>
            <table class="main-table">
                <thead>
                    <tr>
                        <th>Sl.No</th>
                        <th class="text-left">Subject Title</th>
                        <th>Subject Code</th>
                        <th class="text-left">Name of staff handling</th>
                        <th>Class Strength</th>
                        <th>No. of students appeared</th>
                        <th>No. of students passed</th>
                        <th>AB</th>
                        <th>DX</th>
                        <th>NP</th>
                        <th>No. of students failed</th>
                        <th>With Held</th>
                        <th>Percentage of pass %</th>
                    </tr>
                </thead>
                <tbody>{subject_rows}</tbody>
            </table>
        </div>
        
        <!-- Part 2 -->
        <div class="section-block">
            <h3>2. Topper's List</h3>
            <table class="toppers-table">
                <thead>
                    <tr><th>Sl.No</th><th>USN</th><th class="text-left">Name</th><th>SGPA</th><th>CGPA</th></tr>
                </thead>
                <tbody>{topper_rows}</tbody>
            </table>
        </div>
        
        {part3_html}
        {part4_html}
    </div>
    """


def build_backlog_analysis_html(report, backlog):
    """
    Part 4: Category-wise Analysis cross-tab table.
    Rows: No. of Student Appeared, No. of Students Attended Exam,
          No. of Passes, No. of Failures, % of Pass,
          Single Backlog, Two Backlog, Three Backlog,
          Four Backlog, Five Backlog, Six & above Backlog
    Columns: CET | Comed-K | Mgmt. | PMSSS-AICTE | PIO | SNQ | Dip | Total
    
    NOTE TO CURSOR: 
    To fill this table accurately, the analyzer.py needs a new function:
    
        compute_category_backlog_crosstab(df) -> dict
    
    This function groups students by category, then for each category computes:
    - appeared, attended_exam, passes, failures, pass_pct
    - backlog buckets (1,2,3,4,5,6+)
    
    If category data is missing, render a simplified backlog-only table 
    (just the distribution rows with totals).
    """
    dist = backlog["distribution"]
    total_with_backlog = sum(dist.values())
    
    # Simplified version if no category data
    rows_html = ""
    row_labels = [
        ("Single Backlog", "1"),
        ("Two Backlog", "2"),
        ("Three Backlog", "3"),
        ("Four Backlog", "4"),
        ("Five Backlog", "5"),
        ("Six & above Backlog", "6+"),
    ]
    for label, key in row_labels:
        rows_html += f"<tr><td class='text-left'>{label}</td><td>{dist.get(key, 0)}</td></tr>"
    
    return f"""
    <div class="section-block">
        <h3>4. Category-wise Analysis</h3>
        <table>
            <thead><tr><th class="text-left">Category</th><th>Total</th></tr></thead>
            <tbody>{rows_html}</tbody>
        </table>
    </div>"""


def build_full_html(sections: list[str]) -> str:
    """Wrap all section HTMLs in a complete HTML document with styles."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
    <meta charset="UTF-8">
    <style>
        @page {{
            size: A3 landscape;
            margin: 10mm 8mm;
        }}
        * {{ box-sizing: border-box; }}
        body {{
            font-family: Arial, sans-serif;
            font-size: 9px;
            color: #111;
            background: white;
        }}
        .report-section {{
            page-break-after: always;
        }}
        .report-section:last-child {{
            page-break-after: avoid;
        }}
        .report-header {{
            text-align: center;
            border-bottom: 2px solid #1e3a5f;
            padding-bottom: 6px;
            margin-bottom: 8px;
        }}
        .report-header h1 {{ font-size: 13px; margin: 2px 0; color: #1e3a5f; }}
        .report-header h2 {{ font-size: 11px; margin: 2px 0; }}
        .report-header h3 {{ font-size: 10px; margin: 2px 0; font-weight: normal; }}
        .report-header p {{ font-size: 9px; margin: 2px 0; color: #555; }}
        
        .summary-bar {{
            display: flex;
            gap: 0;
            border: 1px solid #ccc;
            margin-bottom: 10px;
            font-size: 8px;
        }}
        .summary-item {{
            flex: 1;
            text-align: center;
            padding: 4px 2px;
            border-right: 1px solid #ccc;
        }}
        .summary-item:last-child {{ border-right: none; }}
        .summary-item .label {{ display: block; color: #888; font-size: 7px; }}
        .summary-item .value {{ display: block; font-weight: bold; font-size: 11px; color: #1e3a5f; }}
        
        .section-block {{ margin-bottom: 14px; }}
        .section-block h3 {{
            font-size: 10px;
            background: #1e3a5f;
            color: white;
            padding: 4px 8px;
            margin: 0 0 4px 0;
        }}
        
        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 8px;
        }}
        th {{
            background: #2c4f7c;
            color: white;
            padding: 4px 3px;
            text-align: center;
            border: 1px solid #1e3a5f;
            font-size: 7.5px;
        }}
        td {{
            padding: 3px 3px;
            text-align: center;
            border: 1px solid #ddd;
        }}
        tr:nth-child(even) td {{ background: #f5f7fa; }}
        .text-left {{ text-align: left !important; }}
        
        .main-table th, .main-table td {{ font-size: 7.5px; }}
        .toppers-table {{ width: 60%; }}
        
        .pass-high {{ color: #15803d; font-weight: bold; }}
        .pass-mid  {{ color: #b45309; font-weight: bold; }}
        .pass-low  {{ color: #dc2626; font-weight: bold; }}
    </style>
    </head>
    <body>
        {''.join(sections)}
    </body>
    </html>
    """
```

---

## PROBLEM 4 — Rebuild `excel_generator.py` for section-wise sheets

### New signature
```python
def generate_excel(df, enrichment, metadata, output_path, group_filter=None):
```

### Logic — one sheet per section, named by section

```python
def generate_excel(df, enrichment, metadata, output_path, group_filter=None):
    from services.merger import detect_grouping
    from services.analyzer import build_full_report
    
    df = detect_grouping(df)
    wb = openpyxl.Workbook()
    wb.remove(wb.active)  # remove default sheet
    
    if group_filter:
        groups = [group_filter]
    else:
        groups = sorted(df["group"].unique().tolist())
        groups.append("ALL")
    
    for group in groups:
        if group == "ALL":
            group_df = df
            sheet_name = "Combined"
        else:
            group_df = df[df["group"] == group]
            sheet_name = f"{group}-Sec"
        
        report = build_full_report(group_df, enrichment)
        
        # Each group gets 4 sheets named: "A-Sec Subjects", "A-Sec Toppers" etc.
        # OR pack all into one sheet with sections separated by empty rows (simpler)
        # RECOMMENDED: one sheet per group, all 4 tables stacked vertically
        
        ws = wb.create_sheet(sheet_name[:31])  # Excel sheet name limit = 31 chars
        write_section_to_sheet(ws, report, group if group != "ALL" else "All Sections")
    
    wb.save(output_path)


def write_section_to_sheet(ws, report, group_label):
    """
    Write all 4 report parts into one worksheet, stacked vertically.
    Each part separated by an empty row and a bold title row.
    """
    from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
    
    current_row = [1]  # mutable so nested helpers can increment it
    
    HEADER_FILL = PatternFill("solid", fgColor="1E3A5F")
    HEADER_FONT = Font(bold=True, color="FFFFFF", size=9)
    SECTION_FONT = Font(bold=True, size=11, color="1E3A5F")
    CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
    
    def write_title(text):
        ws.cell(row=current_row[0], column=1, value=text).font = SECTION_FONT
        current_row[0] += 1
    
    def write_header(headers):
        for col, h in enumerate(headers, 1):
            cell = ws.cell(row=current_row[0], column=col, value=h)
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT
            cell.alignment = CENTER
        current_row[0] += 1
    
    def write_row(values, alternate=False):
        ALT = PatternFill("solid", fgColor="EEF2F7")
        for col, v in enumerate(values, 1):
            cell = ws.cell(row=current_row[0], column=col, value=v)
            if alternate:
                cell.fill = ALT
            cell.alignment = CENTER
        current_row[0] += 1
    
    def blank_row():
        current_row[0] += 1
    
    # Title
    ws.cell(row=current_row[0], column=1, value=f"Result Analysis — {group_label}")
    ws.cell(row=current_row[0], column=1).font = Font(bold=True, size=13)
    current_row[0] += 2
    
    # Part 1 — Subject-wise
    write_title("1. Subject-wise Result Analysis")
    write_header(["Sl No", "Subject Code", "Subject Title", "Staff Name",
                  "Class Strength", "Appeared", "Passed", "Failed",
                  "Absent", "DX", "NP", "Pass %"])
    for i, s in enumerate(report["subjects"]):
        write_row([s["sl_no"], s["course_code"], s["course_title"], s["staff_name"],
                   s["class_strength"], s["appeared"], s["passed"], s["failed"],
                   s["absent"], s["dx"], s["np"], f"{s['pass_percentage']}%"],
                  alternate=(i % 2 == 1))
    blank_row()
    
    # Part 2 — Toppers
    write_title("2. Topper's List")
    write_header(["Rank", "USN", "Name", "SGPA", "CGPA"])
    for i, t in enumerate(report["toppers"]):
        write_row([t["rank"], t["usn"], t["name"], t["sgpa"], t["cgpa"]],
                  alternate=(i % 2 == 1))
    blank_row()
    
    # Part 3 — Category-wise
    if report.get("category_wise"):
        write_title("3. Overall Category-wise Result")
        write_header(["Category", "Pass", "Fail", "Total"])
        for i, c in enumerate(report["category_wise"]):
            write_row([c["category"], c["pass"], c["fail"], c["total"]],
                      alternate=(i % 2 == 1))
        blank_row()
    
    # Part 4 — Backlog distribution
    write_title("4. Backlog Analysis")
    write_header(["Backlog Category", "No. of Students"])
    dist = report["backlog"]["distribution"]
    labels = [("Single Backlog","1"),("Two Backlog","2"),("Three Backlog","3"),
              ("Four Backlog","4"),("Five Backlog","5"),("Six & above Backlog","6+")]
    for i, (label, key) in enumerate(labels):
        write_row([label, dist.get(key, 0)], alternate=(i % 2 == 1))
    blank_row()
    
    # Auto-width
    from openpyxl.utils import get_column_letter
    for col in ws.columns:
        max_len = max((len(str(c.value or "")) for c in col), default=10)
        ws.column_dimensions[get_column_letter(col[0].column)].width = min(max_len + 2, 40)
```

---

## PROBLEM 5 — Frontend: Add Section Selector & Section-wise View

### In `ReportPage.jsx`

The group selector already exists. Make sure:
1. When `groups` has multiple values, show them as **tabs** (A-Sec, B-Sec, C-Sec, D-Sec + "All")
2. "Download PDF" downloads **only the selected section** (pass `group` param)
3. "Download All (PDF)" downloads combined report (pass no `group` param)
4. Each tab switch re-fetches analysis for that group

```jsx
// Replace the simple <select> with tab buttons:
<div className="flex gap-1 border-b border-gray-200 mb-4">
  <button
    onClick={() => setSelectedGroup(null)}
    className={`px-4 py-2 text-sm font-medium rounded-t-lg
      ${!selectedGroup ? "bg-white border border-b-white border-gray-200 text-blue-600 -mb-px" : "text-gray-500"}`}
  >
    All Sections
  </button>
  {groups.map(g => (
    <button
      key={g}
      onClick={() => setSelectedGroup(g)}
      className={`px-4 py-2 text-sm font-medium rounded-t-lg
        ${selectedGroup === g ? "bg-white border border-b-white border-gray-200 text-blue-600 -mb-px" : "text-gray-500"}`}
    >
      {g}-Sec
    </button>
  ))}
</div>
```

---

## PROBLEM 6 — `analyzer.py` signature change

The `build_full_report` and `generate_pdf`/`generate_excel` now receive `df` directly 
(not a pre-filtered df). Update `routers/analysis.py` to pass `group` into `build_full_report`:

```python
# routers/analysis.py — no change needed, already passes group_filter
# But confirm build_full_report in analyzer.py calls detect_grouping if group_filter is set:

def build_full_report(df, enrichment, group_filter=None):
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
    }
```

---

## PROBLEM 7 — WeasyPrint Installation (if PDF still fails)

WeasyPrint needs system dependencies. Run:
```bash
# Ubuntu/Debian
sudo apt-get install -y python3-cffi python3-brotli libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b fonts-liberation

# macOS
brew install pango libffi

# Then reinstall
pip install weasyprint --break-system-packages
```

If WeasyPrint is too hard to install, **swap to `xhtml2pdf`** which is pip-only:
```bash
pip install xhtml2pdf
```
And replace in `pdf_generator.py`:
```python
# Instead of: HTML(string=html_content).write_pdf(output_path)
from xhtml2pdf import pisa
with open(output_path, "wb") as f:
    pisa.CreatePDF(html_content, dest=f)
```

---

## Summary Checklist for Cursor

- [ ] Fix `routers/export.py` — use `mkstemp` + `BackgroundTasks` pattern
- [ ] Rebuild `pdf_generator.py` — section-wise loop, A3 landscape, 4-part template
- [ ] Rebuild `excel_generator.py` — one sheet per section, 4 parts stacked
- [ ] Update `routers/analysis.py` — ensure `build_full_report` calls `detect_grouping`
- [ ] Frontend `ReportPage.jsx` — replace `<select>` with section tabs
- [ ] Frontend `api.js` — `downloadPDF(group)` and `downloadExcel(group)` already correct
- [ ] Test WeasyPrint install, swap to `xhtml2pdf` if needed
- [ ] Verify `detect_grouping` is always called before any group filtering
