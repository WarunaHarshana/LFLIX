'use client';

import { useState, useEffect, useCallback } from 'react';
import { DownloadCloud } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { useDownloads } from '../hooks/useDownloads';

export default function GlobalDropzone() {
  const [isDragging, setIsDragging] = useState(false);
  const { showToast } = useToast();
  const { setShowDownloads, fetchDownloads } = useDownloads();

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.types.includes('Files') || e.dataTransfer?.types.includes('text/plain')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only set dragging to false if we leave the actual window, not children
    if (e.clientX === 0 && e.clientY === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!e.dataTransfer) return;

    try {
      // 1. Check for files (.torrent)
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.name.endsWith('.torrent')) {
          showToast(`Adding torrent: ${file.name}...`, 'success');
          
          const reader = new FileReader();
          reader.onload = async (event) => {
            const base64 = event.target?.result as string;
            if (!base64) {
              showToast('Failed to read torrent file', 'error');
              return;
            }

            try {
              const res = await fetch('/api/downloads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  torrentBase64: base64,
                  filename: file.name
                })
              });
              
              const data = await res.json();
              if (res.ok) {
                showToast('Torrent added successfully', 'success');
                // Auto-open downloads panel
                await fetchDownloads();
                setShowDownloads(true);
              } else {
                showToast(`Error: ${data.error}`, 'error');
              }
            } catch (err) {
              showToast('Failed to upload torrent', 'error');
            }
          };
          reader.onerror = () => showToast('Failed to read torrent file', 'error');
          reader.readAsDataURL(file);
          return;
        } else {
          showToast('Only .torrent files are supported', 'error');
          return;
        }
      }

      // 2. Check for text/plain (Magnet URIs)
      const text = e.dataTransfer.getData('text/plain');
      if (text) {
        const url = text.trim();
        if (url.startsWith('magnet:?')) {
          showToast('Adding magnet link...', 'success');
          const res = await fetch('/api/downloads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ magnetUri: url })
          });
          const data = await res.json();
          if (res.ok) {
            showToast('Magnet link added successfully', 'success');
            // Auto-open downloads panel
            await fetchDownloads();
            setShowDownloads(true);
          } else {
            showToast(`Error: ${data.error}`, 'error');
          }
          return;
        } else {
          // Check if it's an HTTP direct link just in case
          if (url.startsWith('http')) {
             // Optional: Handle HTTP links if desired, or skip
             showToast('Not a valid magnet link', 'error');
          }
        }
      }
    } catch (err) {
      console.error('Drop error:', err);
      showToast('Failed to process dropped item', 'error');
    }
  }, [showToast, setShowDownloads, fetchDownloads]);

  useEffect(() => {
    // Add event listeners to the window
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  if (!isDragging) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
      <div className="bg-neutral-900 border-2 border-dashed border-red-500 rounded-3xl p-16 flex flex-col items-center justify-center shadow-2xl shadow-red-500/20 max-w-lg w-full">
        <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center mb-6 animate-pulse">
          <DownloadCloud className="w-12 h-12 text-red-500" />
        </div>
        <h2 className="text-3xl font-bold text-white mb-3 text-center">Drop to Download</h2>
        <p className="text-neutral-400 text-center text-lg">
          Release your .torrent file or magnet link here to start downloading immediately to your library.
        </p>
      </div>
    </div>
  );
}
