import io
import os
import sys
import uuid

from fastapi.testclient import TestClient

# Ensure the backend folder is importable regardless of how pytest is invoked.
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import main


def test_upload_uses_uuid_filename(monkeypatch):
    """
    Uploading the same-named PDF twice should produce two different stored filenames,
    so we don't collide/overwrite on disk and URLs remain unique.
    """
    # Avoid kicking off PDF parsing in background tasks for this unit test.
    monkeypatch.setattr(main, "process_book_background", lambda book_id: None)

    client = TestClient(main.app)

    original_name = f"duplicate_name_{uuid.uuid4().hex}.pdf"
    payload = b"%PDF-1.4\n% fake pdf content for upload test\n"

    r1 = client.post(
        "/api/upload",
        files={"file": (original_name, io.BytesIO(payload), "application/pdf")},
    )
    assert r1.status_code == 200, r1.text

    r2 = client.post(
        "/api/upload",
        files={"file": (original_name, io.BytesIO(payload), "application/pdf")},
    )
    assert r2.status_code == 200, r2.text

    book_id_1 = r1.json()["book_id"]
    book_id_2 = r2.json()["book_id"]
    assert book_id_1 != book_id_2

    db = main.SessionLocal()
    try:
        b1 = db.query(main.Book).filter(main.Book.id == book_id_1).first()
        b2 = db.query(main.Book).filter(main.Book.id == book_id_2).first()
        assert b1 is not None
        assert b2 is not None

        assert b1.title == original_name
        assert b2.title == original_name

        assert b1.filename.endswith(".pdf")
        assert b2.filename.endswith(".pdf")
        assert b1.filename != original_name
        assert b2.filename != original_name
        assert b1.filename != b2.filename

        upload_dir = os.path.join(os.path.dirname(main.__file__), main.UPLOAD_DIR)
        assert os.path.exists(os.path.join(upload_dir, b1.filename))
        assert os.path.exists(os.path.join(upload_dir, b2.filename))
    finally:
        # Best-effort cleanup to avoid leaving test artifacts behind.
        try:
            upload_dir = os.path.join(os.path.dirname(main.__file__), main.UPLOAD_DIR)
            for book_id in (book_id_1, book_id_2):
                b = db.query(main.Book).filter(main.Book.id == book_id).first()
                if b:
                    try:
                        os.remove(os.path.join(upload_dir, b.filename))
                    except FileNotFoundError:
                        pass
                    db.delete(b)
            db.commit()
        finally:
            db.close()
