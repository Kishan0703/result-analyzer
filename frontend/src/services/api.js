// frontend/src/services/api.js
/**
 * Centralized API layer.
 * All functions read/write the session ID from localStorage key "result_session_id".
 * Session ID is sent as header X-Session-ID on every request.
 */

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

function getSessionId() {
  return localStorage.getItem("result_session_id") || null;
}

function setSessionId(id) {
  localStorage.setItem("result_session_id", id);
}

async function request(path, options = {}) {
  const sessionId = getSessionId();
  const headers = {
    ...(options.headers || {}),
    ...(sessionId ? { "X-Session-ID": sessionId } : {}),
  };
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res;
}

// ── Upload ──────────────────────────────────────────────────────────────────

/**
 * Upload one or more xlsx files.
 * @param {File[]} files
 * @returns {Promise<{session_id, warnings, groups, semesters, total_students, subjects}>}
 */
export async function uploadFiles(files) {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  const res = await request("/upload/files", {
    method: "POST",
    body: formData,
  });
  const data = await res.json();
  setSessionId(data.session_id);
  return data;
}

// ── Session ─────────────────────────────────────────────────────────────────

/**
 * Check if the stored session is still valid.
 * Returns null if not found/expired.
 */
export async function checkSession() {
  const id = getSessionId();
  if (!id) return null;
  try {
    const res = await request(`/session/${id}`);
    return await res.json();
  } catch {
    return null;
  }
}

export async function clearSession() {
  const id = getSessionId();
  if (!id) return;
  await request(`/session/${id}`, { method: "DELETE" }).catch(() => {});
  localStorage.removeItem("result_session_id");
}

// ── Enrichment ──────────────────────────────────────────────────────────────

/**
 * Get existing enrichment (staff names, class strength).
 */
export async function getEnrichment() {
  const id = getSessionId();
  const res = await request(`/enrichment/${id}`);
  return res.json();
}

/**
 * Save enrichment data.
 * @param {{ [courseCode]: { staff_name: string, class_strength: number } }} subjects
 */
export async function saveEnrichment(subjects) {
  const id = getSessionId();
  const res = await request(`/enrichment/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subjects }),
  });
  return res.json();
}

// ── Analysis ────────────────────────────────────────────────────────────────

/**
 * Get analysis results for a given group (or all if group is null).
 * @param {string|null} group
 */
export async function getAnalysis(group = null) {
  const id = getSessionId();
  const params = group ? `?group=${encodeURIComponent(group)}` : "";
  const res = await request(`/analysis/${id}${params}`);
  return res.json();
}

/**
 * Fetch chart data for all charts.
 * @param {string|null} group
 */
export async function getChartData(group = null) {
  const id = getSessionId();
  const params = group ? `?group=${encodeURIComponent(group)}` : "";
  const res = await request(`/analysis/${id}/chart-data${params}`);
  return res.json();
}

// ── Export ──────────────────────────────────────────────────────────────────

/**
 * Trigger Excel download.
 * @param {string|null} group
 */
export async function downloadExcel(group = null) {
  const id = getSessionId();
  const params = group ? `?group=${encodeURIComponent(group)}` : "";
  const res = await request(`/export/${id}/excel${params}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `result_report_${group || "all"}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
