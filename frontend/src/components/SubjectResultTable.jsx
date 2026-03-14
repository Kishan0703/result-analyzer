/**
 * Clean sortable table showing subject-wise result analysis.
 * Columns: Sl, Code, Title, Staff, Strength, Appeared, Passed, Failed, Absent, DX, NP, Pass%
 *
 * Columns are sortable by clicking the header.
 */
import { useState, useMemo } from "react";

const HEADERS = [
  { key: "sl_no", label: "Sl" },
  { key: "course_code", label: "Code" },
  { key: "course_title", label: "Subject Title" },
  { key: "staff_name", label: "Staff" },
  { key: "class_strength", label: "Strength" },
  { key: "appeared", label: "Appeared" },
  { key: "passed", label: "Passed" },
  { key: "failed", label: "Failed" },
  { key: "absent", label: "Absent" },
  { key: "dx", label: "DX" },
  { key: "np", label: "NP" },
  { key: "pass_percentage", label: "Pass %" },
];

export default function SubjectResultTable({ subjects = [] }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  if (!subjects.length) {
    return <p className="text-gray-400 text-sm">No subject data available.</p>;
  }

  const passColor = (pct) => {
    if (pct >= 90) return "text-green-600 font-semibold";
    if (pct >= 75) return "text-yellow-600 font-semibold";
    return "text-red-600 font-semibold";
  };

  const sortedSubjects = useMemo(() => {
    if (!sortKey) return subjects;
    return [...subjects].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === bv) return 0;
      if (sortDir === "asc") {
        return av > bv ? 1 : -1;
      }
      return av < bv ? 1 : -1;
    });
  }, [subjects, sortKey, sortDir]);

  const handleSort = (key) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      setSortDir("asc");
      return key;
    });
  };

  const sortIndicator = (key) => {
    if (sortKey !== key) return null;
    return sortDir === "asc" ? "▲" : "▼";
  };

  return (
    <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-800 text-white">
            {HEADERS.map(({ key, label }) => (
              <th
                key={key}
                onClick={() => handleSort(key)}
                className="px-3 py-3 text-center font-medium text-xs whitespace-nowrap cursor-pointer select-none"
              >
                <span className="inline-flex items-center gap-1">
                  {label}
                  <span className="text-[10px]">{sortIndicator(key)}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedSubjects.map((s, i) => (
            <tr
              key={s.course_code}
              className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
            >
              <td className="px-3 py-2 text-center text-gray-500">{s.sl_no}</td>
              <td className="px-3 py-2 text-center font-mono text-xs">
                {s.course_code}
              </td>
              <td
                className="px-3 py-2 text-gray-700 max-w-xs truncate"
                title={s.course_title}
              >
                {s.course_title}
              </td>
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                {s.staff_name || "—"}
              </td>
              <td className="px-3 py-2 text-center">{s.class_strength}</td>
              <td className="px-3 py-2 text-center">{s.appeared}</td>
              <td className="px-3 py-2 text-center text-green-600">
                {s.passed}
              </td>
              <td className="px-3 py-2 text-center text-red-500">
                {s.failed}
              </td>
              <td className="px-3 py-2 text-center text-orange-500">
                {s.absent}
              </td>
              <td className="px-3 py-2 text-center text-purple-500">
                {s.dx}
              </td>
              <td className="px-3 py-2 text-center text-blue-500">
                {s.np}
              </td>
              <td
                className={`px-3 py-2 text-center ${passColor(
                  s.pass_percentage
                )}`}
              >
                {s.pass_percentage}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

