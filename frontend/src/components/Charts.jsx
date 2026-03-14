import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { getChartData } from "../services/api";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function passColor(pct) {
  if (pct >= 90) return "rgba(34, 197, 94, 0.85)";
  if (pct >= 75) return "rgba(234, 179, 8, 0.85)";
  return "rgba(239, 68, 68, 0.85)";
}

function sgpaColor(label) {
  if (label === "<5" || label === "5-6") return "rgba(239, 68, 68, 0.8)";
  if (label === "6-7" || label === "7-8") return "rgba(234, 179, 8, 0.8)";
  return "rgba(34, 197, 94, 0.8)";
}

const BACKLOG_COLOR = "rgba(249, 115, 22, 0.8)";

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

function Chart1({ data }) {
  if (!data) return null;

  const chartData = {
    labels: data.labels,
    datasets: [
      {
        data: data.values,
        backgroundColor: data.values.map(passColor),
        borderRadius: 4,
        barThickness: 18,
      },
    ],
  };

  const options = {
    ...baseOptions,
    indexAxis: "y",
    plugins: {
      ...baseOptions.plugins,
      tooltip: {
        callbacks: {
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

  const chartHeight = data.labels.length * 40 + 40;

  return (
    <ChartCard
      title="Pass % per Subject"
      legend={[
        { color: "rgba(34,197,94,0.85)", label: ">= 90% (Good)" },
        { color: "rgba(234,179,8,0.85)", label: "75-90% (Average)" },
        { color: "rgba(239,68,68,0.85)", label: "< 75% (Needs attention)" },
      ]}
    >
      <div style={{ height: chartHeight }}>
        <Bar data={chartData} options={options} />
      </div>
    </ChartCard>
  );
}

function Chart3({ data }) {
  if (!data) return null;

  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: "Students",
        data: data.values,
        backgroundColor: data.labels.map(sgpaColor),
        borderRadius: 4,
      },
    ],
  };

  const avgPlugin = {
    id: "avgLine",
    afterDraw(chart) {
      if (!data.avg_sgpa && data.avg_sgpa !== 0) return;
      const { ctx, chartArea, scales } = chart;
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
        { color: "rgba(239,68,68,0.8)", label: "Below 6" },
        { color: "rgba(234,179,8,0.8)", label: "6 - 8" },
        { color: "rgba(34,197,94,0.8)", label: "8 and above" },
      ]}
    >
      <div style={{ height: 280 }}>
        <Bar data={chartData} options={options} plugins={[avgPlugin]} />
      </div>
    </ChartCard>
  );
}

function Chart4({ data }) {
  if (!data) return null;

  const total = data.values.reduce((a, b) => a + b, 0);

  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: "Students",
        data: data.values,
        backgroundColor: BACKLOG_COLOR,
        borderRadius: 4,
      },
    ],
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

function Chart5({ data }) {
  if (!data) return null;

  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: "Pass %",
        data: data.values,
        backgroundColor: data.values.map(passColor),
        borderRadius: 4,
        barThickness: 32,
      },
    ],
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
        { color: "rgba(34,197,94,0.85)", label: ">= 90%" },
        { color: "rgba(234,179,8,0.85)", label: "75-90%" },
        { color: "rgba(239,68,68,0.85)", label: "< 75%" },
      ]}
    >
      <div style={{ height: 260 }}>
        <Bar data={chartData} options={options} />
      </div>
    </ChartCard>
  );
}

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
  }, [selectedGroup]);

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
      {!selectedGroup && chartData.chart5 && <Chart5 data={chartData.chart5} />}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Chart1 data={chartData.chart1} />
        <Chart3 data={chartData.chart3} />
      </div>

      <Chart4 data={chartData.chart4} />
    </div>
  );
}
