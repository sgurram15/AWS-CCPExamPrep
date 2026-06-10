from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..ingestion import ingest, parse_file
from ..models import User
from ..schemas import IngestReport

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/ingest", response_model=IngestReport)
async def ingest_dataset(
    file: UploadFile = File(...),
    shuffle: bool = Query(default=None, description="override option-shuffle behaviour"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> IngestReport:
    """Upload a JSON/CSV/XLSX question file and import it.

    Any authenticated user may import in this light build; gate by an admin
    flag / subscription_status before exposing publicly.
    """
    content = await file.read()
    try:
        raw = parse_file(file.filename or "upload.json", content)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not parse file: {exc}") from exc

    do_shuffle = settings.shuffle_options_on_ingest if shuffle is None else shuffle
    return ingest(db, raw, shuffle=do_shuffle)
