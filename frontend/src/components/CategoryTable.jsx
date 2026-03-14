/**
 * Category-wise pass/fail breakdown.
 * Shows a message if no category data found (remarks column was empty).
 */
export default function CategoryTable({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center max-w-md">
        <p className="text-yellow-700 text-sm font-medium">
          No category data found
        </p>
        <p className="text-yellow-600 text-xs mt-1">
          The uploaded files don't have admission category info (CET/Comed-K/Mgmt
          etc.) in the Remarks column.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-w-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-800 text-white">
            {["Category", "Total", "Pass", "Fail"].map((h) => (
              <th key={h} className="px-4 py-3 text-center font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((c, i) => (
            <tr
              key={c.category}
              className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
            >
              <td className="px-4 py-3 font-medium text-gray-700">
                {c.category}
              </td>
              <td className="px-4 py-3 text-center">{c.total}</td>
              <td className="px-4 py-3 text-center text-green-600 font-medium">
                {c.pass}
              </td>
              <td className="px-4 py-3 text-center text-red-500 font-medium">
                {c.fail}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

