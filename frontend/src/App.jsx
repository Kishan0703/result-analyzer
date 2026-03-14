/**
 * Main app shell. Three-step flow:
 *   1. UploadPage   — drop zone for xlsx files
 *   2. EnrichmentPage — fill in staff names + class strength per subject
 *   3. ReportPage   — view tables, charts, download PDF/Excel
 * 
 * Cursor:
 *   - Wrap in a clean layout: sidebar nav or top stepper
 *   - Show active step clearly
 *   - Pass props down from useSession to each page
 */
import { useSession } from "./hooks/useSession";
import UploadPage from "./pages/UploadPage";
import EnrichmentPage from "./pages/EnrichmentPage";
import ReportPage from "./pages/ReportPage";

export default function App() {
  const { step, setStep, sessionData, setSessionData, resetSession, loading } = useSession();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-800">Student Result Analyzer</h1>
        {step !== "upload" && (
          <button
            onClick={resetSession}
            className="text-sm text-red-500 hover:underline"
          >
            Start Over
          </button>
        )}
      </header>

      {/* Step indicator — Cursor: style this as a progress bar or step pills */}
      <div className="flex justify-center gap-8 py-4 bg-white border-b border-gray-100 text-sm">
        {["upload", "enrich", "report"].map((s, i) => (
          <div
            key={s}
            className={`flex items-center gap-2 ${step === s ? "text-blue-600 font-semibold" : "text-gray-400"}`}
          >
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs
              ${step === s ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"}`}>
              {i + 1}
            </span>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </div>
        ))}
      </div>

      {/* Page content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {step === "upload" && (
          <UploadPage
            onComplete={(data) => {
              setSessionData(data);
              setStep("enrich");
            }}
          />
        )}
        {step === "enrich" && (
          <EnrichmentPage
            sessionData={sessionData}
            onComplete={() => setStep("report")}
          />
        )}
        {step === "report" && (
          <ReportPage
            sessionData={sessionData}
            onReset={resetSession}
          />
        )}
      </main>
    </div>
  );
}
