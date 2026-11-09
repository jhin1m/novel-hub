import { m } from '@novel-hub/shared/messages';
import { PageShell, PageTitle } from './page-shell';
import { SiteLayout } from './site-layout';

export interface StaticSection {
  heading?: string;
  paragraphs: string[];
}

/**
 * A text page (terms, content policy): one column of prose, marked as a draft until approved.
 * All in the UI face: serif is kept for story text.
 */
export function StaticPage({ title, sections }: { title: string; sections: StaticSection[] }) {
  return (
    <SiteLayout>
      <PageShell className="max-w-[960px]">
        <article className="flex flex-col gap-8">
          <header className="flex flex-col gap-3">
            <PageTitle>{title}</PageTitle>
            <p
              role="note"
              className="rounded-md border border-border bg-card px-3.5 py-3 text-sm text-muted-foreground"
            >
              {m.static_draft_notice()}
            </p>
          </header>
          {sections.map((section, index) => (
            <section key={section.heading ?? index} className="flex flex-col gap-3">
              {section.heading ? (
                <h2 className="text-xl leading-tight font-extrabold tracking-tight">
                  {section.heading}
                </h2>
              ) : null}
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-[17px] leading-[1.75]">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </article>
      </PageShell>
    </SiteLayout>
  );
}
