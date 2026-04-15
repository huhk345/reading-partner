# Reading Partner 📚

An AI-powered SRS (Spaced Repetition System) reading assistant designed to help you master English through immersive reading, interactive lookup, and evidence-based vocabulary review.

## Key Features

- **Smart Book Reader**: Support for PDF and EPUB files with interactive word-by-word lookup and sentence parsing.
- **Contextual Dictionary**: Instant definitions, phonetics, and US/UK pronunciations. Leverages both Free Dictionary API and a local **ECDICT** database for lightning-fast translations.
- **Intelligent Lemmatization**: Automatically finds the root form of words (e.g., "running" → "run") to ensure accurate dictionary matches.
- **Word Wall (3D Graph)**: Visualize your vocabulary as an interactive 3D "star map" connecting Words → Sentences → Books using Three.js.
- **SRS Review System**: Spaced repetition based on the **SM2 algorithm** (similar to Anki), optimized for long-term retention.
- **Review Games**:
  - **Match Game**: Interactive card matching for word-meaning association.
  - **Word Completion**: Fill-in-the-blank challenges to test active recall.
- **AI-Powered TTS**: High-quality sentence pronunciation using **Coqui-AI (VoxCPM)** and **Web Speech API** fallbacks.
- **Reading Calendar**: Track your daily reading progress, word lookups, and review streaks with an integrated activity log.
- **Advanced OCR & LLM Parsing**: Automated OCR error correction and text cleaning powered by Large Language Models.

## Tech Stack

### Frontend
- **Framework**: [Next.js 15+](https://nextjs.org/) (App Router), React 19
- **Styling**: Tailwind CSS
- **Visualization**: [Three.js](https://threejs.org/) / [react-force-graph](https://github.com/vasturiano/react-force-graph)
- **State Management**: React Hooks & Context API

### Backend
- **Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.10+)
- **Database**: SQLite with [SQLAlchemy](https://www.sqlalchemy.org/) ORM
- **NLP**: [spaCy](https://spacy.io/) (for lemmatization and tokenization)
- **Audio/TTS**: [Coqui-AI TTS](https://github.com/coqui-ai/TTS) (VoxCPM)
- **Document Parsing**: [PyMuPDF](https://pymupdf.readthedocs.io/) (PDF), [EbookLib](https://github.com/aerkalov/ebooklib) (EPUB)
- **OCR**: [Tesseract OCR](https://github.com/tesseract-ocr/tesseract)

## Project Structure

```text
reading-partner/
├── frontend/           # Next.js Application
│   ├── src/app/        # Pages and API routes
│   ├── src/components/ # UI Components (Reader, Review, Calendar, Games)
│   └── src/lib/        # API clients and utilities
├── backend/            # FastAPI Application
│   ├── parser/         # PDF/EPUB parsing and OCR correction
│   ├── dictionary/     # Word lookup and lemmatization logic
│   ├── srs/            # SM2 algorithm implementation
│   ├── tts/            # Coqui-AI TTS engine
│   └── data/           # Local dictionary databases (ECDICT)
└── spec/               # Detailed design specifications
```

## Getting Started

### Prerequisites
- **Node.js**: 18.0 or higher
- **Python**: 3.10 or higher
- **Tesseract OCR**: Required for PDF image processing
- **ECDICT Database**: Place `ecdict.db` in `backend/data/` (optional but recommended for offline Chinese translations)

### Environment Variables

Create a `.env` file in the `backend/` directory with the following variables:

```bash
OPENROUTER_API_KEY=your_openrouter_api_key_here
DEFAULT_MODEL=nvidia/nemotron-3-super-120b-a12b:free
# Optional: Comma-separated list for model failover
# DEFAULT_MODEL=meta-llama/llama-3.1-8b-instruct,google/gemini-pro-1.5
```

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/your-repo/reading-partner.git
    cd reading-partner
    ```

2.  **Setup Backend**:
    ```bash
    cd backend
    pip install -r requirements.txt
    python -m spacy download en_core_web_sm
    ```

3.  **Setup Frontend**:
    ```bash
    cd ../frontend
    npm install
    ```

### Running the Application

You can use the provided convenience script:
```bash
./start.sh
```

Or run the services manually:

**Backend**:
```bash
cd backend
uvicorn main:app --reload --port 8000
```

**Frontend**:
```bash
cd frontend
npm run dev
```

Visit `http://localhost:3000` to start reading!

## Development

### Frontend
- **Linting**: `cd frontend && npm run lint`
- **Build**: `cd frontend && npm run build`

### Backend
- **Tests**: `cd backend && pytest`
- **Type Checking**: (If configured) `mypy .` or similar.

### Commands Summary
- `./start.sh`: Starts both backend and frontend.
- `cd backend && python -m uvicorn main:app --reload`: Starts FastAPI backend.
- `cd frontend && npm run dev`: Starts Next.js frontend.

## Contributing

1. Follow the existing coding style (PascalCase for React components, snake_case for Python).
2. Add tests for new backend features in `backend/tests/`.
3. Update relevant specifications in `spec/` if architectural changes are made.

## TODO

- [ ] **Mobile Optimization**: Improve reading experience on small screens and touch devices.

## License
MIT
