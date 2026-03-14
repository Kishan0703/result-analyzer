/**
 * Step 2: Fill staff names + class strength per subject.
 *
 * Shows an editable table, one row per unique subject.
 * Prefills with any existing enrichment data from the session.
 * Save button → calls api.saveEnrichment() → moves to report step.
 *
 * Props:
 *   sessionData: { subjects: [{course_code, course_title}], ... }
 *   onComplete()
 */
import { useState, useEffect } from "react";
import { getEnrichment, saveEnrichment } from "../services/api";

export default function EnrichmentPage({ sessionData, onComplete }) {
  const [enrichment, setEnrichment] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const subjects = sessionData?.subjects || [];

  useEffect(() => {
    getEnrichment().then((data) => {
      setEnrichment(data || {});
      setLoading(false);
    });
  }, []);

  const updateField = (courseCode, field, value) => {
    setEnrichment((prev) => ({
      ...prev,
      [courseCode]: {
        ...(prev[courseCode] || {}),
        [field]: field === "class_strength" ? parseInt(value) || 0 : value,
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveEnrichment(enrichment);
      onComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-gray-500 text-sm">Loading subjects...</p>;

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-700 mb-1">
        Add Subject Information
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Fill in staff names and class strength for each subject. These will
        appear in the report.
        <span className="text-gray-400"> (You can skip and fill later.)</span>
      </p>

      <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-gray-600 font-medium">
                Course Code
              </th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">
                Course Title
              </th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">
                Staff Name
              </th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium w-36">
                Class Strength
              </th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s, i) => (
              <tr
                key={s.course_code}
                className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
              >
                <td className="px-4 py-2 font-mono text-xs text-gray-600">
                  {s.course_code}
                </td>
                <td className="px-4 py-2 text-gray-700">{s.course_title}</td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    placeholder="e.g. Dr. Anitha Kiran"
                    value={enrichment[s.course_code]?.staff_name || ""}
                    onChange={(e) =>
                      updateField(s.course_code, "staff_name", e.target.value)
                    }
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min="0"
                    placeholder="72"
                    value={enrichment[s.course_code]?.class_strength || ""}
                    onChange={(e) =>
                      updateField(
                        s.course_code,
                        "class_strength",
                        e.target.value
                      )
                    }
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="mt-4 text-red-500 text-sm">{error}</p>}

      <div className="mt-6 flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white px-8 py-3 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save & Generate Report"}
        </button>
        <button
          onClick={onComplete}
          className="text-gray-500 px-6 py-3 rounded-xl border border-gray-200 hover:bg-gray-50"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

