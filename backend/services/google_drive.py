"""Google Drive integration service.

Supports both OAuth2 (for user-delegated access via the browser Picker)
and service-account flows (for server-side uploads/downloads).

Usage
-----
    from services.google_drive import drive_service

    # Upload a local file
    file_id = await drive_service.upload_file(local_path, mime_type="image/jpeg")

    # Download a file
    data = await drive_service.download_file(file_id)
"""
import asyncio
import io
import json
import os
from pathlib import Path
from typing import Optional

from config import settings

try:
    from google.oauth2.credentials import Credentials
    from google.oauth2 import service_account
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload

    _GOOGLE_AVAILABLE = True
except ImportError:
    _GOOGLE_AVAILABLE = False


SCOPES = ["https://www.googleapis.com/auth/drive.file"]


class GoogleDriveService:
    """Thin async wrapper around the Drive v3 REST API."""

    def __init__(self):
        self._service = None  # lazily initialised

    # ── Initialisation ────────────────────────────────────────────────────────

    def _build_service(self):
        if not _GOOGLE_AVAILABLE:
            raise RuntimeError(
                "Google API client libraries are not installed. "
                "Run: pip install google-api-python-client google-auth-httplib2 "
                "google-auth-oauthlib"
            )

        creds = None
        token_path = Path(settings.google_token_file)
        creds_path = Path(settings.google_credentials_file)

        # Load existing token
        if token_path.exists():
            creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

        # Refresh or run local OAuth flow
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            elif creds_path.exists():
                flow = InstalledAppFlow.from_client_secrets_file(str(creds_path), SCOPES)
                creds = flow.run_local_server(port=0)
            else:
                raise RuntimeError(
                    f"Google credentials not found at '{creds_path}'. "
                    "Download OAuth2 client_secrets.json from Google Cloud Console."
                )
            # Persist token
            token_path.write_text(creds.to_json())

        return build("drive", "v3", credentials=creds)

    @property
    def service(self):
        if self._service is None:
            self._service = self._build_service()
        return self._service

    # ── Public API ────────────────────────────────────────────────────────────

    async def upload_file(
        self,
        local_path: Path,
        mime_type: str = "image/jpeg",
        parent_folder_id: Optional[str] = None,
    ) -> str:
        """Upload *local_path* to Drive and return the file ID."""
        folder_id = parent_folder_id or settings.google_drive_folder_id or None
        metadata = {"name": local_path.name}
        if folder_id:
            metadata["parents"] = [folder_id]

        media = MediaFileUpload(str(local_path), mimetype=mime_type, resumable=True)

        def _do_upload():
            return (
                self.service.files()
                .create(body=metadata, media_body=media, fields="id")
                .execute()
            )

        result = await asyncio.get_event_loop().run_in_executor(None, _do_upload)
        return result["id"]

    async def download_file(self, file_id: str) -> bytes:
        """Download a Drive file by ID and return raw bytes."""

        def _do_download():
            request = self.service.files().get_media(fileId=file_id)
            buf = io.BytesIO()
            downloader = MediaIoBaseDownload(buf, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
            return buf.getvalue()

        return await asyncio.get_event_loop().run_in_executor(None, _do_download)

    async def list_files(self, folder_id: Optional[str] = None) -> list:
        """Return a list of {id, name, mimeType} dicts."""
        folder_id = folder_id or settings.google_drive_folder_id or None
        query = f"'{folder_id}' in parents and trashed=false" if folder_id else "trashed=false"

        def _do_list():
            return (
                self.service.files()
                .list(q=query, fields="files(id,name,mimeType,size)")
                .execute()
            )

        result = await asyncio.get_event_loop().run_in_executor(None, _do_list)
        return result.get("files", [])

    async def delete_file(self, file_id: str) -> None:
        """Permanently delete a Drive file."""

        def _do_delete():
            self.service.files().delete(fileId=file_id).execute()

        await asyncio.get_event_loop().run_in_executor(None, _do_delete)


drive_service = GoogleDriveService()
