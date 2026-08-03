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
# Only network/HTTP transport errors are retried; other exceptions (e.g.
# programming bugs) are allowed to propagate instead of being hidden.
NETWORK_EXCEPTIONS = (RequestException, OSError)
REQUEST_TIMEOUT_SECONDS = 30


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

    def upload_image_asset(self, data: bytes, filename: str) -> dict:
        """Uploads raw image bytes and returns the created asset document
        (contains at least `_id`)."""
        url = f"https://{self.project_id}.api.sanity.io/v{self.api_version}/assets/images/{self.dataset}"
        response = self.session.post(
            url,
            params={"filename": filename},
            data=data,
            headers={"Content-Type": "application/octet-stream"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()["document"]

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
        self.lock = threading.Lock()
        self.stats = {
            'uploaded': 0,
            'skipped': 0,
            'failed': 0,
            'errors': []
        }

    def get_file_hash(self, file_path: Path) -> str:
        """Generate MD5 hash for deduplication."""
        hasher = hashlib.md5()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                hasher.update(chunk)
        return hasher.hexdigest()

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
        """Upload a single photo to Sanity with retry."""
        valid, msg = self.validate_file(file_path)
        if not valid:
            with self.lock:
                self.stats['failed'] += 1
                self.stats['errors'].append(f"{file_path.name}: {msg}")
            print(f"  ✗ {file_path.name}: {msg}")
            return None

        file_hash = self.get_file_hash(file_path)

        with self.lock:
            if file_hash in self.uploaded_files:
                self.stats['skipped'] += 1
                return None
            self.uploaded_files.add(file_hash)

        for attempt in range(MAX_RETRIES):
            try:
                # Upload image asset
                with open(file_path, 'rb') as f:
                    asset = self.client.upload_image_asset(f.read(), file_path.name)

                # Create photo document. `_id` is deterministic (album +
                # content hash) so a retried/duplicate call is a safe no-op
                # via create_document_if_not_exists() instead of a duplicate.
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
                with self.lock:
                    self.stats['uploaded'] += 1
                print(f"  ✓ {file_path.name}")
                return result

            except NETWORK_EXCEPTIONS as e:
                if attempt < MAX_RETRIES - 1:
                    print(f"  ⚠ {file_path.name}: Retry {attempt + 1}/{MAX_RETRIES} ({e})")
                    time.sleep(RETRY_DELAY * (attempt + 1))
                else:
                    with self.lock:
                        self.uploaded_files.discard(file_hash)
                        self.stats['failed'] += 1
                        self.stats['errors'].append(f"{file_path.name}: {str(e)}")
                    print(f"  ✗ {file_path.name}: Failed after {MAX_RETRIES} attempts ({e})")
                    return None

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
