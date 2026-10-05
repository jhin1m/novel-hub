import type { ReportTarget } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import { FlagIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { useMe } from '@/lib/me';
import { cn } from '@/lib/utils';
import { ReportDialogContent } from './report-dialog';

/**
 * "Report" on the story, chapter and author pages. The server renders the same button for everyone
 * (those pages are cached publicly); only in the browser does it open the dialog, or send a guest
 * to sign in.
 */
export function ReportButton({ target, className }: { target: ReportTarget; className?: string }) {
  const me = useMe();
  // Bumped on every opening so the form starts blank again after a report was sent.
  const [opened, setOpened] = useState(0);
  const label = (
    <>
      <FlagIcon aria-hidden />
      {m.report_button()}
    </>
  );
  const classes = cn('text-muted-foreground', className);

  if (me.isPending || me.isError) {
    return (
      <Button variant="ghost" size="sm" className={classes} disabled>
        {label}
      </Button>
    );
  }
  if (!me.data) {
    return (
      <Button asChild variant="ghost" size="sm" className={classes}>
        <Link to="/sign-in">{label}</Link>
      </Button>
    );
  }
  return (
    <Dialog onOpenChange={(open) => open && setOpened((n) => n + 1)}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className={classes}>
          {label}
        </Button>
      </DialogTrigger>
      <ReportDialogContent key={opened} target={target} />
    </Dialog>
  );
}
