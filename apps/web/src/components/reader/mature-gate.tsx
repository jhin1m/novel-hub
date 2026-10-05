import { m } from '@novel-hub/shared/messages';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useMe } from '@/lib/me';
import { usePatchPreferences } from '@/lib/preferences';

/** Whether the visitor allowed 18+ content. Only known in the browser; SSR always says no. */
export function useMatureAllowed(): boolean {
  const me = useMe();
  return me.data?.preferences.showMature === true;
}

/**
 * Warning screen over an 18+ story. The server always renders it, so the cached HTML is the same
 * for everyone; the browser removes it once the account turns out to allow 18+ content. The
 * `data-mature-ok` hint set before paint (`BOOT_SCRIPT`) hides it meanwhile, so those readers see
 * no flash. Display only: the content is in the HTML either way.
 */
export function MatureGate({
  storyTitle,
  warningTags,
}: {
  storyTitle: string;
  warningTags: { slug: string; name: string }[];
}) {
  const me = useMe();
  const allowed = me.data?.preferences.showMature === true;
  const dialog = useRef<HTMLDivElement>(null);
  // Move focus into the screen so keyboard and screen reader users start there. Skipped when the
  // stored hint already hides it.
  useEffect(() => {
    const element = dialog.current;
    if (element && element.offsetParent !== null) element.focus();
  }, []);
  if (allowed) return null;

  return (
    <div
      ref={dialog}
      tabIndex={-1}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="mature-gate-title"
      aria-describedby="mature-gate-description"
      className="mature-gate fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-background p-4 text-foreground outline-none"
    >
      {/* The opaque outer layer hides the page; this card is only the content inside it. */}
      <div className="flex w-full max-w-md flex-col gap-4 rounded-3xl border border-border bg-card p-6 text-card-foreground md:p-8">
        <p className="text-lg font-bold">{storyTitle}</p>
        <h1 id="mature-gate-title" className="text-2xl font-extrabold tracking-tight">
          {m.mature_title()}
        </h1>
        <p id="mature-gate-description" className="text-muted-foreground">
          {m.mature_description()}
        </p>
        {warningTags.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">{m.mature_warning_tags()}</h2>
            <ul className="flex flex-wrap gap-2">
              {warningTags.map((tag) => (
                <li key={tag.slug}>
                  <Badge variant="outline">{tag.name}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {/* The account is unknown until the browser asks; the server renders no action. */}
        {me.isSuccess ? (
          me.data === null ? (
            <Button asChild className="self-start">
              <Link to="/sign-in">{m.mature_sign_in()}</Link>
            </Button>
          ) : (
            <EnableMatureForm />
          )
        ) : null}
        <Button asChild variant="outline" className="self-start">
          <Link to="/" reloadDocument>
            {m.mature_back_home()}
          </Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * Turns 18+ content on for the signed-in account, after the reader states they are 18 or older.
 * The server checks the confirmation too. Success updates the cached account, which removes the
 * screen, and stores the hint so the next page skips it before paint.
 */
function EnableMatureForm() {
  const [confirmed, setConfirmed] = useState(false);
  const enable = usePatchPreferences();
  const checkboxId = useId();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        enable.mutate(
          { showMature: true, confirmAdult: true },
          {
            // The screen (and the focus inside it) is gone after the next paint: move focus to
            // the page heading so keyboard and screen reader users carry on from the content.
            onSuccess: () =>
              requestAnimationFrame(() =>
                document.querySelector<HTMLElement>('main h1[tabindex]')?.focus(),
              ),
          },
        );
      }}
    >
      <div className="flex items-center gap-2">
        <Checkbox
          id={checkboxId}
          checked={confirmed}
          onCheckedChange={(checked) => setConfirmed(checked === true)}
        />
        <Label htmlFor={checkboxId}>{m.mature_confirm_adult()}</Label>
      </div>
      <Button type="submit" disabled={!confirmed || enable.isPending} className="self-start">
        {m.mature_enable()}
      </Button>
      {enable.isError ? (
        <p role="alert" className="text-sm">
          {m.mature_enable_error()}
        </p>
      ) : null}
    </form>
  );
}
