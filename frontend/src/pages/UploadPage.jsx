/**
 * Step 1: File upload.
 *
 * Features:
 *   - Drag-and-drop zone (accept .xlsx, .xls)
 *   - Multiple file selection
 *   - Show list of selected files with remove button
 *   - Upload button → calls api.uploadFiles()
 *   - Show warnings returned from backend (duplicates, mixed semesters)
 *   - Loading state during upload
 *
 * Props:
 *   onComplete(data) — called with upload response on success
 */
import { useState } from "react";
import { uploadFiles } from "../services/api";
import MergeWarnings from "../components/MergeWarnings";

export default function UploadPage({ onComplete }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files).filter(
      (f) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls")
    );
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...newFiles.filter((f) => !names.has(f.name))];
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter(
      (f) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls")
    );
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...dropped.filter((f) => !names.has(f.name))];
    });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const removeFile = (name) =>
    setFiles((prev) => prev.filter((f) => f.name !== name));

  const handleUpload = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const data = await uploadFiles(files);
      setWarnings(data.warnings || []);
      onComplete(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-gray-700 mb-2">
        Upload Result Files
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Upload one or more .xlsx files. Multiple files will be merged
        automatically.
      </p>

      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-blue-500 bg-blue-50"
            : "border-blue-300 hover:border-blue-500"
        }`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <label className="block cursor-pointer">
          <input
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <p className="text-gray-500 text-sm">
            Click to select files, or drag and drop here
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Accepts .xlsx and .xls files
          </p>
        </label>
      </div>

      {files.length > 0 && (
        <ul className="mt-4 space-y-2">
          {files.map((f) => (
            <li
              key={f.name}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm"
            >
              <span className="text-gray-700 truncate">{f.name}</span>
              <button
                onClick={() => removeFile(f.name)}
                className="text-red-400 hover:text-red-600 ml-4 text-xs"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-4 text-red-500 text-sm">{error}</p>}

      <button
        onClick={handleUpload}
        disabled={loading || files.length === 0}
        className="mt-6 w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading
          ? "Processing..."
          : `Upload ${
              files.length > 0
                ? `(${files.length} file${files.length > 1 ? "s" : ""})`
                : ""
            }`}
      </button>

      <MergeWarnings warnings={warnings} />
    </div>
  );
}

