// Private file preview through the signed download route (never a public URL).
export function MediaPreview({ id, mime }: { id: string; mime: string }) {
  const src = `/api/media/${id}?ver=1`;
  if (mime.startsWith('image/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="Vista previa" className="max-h-[60vh] w-full rounded-[var(--radius-control)] bg-slate object-contain" />;
  }
  if (mime.startsWith('audio/')) return <audio src={src} controls preload="none" className="w-full" />;
  return <video src={src} controls preload="metadata" playsInline className="max-h-[60vh] w-full rounded-[var(--radius-control)] bg-slate" />;
}
