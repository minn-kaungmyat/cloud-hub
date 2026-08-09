import { useEffect, useState, useMemo, useRef } from 'react';
import { X, Download, FileIcon, Loader2 } from 'lucide-react';
import { useFileStore } from '../store/fileStore';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { formatFileSize, formatDate } from '../utils/format';
import { useQueryClient } from '@tanstack/react-query';
import { VideoPlayer } from './VideoPlayer';
import type { CloudFile } from '../types';
import type { FilesResponse } from '../hooks/useFiles';

export const FilePreviewModal = () => {
  const { previewOpen, setPreviewOpen } = useUIStore();
  const { selectedFileId } = useFileStore();
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [currentUrl, setCurrentUrl] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Find the selected file from the query cache
  const file = useMemo(() => {
    if (!previewOpen || !selectedFileId) return null;
    let foundFile: CloudFile | null = null;
    const queries = queryClient.getQueryCache().findAll();
    for (const query of queries) {
      const data = query.state.data as { pages?: FilesResponse[] } | undefined;
      if (data?.pages) {
        for (const page of data.pages) {
          const match = page.files.find(f => f.id === selectedFileId);
          if (match) {
            foundFile = match;
            break;
          }
        }
      }
      if (foundFile) break;
    }
    return foundFile;
  }, [previewOpen, selectedFileId, queryClient]);

  const downloadUrl = file ? `${import.meta.env.VITE_API_URL}/api/files/${file.id}/download?token=${token}` : '';
  const previewUrl = file ? `${downloadUrl}&inline=true` : '';

  if (currentUrl !== previewUrl) {
    setCurrentUrl(previewUrl);
    setMediaLoading(true);
    setLoadingText(true);
    setTextPreview(null);
  }

  const isSsoi = file ? /\.ssoi$/i.test(file.name) : false;
  const isDrawio = file ? !isSsoi && (file.mimeType === 'application/vnd.jgraph.mxfile' || /\.drawio$/i.test(file.name)) : false;
  const isImage = file ? !isSsoi && (file.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name)) : false;
  const isVideo = file ? !isSsoi && (file.mimeType?.startsWith('video/') || /\.(mp4|webm|ogg|mov|mkv)$/i.test(file.name) || (/\.ts$/i.test(file.name) && file.size > 5 * 1024 * 1024)) : false;
  const isPdf = file ? !isSsoi && (file.mimeType === 'application/pdf' || /\.pdf$/i.test(file.name)) : false;
  const isText = file ? !isSsoi && !isDrawio && !isVideo && (file.mimeType?.startsWith('text/') || file.mimeType === 'application/json' || /\.(txt|js|ts|jsx|tsx|css|html|md|json)$/i.test(file.name)) : false;
  const isTextTooLarge = file ? isText && file.size > 2 * 1024 * 1024 : false;

  useEffect(() => {
    if (!previewOpen || !file) return;

    if ((isText && !isTextTooLarge) || isDrawio) {
      let active = true;
      fetch(previewUrl)
        .then(r => r.text())
        .then(text => {
          if (active) {
            setTextPreview(text);
            setLoadingText(false);
          }
        })
        .catch(() => {
          if (active) {
            setTextPreview('Failed to load file preview.');
            setLoadingText(false);
          }
        });
      return () => { active = false; };
    }
  }, [previewOpen, file, previewUrl, isText, isTextTooLarge, isDrawio]);

  // Handle Draw.io iframe communication
  useEffect(() => {
    if (!isDrawio || !textPreview || !previewOpen) return;

    const handleMessage = (e: MessageEvent) => {
      if (typeof e.data !== 'string') return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.event === 'init') {
          iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ action: 'load', xml: textPreview }),
            '*'
          );
        }
      } catch {
        // Ignore parse errors from other messages
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isDrawio, textPreview, previewOpen]);

  // Handle Escape key and Spacebar to toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape' && previewOpen) {
        setPreviewOpen(false);
      }
      // Note: We deliberately removed the 'Space' key event here so that 
      // the spacebar natively plays/pauses the video via Vidstack.
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewOpen, setPreviewOpen]);

  if (!previewOpen || !file) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-4 sm:p-8 backdrop-blur-sm"
      onClick={(e) => {
        // Only close if they specifically clicked the background backdrop, not the children
        if (e.target === e.currentTarget) {
          setPreviewOpen(false);
        }
      }}
    >
      
      {/* Header */}
      <div className="absolute top-0 left-0 w-full z-50 flex items-center justify-between p-4 sm:p-6 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="bg-zinc-800/80 p-2 rounded-md shadow-lg">
            <FileIcon className="text-zinc-300" size={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-zinc-200 text-sm font-medium drop-shadow-md">{file.name}</span>
            <span className="text-zinc-400 text-xs font-mono drop-shadow-md">
              {formatFileSize(Number(file.size))} • {formatDate(file.modifiedTime)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <a
            href={downloadUrl}
            download={file.name}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-200 rounded-md transition-colors shadow-lg backdrop-blur-md"
          >
            <Download size={16} />
            <span className="hidden sm:inline">Download</span>
          </a>
          <button
            onClick={() => setPreviewOpen(false)}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-zinc-700/80 text-zinc-300 transition-colors bg-zinc-800/80 shadow-lg backdrop-blur-md"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {isImage ? (
          <div className="relative w-full h-full max-h-[80vh] flex items-center justify-center px-4 sm:px-8">
            {mediaLoading && <Loader2 className="absolute animate-spin text-zinc-500" size={32} />}
            <img
              src={previewUrl}
              alt={file.name}
              className={`pointer-events-auto max-w-full max-h-[80vh] object-contain drop-shadow-2xl transition-opacity duration-300 ${mediaLoading ? 'opacity-0' : 'opacity-100'}`}
              onLoad={() => setMediaLoading(false)}
              onError={() => setMediaLoading(false)}
            />
          </div>
        ) : isPdf ? (
          <div className="relative w-full max-w-5xl h-[80vh] flex items-center justify-center px-4 sm:px-8">
            {mediaLoading && <Loader2 className="absolute animate-spin text-zinc-500" size={32} />}
            <iframe
              src={previewUrl}
              className={`pointer-events-auto w-full h-full rounded-lg shadow-2xl bg-zinc-900 transition-opacity duration-300 ${mediaLoading ? 'opacity-0' : 'opacity-100'}`}
              title={file.name}
              onLoad={() => setMediaLoading(false)}
              onError={() => setMediaLoading(false)}
            />
          </div>
        ) : isDrawio ? (
          <div className="relative w-full max-w-5xl h-[80vh] flex items-center justify-center px-4 sm:px-8">
            {(mediaLoading || loadingText) && <Loader2 className="absolute animate-spin text-zinc-500" size={32} />}
            {textPreview && (
              <iframe
                ref={iframeRef}
                src="https://embed.diagrams.net/?embed=1&proto=json&spin=1&ui=min&lightbox=1&chrome=0"
                className={`pointer-events-auto w-full h-full rounded-lg shadow-2xl bg-zinc-900 transition-opacity duration-300 ${mediaLoading ? 'opacity-0' : 'opacity-100'}`}
                title={file.name}
                onLoad={() => setMediaLoading(false)}
                onError={() => setMediaLoading(false)}
              />
            )}
          </div>
        ) : isVideo ? (
          <div className="w-full px-4 sm:px-8 flex items-center justify-center">
            <div className="pointer-events-auto w-full max-w-5xl">
              <VideoPlayer file={file} previewUrl={previewUrl} />
            </div>
          </div>
        ) : isText ? (
          <div className="w-full max-w-4xl max-h-[80vh] bg-zinc-900/50 rounded-lg shadow-2xl overflow-auto p-6 backdrop-blur-sm pointer-events-auto mx-4 sm:mx-8 border border-white/10">
            {isTextTooLarge ? (
              <div className="flex h-full items-center justify-center text-zinc-400">File is too large to preview directly.</div>
            ) : loadingText ? (
              <div className="flex h-full items-center justify-center text-zinc-400">Loading preview...</div>
            ) : (
              <pre className="text-zinc-300 text-sm font-mono whitespace-pre-wrap">{textPreview}</pre>
            )}
          </div>
        ) : (
          /* Fallback for unsupported files */
          <div className="flex flex-col items-center justify-center p-8 max-w-md w-full text-center pointer-events-auto">
            <FileIcon size={64} className="text-zinc-600 mb-6 drop-shadow-lg" strokeWidth={1} />
            <h3 className="text-xl font-light text-zinc-300 mb-2">No preview available</h3>
            <p className="text-zinc-500 text-sm mb-8">
              This {file.isFolder ? 'folder' : 'file format'} cannot be displayed directly in CloudHub.
            </p>
            <a
              href={downloadUrl}
              download={file.name}
              className="flex items-center gap-2 px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-full transition-all duration-200 shadow-lg border border-white/10"
            >
              <Download size={18} />
              Download File
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
