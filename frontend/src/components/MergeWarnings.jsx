export default function MergeWarnings({ warnings = [] }) {
  if (!warnings.length) return null;
  return (
    <div className="mt-4 space-y-2">
      {warnings.map((w, i) => (
        <div
          key={i}
          className={`px-4 py-3 rounded-lg text-sm flex gap-2 ${
            w.type === "mixed_semester"
              ? "bg-yellow-50 text-yellow-800 border border-yellow-200"
              : "bg-blue-50 text-blue-800 border border-blue-200"
          }`}
        >
          <span>⚠</span>
          <span>
            {w.message ||
              `Duplicate entry for USN ${w.usn} in ${w.course_code} — ${w.action}`}
          </span>
        </div>
      ))}
    </div>
  );
}

