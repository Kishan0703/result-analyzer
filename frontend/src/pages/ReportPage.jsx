/**
 * Step 3: View analysis results and download.
 *
 * Features:
 *   - Group tabs (All + per section)
 *   - Summary stat cards at top
 *   - Tabs: Subject Analysis | Toppers | Category-wise | Backlog | Charts
 *   - Download Excel button
 *
 * Props:
 *   sessionData: { groups: string[], semesters: string[], ... }
 */
import { useState, useEffect } from "react";
import { getAnalysis, downloadExcel } from "../services/api";
import SubjectResultTable from "../components/SubjectResultTable";
import ToppersList from "../components/ToppersList";
import CategoryTable from "../components/CategoryTable";
import BacklogTable from "../components/BacklogTable";
import Charts from "../components/Charts";

const TABS = ["Subjects", "Toppers", "Category", "Backlog", "Charts"];

export default function ReportPage({ sessionData }) {
  const groups = sessionData?.groups || [];
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [activeTab, setActiveTab] = useState("Subjects");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadBusy, setDownloadBusy] = useState(null); // "excel" | "all-excel" | null
  const [downloadError, setDownloadError] = useState(null);

  useEffect(() => {
    setSelectedGroup(null);
  }, [sessionData?.session_id]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getAnalysis(selectedGroup)
      .then(setReport)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedGroup]);

  const handleDownloadExcel = async (forAll) => {
    const key = forAll ? "all-excel" : "excel";
    setDownloadError(null);
    setDownloadBusy(key);
    try {
      const group = forAll ? null : selectedGroup;
      await downloadExcel(group);
    } catch (e) {
      setDownloadError(e.message || "Download failed");
    } finally {
      setDownloadBusy(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-gray-700">Result Report</h2>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-500 mr-1 hidden sm:inline">Current view:</span>
          <button
            onClick={() => handleDownloadExcel(false)}
            disabled={!!downloadBusy}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {downloadBusy === "excel" ? "..." : "Download Excel"}
          </button>
          <span className="text-xs text-gray-500 mx-1 hidden sm:inline">|</span>
          <span className="text-xs text-gray-500 mr-1 hidden sm:inline">All data:</span>
          <button
            onClick={() => handleDownloadExcel(true)}
            disabled={!!downloadBusy}
            className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50 border border-green-800"
          >
            {downloadBusy === "all-excel" ? "..." : "Download all (Excel)"}
          </button>
        </div>
      </div>

      {downloadError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          {downloadError}
        </div>
      )}

      {groups.length > 0 && (
        <div className="flex gap-1 border-b border-gray-200 mb-4 overflow-x-auto">
          <button
            onClick={() => setSelectedGroup(null)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors
              ${
                !selectedGroup
                  ? "bg-white border border-b-white border-gray-200 text-blue-600 -mb-px"
                  : "text-gray-500 hover:text-gray-700"
              }`}
          >
            All Sections
          </button>
          {groups.map((g) => (
            <button
              key={g}
              onClick={() => setSelectedGroup(g)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors
                ${
                  selectedGroup === g
                    ? "bg-white border border-b-white border-gray-200 text-blue-600 -mb-px"
                    : "text-gray-500 hover:text-gray-700"
                }`}
            >
              {g}-Sec
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-gray-500 text-sm">Generating report...</p>}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {report && !loading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {[
              { label: "Total", value: report.overall.total_students },
              { label: "Appeared", value: report.overall.appeared },
              { label: "Passed", value: report.overall.passed },
              { label: "Failed", value: report.overall.failed },
              { label: "Pass %", value: `${report.overall.pass_percentage}%` },
              { label: "Avg SGPA", value: report.overall.avg_sgpa },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="bg-white border border-gray-200 rounded-xl p-4 text-center"
              >
                <div className="text-2xl font-bold text-blue-700">{value}</div>
                <div className="text-xs text-gray-500 mt-1">{label}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-1 border-b border-gray-200 mb-6">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors
                  ${
                    activeTab === tab
                      ? "bg-white border border-b-white border-gray-200 text-blue-600 -mb-px"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === "Subjects" && <SubjectResultTable subjects={report.subjects} />}
          {activeTab === "Toppers" && <ToppersList toppers={report.toppers} />}
          {activeTab === "Category" && <CategoryTable data={report.category_wise} />}
          {activeTab === "Backlog" && <BacklogTable backlog={report.backlog} />}
          {activeTab === "Charts" && <Charts selectedGroup={selectedGroup} />}
        </>
      )}
    </div>
  );
}
