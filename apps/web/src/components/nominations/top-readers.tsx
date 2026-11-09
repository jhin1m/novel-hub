import { m } from '@novel-hub/shared/messages';
import { useId, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/me';
import { useTopReaders } from '@/lib/nominations';
import { useNearViewport } from '@/lib/use-near-viewport';
import { TopReaderList } from './top-reader-list';

/**
 * The "Top readers" section of a story page. The server-rendered page only has its empty frame
 * (cached, the same for everyone); the list loads in the browser once the reader scrolls near it.
 * Never shown for an 18+ story: who reads adult stories is not made public.
 */
export function TopReaders({ publicId, isMature }: { publicId: string; isMature: boolean }) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const near = useNearViewport(ref, !isMature);
  const me = useMe();
  const readers = useTopReaders(publicId, me.data?.username ?? null, near && !me.isPending);
  if (isMature) return null;

  return (
    <section
      ref={ref}
      aria-labelledby={`${id}-heading`}
      className="flex flex-col gap-2 rounded-[24px] border border-border bg-card p-5"
    >
      <div>
        <h2 id={`${id}-heading`} className="text-[22px] leading-tight font-bold tracking-tight">
          {m.top_readers_title()}
        </h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{m.top_readers_hint()}</p>
      </div>
      {!near ? null : readers.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {m.top_readers_loading()}
        </p>
      ) : readers.isError ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-muted-foreground">
          {m.top_readers_error()}
          <Button variant="ghost" size="sm" onClick={() => void readers.refetch()}>
            {m.rating_retry()}
          </Button>
        </p>
      ) : readers.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.top_readers_empty()}</p>
      ) : (
        <TopReaderList readers={readers.data} />
      )}
    </section>
  );
}
