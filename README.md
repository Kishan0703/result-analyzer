# Student Result Analyzer

A web app for uploading raw student result xlsx files and generating clean, downloadable subject-wise and statistical reports.

## Project Structure

```
result-analyzer/
├── backend/                  # FastAPI Python backend
│   ├── main.py               # App entry point, CORS, session cleanup
│   ├── routers/
│   │   ├── upload.py         # File upload endpoints
│   │   ├── session.py        # Session management endpoints
│   │   ├── enrichment.py     # Staff info / class strength input
│   │   ├── analysis.py       # Trigger analysis, get results
│   │   └── export.py         # PDF and Excel download endpoints
│   ├── services/
│   │   ├── merger.py         # Multi-file merge logic
│   │   ├── detector.py       # Section/cluster/category detection
│   │   ├── analyzer.py       # Core analysis engine
│   │   ├── report_builder.py # Builds report data structures
│   │   └── excel_generator.py# openpyxl Excel output
│   ├── models/
│   │   ├── session.py        # Session data models (Pydantic)
│   │   └── report.py         # Report data models (Pydantic)
│   ├── utils/
│   │   ├── constants.py      # Grade maps, status codes, column aliases
│   │   └── session_store.py  # File-based session storage with TTL
│   └── requirements.txt
├── frontend/                 # React + Tailwind frontend
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── UploadPage.jsx
│   │   │   ├── EnrichmentPage.jsx
│   │   │   └── ReportPage.jsx
│   │   ├── components/
│   │   │   ├── FileDropzone.jsx
│   │   │   ├── MergeWarnings.jsx
│   │   │   ├── StaffTable.jsx
│   │   │   ├── SubjectResultTable.jsx
│   │   │   ├── ToppersList.jsx
│   │   │   ├── CategoryTable.jsx
│   │   │   ├── BacklogTable.jsx
│   │   │   └── Charts.jsx
│   │   ├── hooks/
│   │   │   └── useSession.js
│   │   ├── services/
│   │   │   └── api.js        # All API calls centralized
│   │   └── utils/
│   │       └── helpers.js
│   ├── package.json
│   └── tailwind.config.js
└── docs/
    ├── ARCHITECTURE.md
    ├── DATA_SPEC.md
    └── ALGORITHMS.md
```

## Quick Start

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Environment
- Backend runs on `http://localhost:8000`
- Frontend runs on `http://localhost:5173`
- CORS configured in `main.py` for local dev

## Key Design Decisions
- Session ID stored in `localStorage`, sent as header `X-Session-ID`
- Session data stored as `.parquet` files in `/tmp/result_sessions/<session_id>/`
- Sessions auto-expire after 24 hours (background cleanup task)
- No database, no auth — stateless per session
