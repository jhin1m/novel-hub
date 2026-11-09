import { coverImageUrl } from '@novel-hub/shared';

/**
 * A story cover blurred behind a section, under a flat scrim, in CSS only. Decorative: the section
 * sets the base colour (`--hero-base`), which also holds the text's contrast if the image fails.
 * Needs a `relative isolate overflow-hidden` parent and content positioned above it. Static on
 * purpose: a blur this large must not be animated or promoted with `will-change`.
 */
export function CoverBackdrop({
  coverUrl,
  eager = false,
}: {
  /** Stored 600px cover URL; the 300px variant is plenty once blurred. */
  coverUrl: string;
  /** Above the fold. No `fetchPriority`: the sharp cover is the one to hurry. */
  eager?: boolean;
}) {
  return (
    <>
      <img
        src={coverImageUrl(coverUrl, 300)}
        alt=""
        aria-hidden
        width={300}
        height={450}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className="absolute inset-0 size-full scale-[1.18] object-cover object-[center_68%] blur-[28px] saturate-[.85] md:blur-[36px]"
      />
      <div aria-hidden className="absolute inset-0 bg-(--hero-scrim)" />
    </>
  );
}
