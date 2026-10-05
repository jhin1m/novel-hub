import { m } from '@novel-hub/shared/messages';
import { SiteLayout } from './site-layout';

export interface StaticSection {
  heading?: string;
  paragraphs: string[];
}

/** A text page (terms, content policy): one column of prose, marked as a draft until approved. */
export function StaticPage({ title, sections }: { title: string; sections: StaticSection[] }) {
  return (
    <SiteLayout>
      <article className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12">
        <header className="flex flex-col gap-3">
          <h1 className="font-serif text-3xl font-semibold">{title}</h1>
          <p role="note" className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
            {m.static_draft_notice()}
          </p>
        </header>
        {sections.map((section, index) => (
          <section key={section.heading ?? index} className="flex flex-col gap-3">
            {section.heading ? (
              <h2 className="font-serif text-xl font-semibold">{section.heading}</h2>
            ) : null}
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="leading-relaxed">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </article>
    </SiteLayout>
  );
}
