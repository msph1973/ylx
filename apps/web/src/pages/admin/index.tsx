import React, { useState } from 'react';
import { AlbumList } from '@/components/admin/AlbumList';
import { AlbumDetail } from '@/components/admin/AlbumDetail';
import type { AlbumCardData } from '@/components/admin/AlbumCard';

export default function AdminPage() {
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);

  const handleSelectAlbum = (album: AlbumCardData) => {
    setSelectedAlbumId(album.id);
  };

  const handleBack = () => {
    setSelectedAlbumId(null);
  };

  return (
    <div className="admin-dashboard">
      {selectedAlbumId ? (
        <AlbumDetail albumId={selectedAlbumId} onBack={handleBack} />
      ) : (
        <AlbumList onSelectAlbum={handleSelectAlbum} />
      )}

      <style>{`
        .admin-dashboard {
          width: 100%;
        }
      `}</style>
    </div>
  );
}