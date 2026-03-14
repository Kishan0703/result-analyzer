/**
 * Hook that manages app-wide session state.
 * Checks if a stored session is still valid on mount.
 * 
 * Returns:
 *   step: "upload" | "enrich" | "report"
 *   sessionData: { groups, semesters, total_students, subjects, warnings }
 *   setStep: fn
 *   setSessionData: fn
 *   resetSession: fn  — clears storage + resets to upload step
 */
import { useState, useEffect } from "react";
import { checkSession, clearSession, getEnrichment } from "../services/api";

export function useSession() {
  const [step, setStep] = useState("upload"); // "upload" | "enrich" | "report"
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restore = async () => {
      const data = await checkSession();
      if (data && data.metadata?.has_data) {
        // Session is alive and has data — restore to enrich/report step
        setSessionData(data.metadata);
        const enrichment = await getEnrichment().catch(() => null);
        const hasEnrichment = enrichment && Object.keys(enrichment).length > 0;
        setStep(hasEnrichment ? "report" : "enrich");
      }
      setLoading(false);
    };
    restore();
  }, []);

  const resetSession = async () => {
    await clearSession();
    setSessionData(null);
    setStep("upload");
  };

  return { step, setStep, sessionData, setSessionData, resetSession, loading };
}

