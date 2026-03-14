# Cursor Prompt — Remove PDF, Fix Charts Tab

## CHANGE 1 — Remove PDF everywhere

### Backend: delete `routers/export.py` PDF endpoint
Remove the `/pdf` route entirely. Keep only `/excel`.

```python
# routers/export.py — final version, PDF removed

import os
import tempfile
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse
from typing import Optional

from utils.session_store import session_exists, load_merged_df, load_enrichment, load_metadata
from services.excel_generator import generate_excel
from services.merger import detect_grouping

router = APIRouter()

def _cleanup(path: str):
    try:
        os.unlink(path)
    except Exception:
        pass

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

### Backend: add chart data endpoint in `routers/analysis.py`

Add this new endpoint — it returns all data the frontend needs to render all 4 charts:

```python
@router.get("/{session_id}/chart-data")
def get_chart_data(session_id: str, group: Optional[str] = Query(None)):
    """
    Returns structured data for all 4 charts.
    If group is None → returns section-comparison data too (Chart 5).
    If group is set → returns data filtered to that group only.
    """
    if not session_exists(session_id):
        raise HTTPException(404, "Session not found or expired")

    df = load_merged_df(session_id)
    enrichment = load_enrichment(session_id)

    from services.merger import detect_grouping
    from services.analyzer import (
        analyze_subjects, compute_backlog,
        compute_overall_stats, add_status_column
    )
    import pandas as pd

    df = detect_grouping(df)

    # Filter if group selected
    if group and "group" in df.columns:
        working_df = df[df["group"] == group].copy()
    else:
        working_df = df.copy()

    # ── Chart 1: Pass % per Subject ──────────────────────────────────────────
    subjects = analyze_subjects(working_df, enrichment)
    chart1 = {
        "labels": [s["course_code"] for s in subjects],
        "values": [s["pass_percentage"] for s in subjects],
        "full_titles": [s["course_title"] for s in subjects],
    }

    # ── Chart 3: SGPA Distribution ───────────────────────────────────────────
    students = working_df.drop_duplicates("usn")
    sgpa_vals = pd.to_numeric(students["sgpa"], errors="coerce").dropna()

    buckets = {"<5": 0, "5-6": 0, "6-7": 0, "7-8": 0, "8-9": 0, "9-10": 0}
    for v in sgpa_vals:
        if v < 5:    buckets["<5"] += 1
        elif v < 6:  buckets["5-6"] += 1
        elif v < 7:  buckets["6-7"] += 1
        elif v < 8:  buckets["7-8"] += 1
        elif v < 9:  buckets["8-9"] += 1
        else:        buckets["9-10"] += 1

    avg_sgpa = round(float(sgpa_vals.mean()), 2) if len(sgpa_vals) > 0 else 0
    chart3 = {
        "labels": list(buckets.keys()),
        "values": list(buckets.values()),
        "avg_sgpa": avg_sgpa,
    }

    # ── Chart 4: Backlog Distribution ────────────────────────────────────────
    backlog = compute_backlog(working_df)
    dist = backlog["distribution"]
    chart4 = {
        "labels": ["1 Backlog", "2 Backlogs", "3 Backlogs",
                   "4 Backlogs", "5 Backlogs", "6+ Backlogs"],
        "values": [dist.get("1",0), dist.get("2",0), dist.get("3",0),
                   dist.get("4",0), dist.get("5",0), dist.get("6+",0)],
    }

    # ── Chart 5: Section-wise Pass % (only when no group filter) ─────────────
    chart5 = None
    if not group and "group" in df.columns:
        section_data = []
        for grp, grp_df in df.groupby("group"):
            grp_subjects = analyze_subjects(grp_df, enrichment)
            # Overall pass% for section = weighted average across subjects
            total_appeared = sum(s["appeared"] for s in grp_subjects if s["appeared"] > 0)
            total_passed   = sum(s["passed"]   for s in grp_subjects)
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
        "chart5": chart5,  # None when group is filtered
    }
```

### Backend: add `getChartData` to `frontend/src/services/api.js`

```javascript
/**
 * Fetch chart data for all 4 charts.
 * @param {string|null} group
 */
export async function getChartData(group = null) {
  const id = getSessionId();
  const params = group ? `?group=${encodeURIComponent(group)}` : "";
  const res = await request(`/analysis/${id}/chart-data${params}`);
  return res.json();
}
```

Also remove `downloadPDF` from `api.js` entirely.

---

## CHANGE 2 — Remove PDF button from `ReportPage.jsx`

```jsx
// Remove this button entirely:
// <button onClick={() => downloadPDF(selectedGroup)} ...>Download PDF</button>

// Keep only:
<button
  onClick={() => downloadExcel(selectedGroup)}
  className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
>
  ⬇ Download Excel
</button>
```

Also remove `downloadPDF` from the import line in `ReportPage.jsx`.

---

## CHANGE 3 — Rebuild `Charts.jsx` with 4 charts

Install dependencies first:
```bash
npm install react-chartjs-2 chart.js
```

### Full `Charts.jsx` implementation

```jsx
// frontend/src/components/Charts.jsx

import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { getChartData } from "../services/api";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// ── Color helpers ────────────────────────────────────────────────────────────

function passColor(pct) {
  if (pct >= 90) return "rgba(34, 197, 94, 0.85)";   // green
  if (pct >= 75) return "rgba(234, 179, 8, 0.85)";    // yellow
  return "rgba(239, 68, 68, 0.85)";                    // red
}

function sgpaColor(label) {
  if (label === "<5" || label === "5-6") return "rgba(239, 68, 68, 0.8)";   // red
  if (label === "6-7" || label === "7-8") return "rgba(234, 179, 8, 0.8)"; // yellow
  return "rgba(34, 197, 94, 0.8)";                                           // green
}

const BACKLOG_COLOR = "rgba(249, 115, 22, 0.8)"; // orange

// ── Shared chart options ─────────────────────────────────────────────────────

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { callbacks: {} },
  },
  scales: {
    x: { grid: { color: "rgba(0,0,0,0.05)" } },
    y: { grid: { color: "rgba(0,0,0,0.05)" } },
  },
};

// ── Chart 1: Pass % per Subject ──────────────────────────────────────────────

function Chart1({ data }) {
  if (!data) return null;

  const chartData = {
    labels: data.labels,
    datasets: [{
      data: data.values,
      backgroundColor: data.values.map(passColor),
      borderRadius: 4,
      barThickness: 18,
    }],
  };

  const options = {
    ...baseOptions,
    indexAxis: "y",   // horizontal bars
    plugins: {
      ...baseOptions.plugins,
      tooltip: {
        callbacks: {
          // Show full subject title in tooltip
          title: (items) => data.full_titles[items[0].dataIndex] || items[0].label,
          label: (item) => ` ${item.raw}%`,
        },
      },
    },
    scales: {
      x: {
        min: 0,
        max: 100,
        grid: { color: "rgba(0,0,0,0.05)" },
        ticks: { callback: (v) => `${v}%` },
      },
      y: {
        grid: { display: false },
        ticks: { font: { size: 11 } },
      },
    },
  };

  // Dynamic height: 40px per bar + padding
  const chartHeight = data.labels.length * 40 + 40;

  return (
    <ChartCard
      title="Pass % per Subject"
      legend={[
        { color: "rgba(34,197,94,0.85)", label: "≥ 90% (Good)" },
        { color: "rgba(234,179,8,0.85)", label: "75–90% (Average)" },
        { color: "rgba(239,68,68,0.85)", label: "< 75% (Needs attention)" },
      ]}
    >
      <div style={{ height: chartHeight }}>
        <Bar data={chartData} options={options} />
      </div>
    </ChartCard>
  );
}

// ── Chart 3: SGPA Distribution ───────────────────────────────────────────────

function Chart3({ data }) {
  if (!data) return null;

  const chartData = {
    labels: data.labels,
    datasets: [{
      label: "Students",
      data: data.values,
      backgroundColor: data.labels.map(sgpaColor),
      borderRadius: 4,
    }],
  };

  // Plugin to draw average SGPA vertical annotation line
  // Chart.js v3+ requires a plugin or chartjs-plugin-annotation for lines.
  // We use a custom afterDraw plugin inline instead.
  const avgPlugin = {
    id: "avgLine",
    afterDraw(chart) {
      if (!data.avg_sgpa) return;
      const { ctx, chartArea, scales } = chart;
      // Find which bucket the avg falls in to draw on X axis
      // avg_sgpa is a number like 7.2 — map to x position
      const bucketMap = { "<5": 2.5, "5-6": 5.5, "6-7": 6.5, "7-8": 7.5, "8-9": 8.5, "9-10": 9.5 };
      // Find the bucket index
      const buckets = data.labels;
      let avgBucketIndex = buckets.findIndex((b) => {
        if (b === "<5") return data.avg_sgpa < 5;
        const [lo, hi] = b.split("-").map(Number);
        return data.avg_sgpa >= lo && data.avg_sgpa < hi;
      });
      if (avgBucketIndex < 0) avgBucketIndex = buckets.length - 1;

      const xPos = scales.x.getPixelForValue(avgBucketIndex);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(xPos, chartArea.top);
      ctx.lineTo(xPos, chartArea.bottom);
      ctx.strokeStyle = "#1e3a5f";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.stroke();
      ctx.fillStyle = "#1e3a5f";
      ctx.font = "bold 11px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`Avg: ${data.avg_sgpa}`, xPos, chartArea.top - 6);
      ctx.restore();
    },
  };

  const options = {
    ...baseOptions,
    plugins: {
      ...baseOptions.plugins,
      tooltip: {
        callbacks: {
          label: (item) => ` ${item.raw} students`,
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        grid: { color: "rgba(0,0,0,0.05)" },
        ticks: { stepSize: 1 },
        title: { display: true, text: "No. of Students", font: { size: 11 } },
      },
    },
  };

  return (
    <ChartCard
      title="SGPA Distribution"
      subtitle={`Average SGPA: ${data.avg_sgpa}`}
      legend={[
        { color: "rgba(239,68,68,0.8)",  label: "Below 6" },
        { color: "rgba(234,179,8,0.8)",  label: "6 – 8" },
        { color: "rgba(34,197,94,0.8)",  label: "8 and above" },
      ]}
    >
      <div style={{ height: 280 }}>
        <Bar data={chartData} options={options} plugins={[avgPlugin]} />
      </div>
    </ChartCard>
  );
}

// ── Chart 4: Backlog Distribution ────────────────────────────────────────────

function Chart4({ data }) {
  if (!data) return null;

  const total = data.values.reduce((a, b) => a + b, 0);

  const chartData = {
    labels: data.labels,
    datasets: [{
      label: "Students",
      data: data.values,
      backgroundColor: BACKLOG_COLOR,
      borderRadius: 4,
    }],
  };

  const options = {
    ...baseOptions,
    plugins: {
      ...baseOptions.plugins,
      tooltip: {
        callbacks: {
          label: (item) => ` ${item.raw} students`,
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        grid: { color: "rgba(0,0,0,0.05)" },
        title: { display: true, text: "No. of Students", font: { size: 11 } },
      },
    },
  };

  return (
    <ChartCard
      title="Backlog Distribution"
      subtitle={`${total} students have at least one backlog`}
    >
      <div style={{ height: 260 }}>
        <Bar data={chartData} options={options} />
      </div>
    </ChartCard>
  );
}

// ── Chart 5: Section-wise Pass % Comparison ──────────────────────────────────

function Chart5({ data }) {
  if (!data) return null;

  const chartData = {
    labels: data.labels,
    datasets: [{
      label: "Pass %",
      data: data.values,
      backgroundColor: data.values.map(passColor),
      borderRadius: 4,
      barThickness: 32,
    }],
  };

  const options = {
    ...baseOptions,
    plugins: {
      ...baseOptions.plugins,
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (item) => ` ${item.raw}%`,
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        min: 0,
        max: 100,
        grid: { color: "rgba(0,0,0,0.05)" },
        ticks: { callback: (v) => `${v}%` },
        title: { display: true, text: "Pass %", font: { size: 11 } },
      },
    },
  };

  return (
    <ChartCard
      title="Section-wise Pass % Comparison"
      subtitle="Overall pass percentage per section"
      legend={[
        { color: "rgba(34,197,94,0.85)", label: "≥ 90%" },
        { color: "rgba(234,179,8,0.85)", label: "75–90%" },
        { color: "rgba(239,68,68,0.85)", label: "< 75%" },
      ]}
    >
      <div style={{ height: 260 }}>
        <Bar data={chartData} options={options} />
      </div>
    </ChartCard>
  );
}

// ── Shared card wrapper ──────────────────────────────────────────────────────

function ChartCard({ title, subtitle, legend, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        {legend && (
          <div className="flex flex-wrap gap-3 mt-2">
            {legend.map((l) => (
              <div key={l.label} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ backgroundColor: l.color }}
                />
                {l.label}
              </div>
            ))}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Main Charts component ────────────────────────────────────────────────────

export default function Charts({ selectedGroup }) {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getChartData(selectedGroup)
      .then(setChartData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedGroup]); // re-fetch when section tab changes

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400 text-sm">Loading charts...</div>
      </div>
    );
  }

  if (error) {
    return <p className="text-red-500 text-sm">{error}</p>;
  }

  if (!chartData) return null;

  return (
    <div className="space-y-6">
      {/* Chart 5 only shown on "All Sections" view (when selectedGroup is null) */}
      {!selectedGroup && chartData.chart5 && (
        <Chart5 data={chartData.chart5} />
      )}

      {/* Charts 1 and 3 side by side on wide screens, stacked on mobile */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Chart1 data={chartData.chart1} />
        <Chart3 data={chartData.chart3} />
      </div>

      {/* Chart 4 full width */}
      <Chart4 data={chartData.chart4} />
    </div>
  );
}
```

---

## CHANGE 4 — Update `ReportPage.jsx` to pass `selectedGroup` to Charts

The `Charts` component now needs `selectedGroup` as a prop so it can re-fetch
when the section tab changes.

```jsx
// In ReportPage.jsx, change the Charts tab render line from:
{activeTab === "Charts" && <Charts report={report} />}

// To:
{activeTab === "Charts" && <Charts selectedGroup={selectedGroup} />}
```

The `Charts` component now manages its own data fetching internally
(it calls `getChartData` itself), so you no longer need to pass `report` to it.

---

## CHANGE 5 — Remove unused PDF references

Search and remove all of these across the codebase:
- `import { downloadPDF } from "../services/api"` — remove from any file
- `downloadPDF` function call — remove
- `generate_pdf` import in any router — remove
- `pdf_generator.py` — can delete the file entirely
- `weasyprint` and `xhtml2pdf` from `requirements.txt` — remove

---

## Summary Checklist

- [ ] `routers/export.py` — remove `/pdf` route, keep only `/excel` with mkstemp fix
- [ ] `routers/analysis.py` — add `/chart-data` endpoint
- [ ] `services/api.js` — add `getChartData`, remove `downloadPDF`
- [ ] `ReportPage.jsx` — remove PDF button, pass `selectedGroup` to `<Charts />`
- [ ] `Charts.jsx` — full rebuild with Chart1, Chart3, Chart4, Chart5
- [ ] Delete `pdf_generator.py`
- [ ] Remove `weasyprint`/`xhtml2pdf` from `requirements.txt`
- [ ] Run `npm install react-chartjs-2 chart.js` in frontend
