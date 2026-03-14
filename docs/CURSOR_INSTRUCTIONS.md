# Cursor Instructions — How to Complete This App

This file tells Cursor exactly what to do to turn the blueprint into a fully working app.

---

## Step 1 — Project Setup

### Backend
```bash
cd backend
pip install -r requirements.txt
```
Create these empty `__init__.py` files:
- `backend/routers/__init__.py`
- `backend/services/__init__.py`
- `backend/models/__init__.py`
- `backend/utils/__init__.py`

Split `__init_routers__.py` into separate files:
- Copy the `upload.py` section → `routers/upload.py`
- Copy the `session.py` section → `routers/session.py`
- Copy the `enrichment.py` section → `routers/enrichment.py`
- Copy the `analysis.py` section → `routers/analysis.py`
- Copy the `export.py` section → `routers/export.py`
Then delete `__init_routers__.py`.

Split `__pages__.jsx` into:
- `pages/UploadPage.jsx`
- `pages/EnrichmentPage.jsx`
- `pages/ReportPage.jsx`
Then delete `__pages__.jsx`.

Split `__components__.jsx` into:
- `components/SubjectResultTable.jsx`
- `components/ToppersList.jsx`
- `components/CategoryTable.jsx`
- `components/BacklogTable.jsx`
- `components/Charts.jsx`
Then delete `__components__.jsx`.

### Frontend
```bash
cd frontend
npm create vite@latest . -- --template react
npm install
npm install react-chartjs-2 chart.js
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Add to `tailwind.config.js`:
```js
content: ["./index.html", "./src/**/*.{js,jsx}"]
```

Add to `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## Step 2 — Backend Completions

### `services/analyzer.py` — Add grade distribution
Add this function (used by Charts on frontend):
```python
def compute_grade_distribution(df: pd.DataFrame) -> dict:
    """Count occurrences of each grade across all credit subjects."""
    credit_df = df[df["credits_registered"] > 0]
    counts = credit_df["grade"].str.strip().str.upper().value_counts().to_dict()
    return counts
```
Add `"grade_distribution": compute_grade_distribution(df)` to `build_full_report()` return dict.

### `routers/upload.py` — File size guard
Add before processing:
```python
MAX_FILE_SIZE_MB = 20
for f in files:
    content = await f.read()
    if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"{f.filename} exceeds {MAX_FILE_SIZE_MB}MB limit")
    await f.seek(0)
```

### `routers/export.py` — Cleanup temp files
After FileResponse, the temp file needs cleanup. Use a BackgroundTask:
```python
from fastapi import BackgroundTasks
import os

def cleanup_file(path: str):
    try: os.unlink(path)
    except: pass

@router.get("/{session_id}/pdf")
def export_pdf(session_id: str, background_tasks: BackgroundTasks, group=None):
    ...
    background_tasks.add_task(cleanup_file, tmp.name)
    return FileResponse(...)
```

---

## Step 3 — Frontend Completions

### `components/Charts.jsx`
Register Chart.js components at top:
```js
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  ArcElement, Title, Tooltip, Legend
} from "chart.js";
import { Bar, Pie } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);
```

**Chart 1 — Pass % per Subject (horizontal bar):**
```js
const barData = {
  labels: report.subjects.map(s => s.course_code),
  datasets: [{
    label: "Pass %",
    data: report.subjects.map(s => s.pass_percentage),
    backgroundColor: report.subjects.map(s =>
      s.pass_percentage >= 90 ? "#22c55e" :
      s.pass_percentage >= 75 ? "#eab308" : "#ef4444"
    ),
  }]
};
const barOptions = { indexAxis: "y", scales: { x: { max: 100 } }, plugins: { legend: { display: false } } };
```

**Chart 2 — Grade Distribution (pie):**
```js
const gradeColors = { O: "#22c55e", "A+": "#84cc16", A: "#a3e635", "B+": "#facc15",
  B: "#fb923c", C: "#f87171", F: "#dc2626", AB: "#94a3b8", DX: "#7c3aed", NP: "#60a5fa" };
const gradeDist = report.grade_distribution || {};
const pieData = {
  labels: Object.keys(gradeDist),
  datasets: [{
    data: Object.values(gradeDist),
    backgroundColor: Object.keys(gradeDist).map(g => gradeColors[g] || "#ccc"),
  }]
};
```

**Chart 3 — SGPA Distribution histogram:**
```js
// Compute from toppers + overall data. 
// Add an endpoint GET /api/analysis/{id}/sgpa-distribution that returns:
// { "<5": n, "5-6": n, "6-7": n, "7-8": n, "8-9": n, "9-10": n }
// Then fetch it inside Charts component with useEffect.
```

### `pages/UploadPage.jsx` — Full drag-and-drop
Replace the `<label>` zone with:
```js
const [isDragging, setIsDragging] = useState(false);

const handleDrop = (e) => {
  e.preventDefault();
  setIsDragging(false);
  const dropped = Array.from(e.dataTransfer.files)
    .filter(f => f.name.endsWith(".xlsx") || f.name.endsWith(".xls"));
  setFiles(prev => {
    const names = new Set(prev.map(f => f.name));
    return [...prev, ...dropped.filter(f => !names.has(f.name))];
  });
};
```
Add `onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop` to the zone div.
Apply `border-blue-500 bg-blue-50` styles when `isDragging` is true.

### `components/SubjectResultTable.jsx` — Sorting
Add sortable headers:
```js
const [sortKey, setSortKey] = useState(null);
const [sortDir, setSortDir] = useState("asc");

const sorted = [...subjects].sort((a, b) => {
  if (!sortKey) return 0;
  return sortDir === "asc"
    ? (a[sortKey] > b[sortKey] ? 1 : -1)
    : (a[sortKey] < b[sortKey] ? 1 : -1);
});
```
Each `<th>` gets `onClick={() => { setSortKey(key); setSortDir(d => d === "asc" ? "desc" : "asc"); }}`.

### `hooks/useSession.js` — Restore step
When session is restored and `metadata.has_data` is true, check if enrichment exists:
```js
const enrichment = await getEnrichment().catch(() => null);
const hasEnrichment = enrichment && Object.keys(enrichment).length > 0;
setStep(hasEnrichment ? "report" : "enrich");
```

---

## Step 4 — Add SGPA Distribution Endpoint

In `routers/analysis.py`, add:
```python
@router.get("/{session_id}/sgpa-distribution")
def sgpa_distribution(session_id: str, group: Optional[str] = Query(None)):
    df = load_merged_df(session_id)
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
```
Add `getSGPADistribution(group)` to `api.js`.

---

## Step 5 — Environment File
Create `frontend/.env`:
```
VITE_API_URL=http://localhost:8000/api
```

---

## Step 6 — Warnings Display Component
Create `components/MergeWarnings.jsx` — shown after upload on UploadPage:
```jsx
export default function MergeWarnings({ warnings = [] }) {
  if (!warnings.length) return null;
  return (
    <div className="mt-4 space-y-2">
      {warnings.map((w, i) => (
        <div key={i} className={`px-4 py-3 rounded-lg text-sm flex gap-2
          ${w.type === "mixed_semester" ? "bg-yellow-50 text-yellow-800 border border-yellow-200" 
          : "bg-blue-50 text-blue-800 border border-blue-200"}`}>
          <span>⚠</span>
          <span>{w.message || `Duplicate entry for USN ${w.usn} in ${w.course_code} — ${w.action}`}</span>
        </div>
      ))}
    </div>
  );
}
```
Use it in `UploadPage` after successful upload to display `data.warnings`.

---

## Common Pitfalls to Avoid

1. **Parquet needs pyarrow** — already in requirements.txt. Don't remove it.
2. **WeasyPrint needs system fonts** — on Linux run: `apt install fonts-liberation`
3. **openpyxl vs xlrd** — for `.xls` (old format) files, also install `xlrd==2.0.1`. Add to requirements.
4. **CORS** — if deploying frontend separately, update `allow_origins` in `main.py`.
5. **Session cleanup race** — the background cleanup task and a simultaneous request could clash. The `try/except` in cleanup handles this.
6. **Large files** — pandas `read_excel` can be slow for 1000+ row files. Consider adding a progress indicator on frontend (fake progress bar is fine — just show spinner).
7. **Empty groups** — after `detect_grouping`, some USNs might get "UNKNOWN" group. Show a warning on frontend if any group is "UNKNOWN".
8. **Column order in xlsx** — never assume column order. Always use `normalize_columns()` before any processing.
