/**
 * Displays top 5 students ranked by SGPA.
 * Shows rank badge, USN, name, SGPA, CGPA.
 */
export default function ToppersList({ toppers = [] }) {
  if (!toppers.length)
    return <p className="text-gray-400 text-sm">No topper data available.</p>;

  const rankColors = ["bg-yellow-400", "bg-gray-300", "bg-orange-300"];

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-w-2xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-800 text-white">
            {["Rank", "USN", "Name", "SGPA", "CGPA"].map((h) => (
              <th key={h} className="px-4 py-3 text-center font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {toppers.map((t) => (
            <tr
              key={t.usn}
              className="border-b border-gray-100 hover:bg-blue-50"
            >
              <td className="px-4 py-3 text-center">
                <span
                  className={`inline-flex w-7 h-7 rounded-full items-center justify-center text-xs font-bold
                  ${rankColors[t.rank - 1] || "bg-gray-100"}`}
                >
                  {t.rank}
                </span>
              </td>
              <td className="px-4 py-3 text-center font-mono text-xs text-gray-600">
                {t.usn}
              </td>
              <td className="px-4 py-3 font-medium text-gray-800">{t.name}</td>
              <td className="px-4 py-3 text-center font-bold text-blue-600">
                {t.sgpa}
              </td>
              <td className="px-4 py-3 text-center text-gray-600">
                {t.cgpa}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

