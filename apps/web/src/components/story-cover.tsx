import { coverImageUrl } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { useEffect, useRef, useState } from 'react';
import { coverPaletteIndex, coverTitleClass } from '../lib/cover-palette';
import { cn } from '../lib/utils';

export interface StoryCoverProps {
  title: string;
  /** Pen name (`display_name`) of the author. */
  authorName: string;
  /** Picks the default cover colour, so stories sharing a main tag share a colour. */
  mainTagSlug: string;
  /** Stored 600px cover URL (`stories.cover_url`), or `null` for the default text cover. */
  coverUrl: string | null;
  sizes?: string;
  /** Above-the-fold cover: load eagerly with high priority. */
  priority?: boolean;
  className?: string;
}

/**
 * A story cover at 2:3. With an uploaded cover it is a responsive `<img>` (300w/600w); without one
 * it is a text cover in pure HTML/CSS (title, pen name, colour from the main tag), so the
 * server-rendered markup is the same for everyone and needs no image or script.
 */
export function StoryCover({
  title,
  authorName,
  mainTagSlug,
  coverUrl,
  sizes = '(min-width: 768px) 200px, 45vw',
  priority = false,
  className,
}: StoryCoverProps) {
  // Remembers which URL failed, so a new URL gets a fresh chance to load.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const label = m.cover_alt({ title });

  // The server-rendered image can fail before React attaches `onError`; catch that on mount.
  useEffect(() => {
    const img = imgRef.current;
    if (coverUrl && img?.complete && img.naturalWidth === 0) setFailedUrl(coverUrl);
  }, [coverUrl]);

  if (coverUrl && failedUrl !== coverUrl) {
    const small = coverImageUrl(coverUrl, 300);
    const large = coverImageUrl(coverUrl, 600);
    return (
      <img
        ref={imgRef}
        src={large}
        srcSet={`${small} 300w, ${large} 600w`}
        sizes={sizes}
        width={600}
        height={900}
        alt={label}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        onError={() => setFailedUrl(coverUrl)}
        className={cn('aspect-[2/3] w-full rounded-md bg-muted object-cover', className)}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        '@container aspect-[2/3] w-full overflow-hidden rounded-md text-(--cover-fg)',
        className,
      )}
      // Only a numeric palette slot reaches `style`, never user text.
      style={{ backgroundColor: `var(--cover-${coverPaletteIndex(mainTagSlug)})` }}
    >
      <div
        aria-hidden="true"
        className="flex size-full flex-col p-3 supports-[width:1cqw]:p-[9cqw]"
      >
        <div className="flex min-h-0 flex-1 items-center">
          <p
            className={cn(
              'line-clamp-6 font-serif leading-tight font-medium text-balance wrap-anywhere',
              coverTitleClass(title),
            )}
          >
            {title}
          </p>
        </div>
        <hr className="w-1/4 border-current/60" />
        <p className="mt-2 truncate font-sans text-xs supports-[width:1cqw]:mt-[5cqw] supports-[width:1cqw]:text-[length:6.5cqw]">
          {authorName}
        </p>
      </div>
    </div>
  );
}
