#!/usr/bin/env python3
"""
YLx Photo Batch Upload Script
Upload photos to Sanity with batch processing and folder watching.

Usage:
  python upload.py --folder /path/to/photos --album-id <album_id>
  python upload.py --folder /path/to/photos --album-id <album_id> --watch
  python upload.py --folder /path/to/photos --album-id <album_id> --batch-size 50

Requirements:
  pip install requests watchdog
"""

import argparse
import hashlib
import mimetypes
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional

import requests
from requests.exceptions import RequestException

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
except ImportError:
    Observer = None
    FileSystemEventHandler = object
    print("Warning: watchdog not installed. Watch mode disabled. Run: pip install watchdog")

# Configuration
SUPPORTED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.raw', '.cr2', '.nef', '.arw'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
DEFAULT_BATCH_SIZE = 100
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds
# Only genuine transport failures are retried — connection refused/reset,
# DNS, or a timeout. Deliberately NOT the broad `RequestException` (which
# also covers `HTTPError` raised by raise_for_status()), because retrying on
# a 4xx client error (401, 400, 403) is futile and masks a real bug; and NOT
# a bare `OSError` so a missing/unreadable local file fails loudly instead of
# being retried as a flaky connection.
NETWORK_EXCEPTIONS = (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
REQUEST_TIMEOUT_SECONDS = 30


# Per-format override because the stdlib `mimetypes` table does not reliably
# cover RAW camera formats. Any `< 0.4.5`-style unknown type falls back to
# octet-stream, which Sanity's image endpoint rejects, so the known formats
# must be explicit.
_MIME_OVERRIDES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    # RAW camera formats Sanity can't down-convert need an explicit image/*
    # type too, or they'd fall back to octet-stream below and be rejected.
    '.cr2': 'image/x-canon-cr2',
    '.nef': 'image/x-nikon-nef',
    '.arw': 'image/x-sony-arw',
    '.raw': 'application/octet-stream',
}


def guess_image_mime(file_path: Path) -> str:
    """Return the image/* MIME type for `file_path`, with an explicit fallback
    for the RAW/Camera formats Sanity accepts but `mimetypes` may not know."""
    ext = file_path.suffix.lower()
    if ext in _MIME_OVERRIDES:
        return _MIME_OVERRIDES[ext]
    guessed, _ = mimetypes.guess_type(file_path.name, strict=False)
    return guessed if guessed else 'application/octet-stream'


class SanityClient:
    """Minimal Sanity HTTP API client covering just what this script needs:
    uploading an image asset and creating a document. No published Python
    package on PyPI actually provides the `SanityClient(projectId=...)` /
    `.upload()`/`.create()` surface this script used to assume — this talks
    directly to Sanity's documented HTTP API instead of depending on a
    package that doesn't exist (see https://www.sanity.io/docs/http-api).
    """

    def __init__(self, project_id: str, dataset: str, api_version: str, token: str):
        self.project_id = project_id
        self.dataset = dataset
        self.api_version = api_version
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {token}"

    def upload_image_asset(self, data, filename: str, content_type: Optional[str] = None) -> dict:
        """Uploads an image (bytes or a binary file-like object, so large files
        are streamed instead of buffered whole) and returns the created asset
        document (contains at least `_id`).
        Content-Type is derived from the file so Sanity's image endpoint does
        not reject a valid JPEG/PNG with `application/octet-stream`."""
        url = f"https://{self.project_id}.api.sanity.io/v{self.api_version}/assets/images/{self.dataset}"
        headers = {}
        if content_type:
            headers["Content-Type"] = content_type
        response = self.session.post(
            url,
            params={"filename": filename},
            data=data,
            headers=headers,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()["document"]

    def append_photo_to_album(self, album_id: str, photo_id: str) -> dict:
        """Append a created photo document's `_id` reference to the album's
        ordered `photos` array. Without this the gallery/admin never sees the
        photo even though the document exists."""
        url = f"https://{self.project_id}.api.sanity.io/v{self.api_version}/data/mutate/{self.dataset}"
        response = self.session.post(
            url,
            json={
                "mutations": [
                    {
                        "patch": {
                            "id": album_id,
                            "setIfMissing": {"photos": []},
                            "insert": {
                                "at": "after",
                                "after": "photos[-1]",
                                "items": [
                                    {"_type": "reference", "_ref": photo_id, "_key": photo_id}
                                ],
                            },
                        }
                    }
                ]
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()

    def create_document_if_not_exists(self, document: dict) -> dict:
        """Creates `document` (which must include a deterministic `_id`) via
        `createIfNotExists`, so retrying after a crash-but-actually-succeeded
        write is a safe no-op instead of a duplicate or a 409."""
        url = f"https://{self.project_id}.api.sanity.io/v{self.api_version}/data/mutate/{self.dataset}"
        response = self.session.post(
            url,
            json={"mutations": [{"createIfNotExists": document}]},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()


class SanityUploader:
    def __init__(self, project_id: str, dataset: str, token: str):
        self.client = SanityClient(
            project_id=project_id,
            dataset=dataset,
            api_version="2024-01-01",
            token=token,
        )
        self.uploaded_files = set()
        self.claimed_files = set()  # hashes currently being uploaded by a worker
        self.lock = threading.Lock()
        # Condition over `lock` for wait/notify on claim-completion. Replaces
        # the earlier busy-sleep loop that manually released and re-acquired
        # `self.lock` inside a `with self.lock:` block — that pattern leaves a
        # window where an exception between release() and acquire() makes the
        # with-block's exit release an already-unlocked (or double-held) lock,
        # risking RuntimeError/deadlock.
        self.cond = threading.Condition(self.lock)
        self.stats = {
            'uploaded': 0,
            'skipped': 0,
            'failed': 0,
            'errors': []
        }

    def get_file_hash(self, file_path: Path) -> Optional[str]:
        """Generate MD5 hash for deduplication, or None if the file goes
        missing/unreadable in the validate→hash window (caller treats None as
        a hard failure instead of a retryable network error)."""
        try:
            hasher = hashlib.md5()
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(8192), b''):
                    hasher.update(chunk)
            return hasher.hexdigest()
        except OSError:
            return None

    def validate_file(self, file_path: Path) -> tuple[bool, str]:
        """Validate file before upload."""
        if not file_path.exists():
            return False, "File not found"

        if file_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            return False, f"Unsupported file type: {file_path.suffix}"

        file_size = file_path.stat().st_size
        if file_size > MAX_FILE_SIZE:
            return False, f"File too large: {file_size / 1024 / 1024:.1f}MB (max 50MB)"

        if file_size == 0:
            return False, "File is empty"

        return True, "OK"

    def upload_single(self, file_path: Path, album_id: str) -> Optional[dict]:
        """Upload a single photo to Sanity with retry.

        A file's hash is claimed only *while* it is being uploaded; it moves to
        `uploaded_files` (dedup) only after the asset, document, and album-append
        all succeed. Any failure frees the claim so a later retry can take it
        again instead of being skipped forever."""
        valid, msg = self.validate_file(file_path)
        if not valid:
            with self.lock:
                self.stats['failed'] += 1
                self.stats['errors'].append(f"{file_path.name}: {msg}")
            print(f"  ✗ {file_path.name}: {msg}")
            return None

        file_hash = self.get_file_hash(file_path)
        if file_hash is None:
            with self.lock:
                self.stats['failed'] += 1
                self.stats['errors'].append(f"{file_path.name}: file unreadable after validation")
            print(f"  ✗ {file_path.name}: file unreadable")
            return None

        # Claim the hash so concurrent same-content files don't both upload;
        # the claim is only released back into a retryable state on failure.
        with self.cond:
            if file_hash in self.uploaded_files:
                self.stats['skipped'] += 1
                return None
            claimed_by_another = False
            while file_hash in self.claimed_files:
                # Another worker is uploading the same content. Wait (blocking,
                # race-free) for it to finish rather than polling with a manual
                # lock release/acquire — when the holder's claim completes
                # (success, failure, or the finally below) it notifies us, so
                # we know the outcome without holding up the lock or risking a
                # double-upload. No timeout: the claim holder is guaranteed to
                # free the hash (see the finally + _mark_failed paths), so
                # this wait always terminates on its own.
                claimed_by_another = True
                self.cond.wait()
            if claimed_by_another and file_hash in self.uploaded_files:
                self.stats['skipped'] += 1
                return None
            self.claimed_files.add(file_hash)

        # Note: claim-holder must notify after mutating claimed_files/
        # uploaded_files, done via self._notify_claims() in the finally and
        # in _mark_failed. Success path also notifies after moving the hash.
        try:
            for attempt in range(MAX_RETRIES):
                try:
                    # Upload image asset — stream the file object so large
                    # files don't buffer fully in memory.
                    mime = guess_image_mime(file_path)
                    try:
                        with open(file_path, 'rb') as f:
                            asset = self.client.upload_image_asset(f, file_path.name, mime)
                    except OSError as e:
                        # Local file became unreadable (deleted/perm-changed)
                        # between validation and upload — this is not a
                        # retryable transport failure, so fail the file loudly
                        # instead of aborting the whole batch.
                        self._mark_failed(file_path, file_hash, f"cannot open file: {e}", "local")
                        return None

                    # Create photo document. `_id` is deterministic (album +
                    # content hash) so a retried/duplicate call is a safe
                    # no-op via create_document_if_not_exists().
                    photo_doc = {
                        '_id': f"photo.{album_id}.{file_hash}",
                        '_type': 'photo',
                        'filename': file_path.name,
                        'image': {
                            '_type': 'image',
                            'asset': {
                                '_type': 'reference',
                                '_ref': asset['_id']
                            }
                        },
                        'album': {
                            '_type': 'reference',
                            '_ref': album_id
                        }
                    }

                    result = self.client.create_document_if_not_exists(photo_doc)
                    # Wire the new photo into the album's ordered photos[]
                    # array so it actually appears in the gallery/admin.
                    self.client.append_photo_to_album(album_id, photo_doc['_id'])

                    # Only now mark as uploaded (dedup only on full success).
                    with self.cond:
                        self.claimed_files.discard(file_hash)
                        self.uploaded_files.add(file_hash)
                        self.stats['uploaded'] += 1
                        self.cond.notify_all()
                    print(f"  ✓ {file_path.name}")
                    return result

                except NETWORK_EXCEPTIONS as e:
                    if attempt < MAX_RETRIES - 1:
                        print(f"  ⚠ {file_path.name}: Retry {attempt + 1}/{MAX_RETRIES} ({e})")
                        time.sleep(RETRY_DELAY * (attempt + 1))
                    else:
                        self._mark_failed(file_path, file_hash, e, "network")
                        return None
        finally:
            # If control exits without having moved the hash to uploaded_files
            # (any failure path), free the claim so a retry can re-own it, and
            # wake any worker waiting on this claim.
            with self.cond:
                if file_hash in self.claimed_files and file_hash not in self.uploaded_files:
                    self.claimed_files.discard(file_hash)
                self.cond.notify_all()

    def _mark_failed(self, file_path: Path, file_hash: Optional[str], err, kind: str):
        with self.cond:
            if file_hash:
                self.claimed_files.discard(file_hash)
            self.stats['failed'] += 1
            self.stats['errors'].append(f"{file_path.name}: {err}")
            self.cond.notify_all()
        print(f"  ✗ {file_path.name}: Failed ({kind}) ({err})")

    def upload_batch(self, files: list[Path], album_id: str, batch_size: int = DEFAULT_BATCH_SIZE):
        """Upload photos in batches."""
        total = len(files)
        print(f"\n📦 Uploading {total} photos to album {album_id}")
        print(f"   Batch size: {batch_size}")

        for i in range(0, total, batch_size):
            batch = files[i:i + batch_size]
            batch_num = i // batch_size + 1
            total_batches = (total + batch_size - 1) // batch_size

            print(f"\n🔄 Batch {batch_num}/{total_batches} ({len(batch)} photos)")

            with ThreadPoolExecutor(max_workers=4) as executor:
                futures = {
                    executor.submit(self.upload_single, file, album_id): file
                    for file in batch
                }

                for future in as_completed(futures):
                    future.result()  # Raise any exceptions

        return self.stats

    def print_summary(self):
        """Print upload summary."""
        print(f"\n{'='*50}")
        print(f"📊 Upload Summary")
        print(f"{'='*50}")
        print(f"  ✓ Uploaded: {self.stats['uploaded']}")
        print(f"  ⊘ Skipped:  {self.stats['skipped']}")
        print(f"  ✗ Failed:   {self.stats['failed']}")

        if self.stats['errors']:
            print(f"\n❌ Errors:")
            for error in self.stats['errors']:
                print(f"  - {error}")


class WatchFolderHandler(FileSystemEventHandler):
    """Watch for new photos and auto-upload."""

    def __init__(self, uploader: SanityUploader, album_id: str, batch_size: int):
        self.uploader = uploader
        self.album_id = album_id
        self.batch_size = batch_size
        self.pending_files = []

    def on_created(self, event):
        if event.is_directory:
            return

        file_path = Path(event.src_path)
        if file_path.suffix.lower() in SUPPORTED_EXTENSIONS:
            print(f"\n📸 New photo detected: {file_path.name}")
            self.pending_files.append(file_path)

            # Debounce: wait 2 seconds for more files
            if len(self.pending_files) == 1:
                import threading
                threading.Timer(2.0, self.process_pending).start()

    def process_pending(self):
        if not self.pending_files:
            return

        files = self.pending_files.copy()
        self.pending_files.clear()

        print(f"\n📤 Processing {len(files)} new photos...")
        self.uploader.upload_batch(files, self.album_id, self.batch_size)
        self.uploader.print_summary()


def scan_folder(folder: Path) -> list[Path]:
    """Scan folder for supported image files."""
    files = []
    for file in folder.rglob('*'):
        if file.is_file() and file.suffix.lower() in SUPPORTED_EXTENSIONS:
            files.append(file)
    return sorted(files)


def main():
    parser = argparse.ArgumentParser(
        description='YLx Photo Batch Upload to Sanity',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Upload all photos in folder
  python upload.py --folder ./photos --album-id abc123

  # Upload with custom batch size
  python upload.py --folder ./photos --album-id abc123 --batch-size 50

  # Watch folder for new photos
  python upload.py --folder ./photos --album-id abc123 --watch

  # Use environment variables for credentials
  export SANITY_PROJECT_ID=your_project_id
  export SANITY_API_TOKEN=your_token
  python upload.py --folder ./photos --album-id abc123
        """
    )

    parser.add_argument('--folder', '-f', required=True, help='Path to photo folder')
    parser.add_argument('--album-id', '-a', required=True, help='Sanity album document ID')
    parser.add_argument('--batch-size', '-b', type=int, default=DEFAULT_BATCH_SIZE,
                        help=f'Photos per batch (default: {DEFAULT_BATCH_SIZE})')
    parser.add_argument('--watch', '-w', action='store_true',
                        help='Watch folder for new photos')
    parser.add_argument('--project-id', help='Sanity project ID (or use SANITY_PROJECT_ID env)')
    parser.add_argument('--dataset', default='production', help='Sanity dataset (default: production)')

    args = parser.parse_args()

    # Get credentials from args or environment
    project_id = args.project_id or os.environ.get('SANITY_PROJECT_ID')
    token = os.environ.get('SANITY_API_TOKEN')

    if not project_id:
        print("Error: Sanity project ID required. Use --project-id or set SANITY_PROJECT_ID env")
        sys.exit(1)

    if not token:
        print("Error: Sanity API token required. Set SANITY_API_TOKEN environment variable")
        sys.exit(1)

    # Validate folder
    folder = Path(args.folder)
    if not folder.exists():
        print(f"Error: Folder not found: {folder}")
        sys.exit(1)

    # Initialize uploader
    uploader = SanityUploader(project_id, args.dataset, token)

    if args.watch:
        # Watch mode
        if Observer is None:
            print("Error: watchdog package required for watch mode. Run: pip install watchdog")
            sys.exit(1)

        print(f"👁 Watching folder: {folder}")
        print(f"   Album: {args.album_id}")
        print(f"   Press Ctrl+C to stop\n")

        handler = WatchFolderHandler(uploader, args.album_id, args.batch_size)
        observer = Observer()
        observer.schedule(handler, str(folder), recursive=True)
        observer.start()

        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            observer.stop()
            observer.join()
            print("\n\n🛑 Stopped watching")
            uploader.print_summary()
    else:
        # One-time upload
        files = scan_folder(folder)
        if not files:
            print(f"No supported photos found in {folder}")
            print(f"Supported formats: {', '.join(SUPPORTED_EXTENSIONS)}")
            sys.exit(0)

        uploader.upload_batch(files, args.album_id, args.batch_size)
        uploader.print_summary()


if __name__ == '__main__':
    main()
