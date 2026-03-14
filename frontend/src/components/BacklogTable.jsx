/**
 * Two sections:
 *   1. Backlog distribution (1 backlog, 2 backlog, ..., 6+ backlog) — compact table
 *   2. Per-student backlog details — list
 */
export default function BacklogTable({ backlog }) {
  if (!backlog) return null;
  const { distribution, student_details } = backlog;

  const totalWithBacklog = Object.values(distribution).reduce(
    (a, b) => a + b,
    0
  );

  return (
    <div className="space-y-6">
      {/* Distribution */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-w-sm">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">
            Backlog Distribution
          </h3>
          <p className="text-xs text-gray-500">
            {totalWithBacklog} students with backlog(s)
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="px-4 py-2 text-left font-medium">Category</th>
              <th className="px-4 py-2 text-center font-medium">Students</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(distribution).map(([bucket, count], i) => (
              <tr
                key={bucket}
                className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
              >
                <td className="px-4 py-2 text-gray-700">{bucket} Backlog</td>
                <td
                  className={`px-4 py-2 text-center font-medium ${
                    count > 0 ? "text-red-600" : "text-gray-400"
                  }`}
                >
                  {count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Student details */}
      {student_details.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700">
              Student-wise Backlog Details
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="px-4 py-2 text-center font-medium">USN</th>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-center font-medium">Count</th>
                <th className="px-4 py-2 text-left font-medium">
                  Failed Subjects
                </th>
              </tr>
            </thead>
            <tbody>
              {student_details.map((s, i) => (
                <tr
                  key={s.usn}
                  className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
                >
                  <td className="px-4 py-2 text-center font-mono text-xs text-gray-600">
                    {s.usn}
                  </td>
                  <td className="px-4 py-2 text-gray-800">{s.name}</td>
                  <td className="px-4 py-2 text-center">
                    <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-bold">
                      {s.backlog_count}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-600 text-xs">
                    {s.subjects.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

