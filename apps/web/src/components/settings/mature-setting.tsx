import { m } from '@novel-hub/shared/messages';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { type MeUser } from '@/lib/me';
import { usePatchPreferences } from '@/lib/preferences';
import { cn } from '@/lib/utils';
import { FormMessage } from '../auth-ui';
import { pageCardClass } from '../page-shell';

/** `h2` of a settings section, in the UI face. */
export const SETTINGS_HEADING_CLASS = 'text-xl leading-tight font-extrabold tracking-tight';

/**
 * "Show 18+ content" (off by default). Turning it on asks the reader to state they are 18 or
 * older first (the server checks the statement too); turning it off applies at once. Either way
 * the cached account and the before-paint hint follow (`usePatchPreferences`).
 */
export function MatureSetting({ user }: { user: MeUser }) {
  const patch = usePatchPreferences();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const switchId = useId();
  const confirmId = useId();
  const enabled = user.preferences.showMature;

  const enable = () =>
    patch.mutate(
      { showMature: true, confirmAdult: true },
      { onSuccess: () => setDialogOpen(false) },
    );

  return (
    <section aria-labelledby="mature-title" className={cn(pageCardClass, 'flex flex-col gap-3')}>
      <h2 id="mature-title" className={SETTINGS_HEADING_CLASS}>
        {m.settings_mature_title()}
      </h2>
      <div className="flex items-center gap-2">
        <Checkbox
          id={switchId}
          checked={enabled}
          disabled={patch.isPending}
          onCheckedChange={(checked) => {
            patch.reset();
            if (checked === true) {
              setConfirmed(false);
              setDialogOpen(true);
            } else {
              patch.mutate({ showMature: false });
            }
          }}
        />
        <Label htmlFor={switchId}>{m.settings_mature_label()}</Label>
      </div>
      <p className="text-sm text-muted-foreground">{m.settings_mature_hint()}</p>
      {patch.isError && !dialogOpen ? <FormMessage>{m.settings_mature_error()}</FormMessage> : null}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!patch.isPending) setDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.settings_mature_dialog_title()}</DialogTitle>
            <DialogDescription>{m.settings_mature_dialog_description()}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Checkbox
              id={confirmId}
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
            />
            <Label htmlFor={confirmId}>{m.mature_confirm_adult()}</Label>
          </div>
          {patch.isError ? <FormMessage>{m.settings_mature_error()}</FormMessage> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={patch.isPending}>
                {m.settings_mature_cancel()}
              </Button>
            </DialogClose>
            <Button type="button" disabled={!confirmed || patch.isPending} onClick={enable}>
              {m.mature_enable()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
