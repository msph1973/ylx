import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';

interface Album {
  _id: string;
  title: string;
  clientName: string;
}

interface UploadFile {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
}

interface UploadPageProps {
  adminName?: string;
}

export default function UploadPage({ adminName }: UploadPageProps) {
  const shouldReduceMotion = useReducedMotion();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<string>('');
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAlbums = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/albums');
      const data = await response.json();
      setAlbums(data.albums || []);
    } catch (err) {
      console.error('Failed to fetch albums');
    }
  }, []);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const validFiles = fileArray.filter(file => {
      const ext = file.name.toLowerCase().split('.').pop();
      const validExts = ['jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif'];
      if (!validExts.includes(ext || '')) return false;
      if (file.size > 50 * 1024 * 1024) return false;
      return true;
    });

    const uploadFiles: UploadFile[] = validFiles.map(file => ({
      file,
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      status: 'pending',
      progress: 0,
    }));

    setFiles(prev => [...prev, ...uploadFiles]);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
    }
  }, [addFiles]);

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setFiles(prev => prev.filter(f => f.status !== 'done'));
  }, []);

  const uploadSingleFile = async (uploadFile: UploadFile, albumId: string): Promise<boolean> => {
    const formData = new FormData();
    formData.append('file', uploadFile.file);
    formData.append('albumId', albumId);
    formData.append('filename', uploadFile.file.name);

    try {
      const xhr = new XMLHttpRequest();

      const result = await new Promise<boolean>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            setFiles(prev => prev.map(f =>
              f.id === uploadFile.id ? { ...f, progress } : f
            ));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(true);
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.open('POST', '/api/admin/upload');
        xhr.send(formData);
      });

      return result;
    } catch (err) {
      return false;
    }
  };

  const startUpload = async () => {
    if (!selectedAlbum || files.length === 0) return;

    setIsUploading(true);
    const pendingFiles = files.filter(f => f.status === 'pending');

    for (const uploadFile of pendingFiles) {
      setFiles(prev => prev.map(f =>
        f.id === uploadFile.id ? { ...f, status: 'uploading' } : f
      ));

      const success = await uploadSingleFile(uploadFile, selectedAlbum);

      setFiles(prev => prev.map(f =>
        f.id === uploadFile.id
          ? { ...f, status: success ? 'done' : 'error', progress: success ? 100 : 0, error: success ? undefined : 'Upload failed' }
          : f
      ));
    }

    setIsUploading(false);
  };

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const doneCount = files.filter(f => f.status === 'done').length;
  const errorCount = files.filter(f => f.status === 'error').length;

  return (
    <div className="upload-page">
      <div className="upload-header">
        <h2>Upload Photos</h2>
        <p className="upload-subtitle">Drag & drop photos or click to select</p>
      </div>

      {/* Album Selection */}
      <div className="album-select-section">
        <label htmlFor="album-select">Select Album</label>
        <select
          id="album-select"
          value={selectedAlbum}
          onChange={(e) => {
            setSelectedAlbum(e.target.value);
            if (albums.length === 0) fetchAlbums();
          }}
          onFocus={() => { if (albums.length === 0) fetchAlbums(); }}
        >
          <option value="">-- Select an album --</option>
          {albums.map(album => (
            <option key={album._id} value={album._id}>
              {album.title} ({album.clientName})
            </option>
          ))}
        </select>
      </div>

      {/* Drop Zone */}
      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.tiff,.tif"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <div className="drop-zone-content">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <p>Drop photos here or click to browse</p>
          <span>JPG, PNG, WebP, TIFF • Max 50MB each</span>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="file-list-section">
          <div className="file-list-header">
            <span>{files.length} photos selected</span>
            <div className="file-list-actions">
              {doneCount > 0 && (
                <button className="btn-text" onClick={clearCompleted}>
                  Clear completed ({doneCount})
                </button>
              )}
              <button className="btn-text" onClick={() => setFiles([])}>
                Clear all
              </button>
            </div>
          </div>

          <div className="file-list">
            <AnimatePresence>
              {files.map((uploadFile) => (
                <motion.div
                  key={uploadFile.id}
                  className={`file-item ${uploadFile.status}`}
                  initial={shouldReduceMotion ? {} : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={shouldReduceMotion ? {} : { opacity: 0, height: 0 }}
                >
                  <div className="file-info">
                    <span className="file-name">{uploadFile.file.name}</span>
                    <span className="file-size">
                      {(uploadFile.file.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                  <div className="file-status">
                    {uploadFile.status === 'pending' && (
                      <button className="btn-icon" onClick={() => removeFile(uploadFile.id)} aria-label="Remove file">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    )}
                    {uploadFile.status === 'uploading' && (
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${uploadFile.progress}%` }} />
                      </div>
                    )}
                    {uploadFile.status === 'done' && (
                      <span className="status-done">✓</span>
                    )}
                    {uploadFile.status === 'error' && (
                      <span className="status-error">✗</span>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Upload Button */}
          <div className="upload-actions">
            <button
              className="upload-btn"
              onClick={startUpload}
              disabled={!selectedAlbum || pendingCount === 0 || isUploading}
            >
              {isUploading
                ? 'Uploading...'
                : `Upload ${pendingCount} photos`
              }
            </button>
          </div>

          {/* Stats */}
          <div className="upload-stats">
            <span className="stat">Pending: {pendingCount}</span>
            <span className="stat success">Done: {doneCount}</span>
            {errorCount > 0 && (
              <span className="stat error">Failed: {errorCount}</span>
            )}
          </div>
        </div>
      )}

      <style>{`
        .upload-page {
          max-width: 800px;
        }

        .upload-header {
          margin-bottom: var(--space-6);
        }

        .upload-header h2 {
          font-family: var(--font-sans);
          font-size: var(--text-2xl);
          font-weight: var(--font-semibold);
          margin-bottom: var(--space-2);
        }

        .upload-subtitle {
          color: var(--color-text-muted);
          font-size: var(--text-sm);
        }

        .album-select-section {
          margin-bottom: var(--space-6);
        }

        .album-select-section label {
          display: block;
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text-muted);
          margin-bottom: var(--space-2);
        }

        .album-select-section select {
          width: 100%;
          padding: var(--space-3);
          background-color: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text);
          font-size: var(--text-base);
          cursor: pointer;
        }

        .album-select-section select:focus {
          outline: none;
          border-color: var(--color-accent);
        }

        .drop-zone {
          border: 2px dashed var(--color-border);
          border-radius: var(--radius-xl);
          padding: var(--space-12);
          text-align: center;
          cursor: pointer;
          transition: all var(--transition-fast);
          margin-bottom: var(--space-6);
        }

        .drop-zone:hover,
        .drop-zone.dragging {
          border-color: var(--color-accent);
          background-color: var(--color-surface);
        }

        .drop-zone-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-3);
          color: var(--color-text-muted);
        }

        .drop-zone-content svg {
          opacity: 0.5;
        }

        .drop-zone-content p {
          font-size: var(--text-base);
          color: var(--color-text);
          margin: 0;
        }

        .drop-zone-content span {
          font-size: var(--text-sm);
        }

        .file-list-section {
          background-color: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          overflow: hidden;
        }

        .file-list-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-4);
          border-bottom: 1px solid var(--color-border);
        }

        .file-list-actions {
          display: flex;
          gap: var(--space-3);
        }

        .btn-text {
          background: none;
          border: none;
          color: var(--color-text-muted);
          font-size: var(--text-sm);
          cursor: pointer;
          padding: 0;
        }

        .btn-text:hover {
          color: var(--color-text);
        }

        .file-list {
          max-height: 400px;
          overflow-y: auto;
        }

        .file-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-3) var(--space-4);
          border-bottom: 1px solid var(--color-border);
        }

        .file-item:last-child {
          border-bottom: none;
        }

        .file-info {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
          min-width: 0;
          flex: 1;
        }

        .file-name {
          font-size: var(--text-sm);
          color: var(--color-text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .file-size {
          font-size: var(--text-xs);
          color: var(--color-text-muted);
        }

        .file-status {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          min-width: 100px;
          justify-content: flex-end;
        }

        .btn-icon {
          background: none;
          border: none;
          color: var(--color-text-muted);
          cursor: pointer;
          padding: var(--space-1);
        }

        .btn-icon:hover {
          color: var(--color-error);
        }

        .progress-bar {
          width: 80px;
          height: 4px;
          background-color: var(--color-border);
          border-radius: var(--radius-full);
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background-color: var(--color-accent);
          transition: width var(--transition-fast);
        }

        .status-done {
          color: var(--color-success);
          font-weight: var(--font-medium);
        }

        .status-error {
          color: var(--color-error);
          font-weight: var(--font-medium);
        }

        .upload-actions {
          padding: var(--space-4);
          border-top: 1px solid var(--color-border);
        }

        .upload-btn {
          width: 100%;
          padding: var(--space-3);
          background-color: var(--color-accent);
          color: var(--color-bg);
          border: none;
          border-radius: var(--radius-md);
          font-size: var(--text-base);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: background-color var(--transition-fast);
        }

        .upload-btn:hover:not(:disabled) {
          background-color: var(--color-accent-hover);
        }

        .upload-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .upload-stats {
          display: flex;
          gap: var(--space-4);
          padding: var(--space-3) var(--space-4);
          border-top: 1px solid var(--color-border);
          font-size: var(--text-sm);
        }

        .stat {
          color: var(--color-text-muted);
        }

        .stat.success {
          color: var(--color-success);
        }

        .stat.error {
          color: var(--color-error);
        }
      `}</style>
    </div>
  );
}
