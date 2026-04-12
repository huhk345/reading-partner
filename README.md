# Reading Partner

An SRS (Spaced Repetition System) reading assistant that helps you read English books, look up words, and review vocabulary using proven spaced repetition techniques.

## Features

- **Book Reader** - Upload and read PDF/EPUB files with interactive word lookup
- **Dictionary Lookup** - Click on any word to see definitions, phonetics, and pronunciation
- **Vocabulary Builder** - Save words to your personal vocabulary list
- **Word Wall Graph View** - Explore your saved vocab as a 3D “star map” graph (Word → Sentence → Book)
- **SRS Review** - Spaced repetition复习系统 based on SM2 algorithm (Anki同款)
- **Text-to-Speech** - Listen to sentences using Web Speech API

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS
- **Backend**: FastAPI (Python)
- **Database**: SQLite
- **APIs**: Free Dictionary API, OpenRouter (LLM fallback)

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+
- uv (optional, for Python package management)

### Installation

1. Clone the repository
2. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```
3. Install backend dependencies:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

### Running the App

Use the provided start script:
```bash
./start.sh
```

Or run manually:
```bash
# Terminal 1 - Backend
cd backend
uvicorn main:app --reload

# Terminal 2 - Frontend
cd frontend
npm run dev
```

The app will be available at `http://localhost:3000`

## Project Structure

```
reading-partner/
├── frontend/           # Next.js frontend
│   ├── app/           # App router pages
│   ├── components/    # React components
│   └── utils/         # Utility functions
├── backend/           # FastAPI backend
│   ├── parser/        # PDF/EPUB parsing
│   ├── dictionary/    # Word lookup
│   ├── srs/           # SM2 algorithm
│   └── tts/           # Text-to-speech
└── database/
```

## License

MIT
