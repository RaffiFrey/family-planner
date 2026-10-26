import {
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
} from 'lucide-react';

type Kind = 'image' | 'video' | 'audio' | 'text' | 'sheet' | 'archive' | 'other';

function kindOf(mime: string): Kind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.includes('sheet') || mime.includes('excel') || mime === 'text/csv') return 'sheet';
  if (mime === 'application/pdf' || mime.startsWith('text/') || mime.includes('word'))
    return 'text';
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('tar')) return 'archive';
  return 'other';
}

export function FileIcon({
  mime,
  className = 'size-5 text-muted',
}: {
  mime: string;
  className?: string;
}) {
  switch (kindOf(mime)) {
    case 'image':
      return <FileImage className={className} aria-hidden />;
    case 'video':
      return <FileVideo className={className} aria-hidden />;
    case 'audio':
      return <FileAudio className={className} aria-hidden />;
    case 'sheet':
      return <FileSpreadsheet className={className} aria-hidden />;
    case 'text':
      return <FileText className={className} aria-hidden />;
    case 'archive':
      return <FileArchive className={className} aria-hidden />;
    case 'other':
      return <File className={className} aria-hidden />;
  }
}

export function FolderIcon({ className }: { className?: string }) {
  return <Folder className={className ?? 'size-5 fill-primary/20 text-primary'} aria-hidden />;
}
