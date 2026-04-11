# Repository Guidelines

## Project Structure & Module Organization

`frontend/` contains the Next.js app. Main UI code lives in `frontend/src/components`, shared types in `frontend/src/types`, API helpers in `frontend/src/lib`, and global styles in `frontend/src/app/globals.css`. `backend/` contains the FastAPI service: `main.py` defines routes, `database.py` defines SQLite models, `parser/` handles PDF/EPUB ingestion, `dictionary/` handles lookup and lemmatization, `srs/` contains SM2 logic, and `tts/` contains audio generation. Specs live in `spec/`, planning notes in `plan/`, and backend tests in `backend/tests/`.

## Build, Test, and Development Commands

- `./start.sh`: starts backend on `:8000` and frontend on `:3000`.
- `cd frontend && npm run dev`: runs the Next.js dev server.
- `cd frontend && npm run build`: creates a production build.
- `cd frontend && npm run lint`: runs ESLint for the frontend.
- `cd backend && python -m uvicorn main:app --reload`: runs the FastAPI server locally.
- `cd backend && pytest`: runs backend tests if `pytest` is installed in your environment.

## Coding Style & Naming Conventions

Use TypeScript/React for frontend changes and Python for backend changes. Follow existing style in touched files: 2-space indentation is common in frontend config files, 4-space indentation in Python. Use `PascalCase` for React components, `camelCase` for functions and local variables, and `snake_case` for Python functions, API params, and spec filenames such as `spec/spec-design-word-context-tracking.md`. Keep feature logic close to the relevant module rather than creating broad utility layers prematurely.

## Testing Guidelines

Backend tests live under `backend/tests/` and use `test_*.py` naming. Add or update tests when changing API behavior, parsing, or persistence logic. There is no strong frontend test suite yet, so at minimum run `npm run lint` and verify the affected flow manually in the app. Focus coverage on route behavior, database updates, and regression-prone parsing logic.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit-style messages such as `feat(reader): ...`, `fix(Reader): ...`, and `perf(ocr): ...`. Keep commits small and descriptive. Pull requests should include: a short problem statement, a summary of the change, test/verification notes, and screenshots or recordings for UI updates. Link related specs or issues when the change implements planned work.

## Security & Configuration Tips

Do not commit local databases, uploaded books, generated audio, or secret keys. Use environment variables for API configuration when needed, and keep local-only paths out of committed code.
