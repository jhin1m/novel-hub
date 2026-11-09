import { SITE_THEME_CHOICES } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import { useId } from 'react';
import {
  BellIcon,
  LibraryBigIcon,
  LogOutIcon,
  PenLineIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from 'lucide-react';
import { SITE_THEME_LABELS } from '@/components/settings/theme-setting';
import { SignInPromptLink } from '@/components/sign-in-prompt-link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { accountInitial } from '@/lib/account-hint';
import { useMe, useSignOut } from '@/lib/me';
import { isSiteThemeChoice } from '@/lib/site-theme/site-theme';
import { useSiteTheme } from '@/lib/site-theme/use-site-theme';

// The placeholder, the guest button and the account button share one 42px slot, so the header
// does not shift once the account is known.
const ACCOUNT_SLOT = 'size-[42px] shrink-0';

/**
 * Account state is only known once `useMe()` runs in the browser; SSR always renders a placeholder
 * that looks like either button: the avatar letter when the browser was last signed in (set before
 * paint from the account hint), the guest icon otherwise.
 * Writing is offered to signed-in accounts only, the moderation queue to moderators and admins.
 */
export function SiteAccountMenu() {
  const me = useMe();
  const signOut = useSignOut();

  if (me.isPending) {
    return (
      <div
        aria-hidden
        data-account-slot
        className={`${ACCOUNT_SLOT} flex items-center justify-center rounded-full bg-secondary text-base font-extrabold text-secondary-foreground`}
      >
        <span className="signed-in-hint account-initial-hint" />
        <UserRoundIcon className="guest-hint size-5" />
      </div>
    );
  }

  const user = me.data;
  const canModerate = user?.role === 'mod' || user?.role === 'admin';
  if (!user) return <GuestAccountMenu />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          data-account-slot
          className={`${ACCOUNT_SLOT} text-base font-extrabold`}
        >
          <span aria-hidden>{accountInitial(user.displayName)}</span>
          <span className="sr-only">
            {m.layout_account_menu()}: {user.displayName}
          </span>
        </Button>
      </DropdownMenuTrigger>
      {/* The header and tab bar links are repeated here so every screen width reaches them. */}
      <DropdownMenuContent align="end">
        {canModerate ? (
          <DropdownMenuItem asChild>
            <Link to="/moderation" search={{ status: 'open', page: 1 }}>
              <ShieldCheckIcon aria-hidden />
              {m.layout_moderation()}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link to="/write">
            <PenLineIcon aria-hidden />
            {m.layout_write()}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/library" search={{ shelf: 'reading', page: 1 }}>
            <LibraryBigIcon aria-hidden />
            {m.layout_library()}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/notifications">
            <BellIcon aria-hidden />
            {m.notification_title()}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <SettingsIcon aria-hidden />
            {m.layout_settings()}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ThemeMenuItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signOut.isPending} onSelect={() => signOut.mutate()}>
          <LogOutIcon aria-hidden />
          {m.layout_sign_out()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A guest's account button: sign in (back to this page afterwards) or sign up. */
function GuestAccountMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          data-account-slot
          aria-label={m.layout_account_menu()}
          className={ACCOUNT_SLOT}
        >
          <UserRoundIcon aria-hidden className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <SignInPromptLink>{m.layout_sign_in()}</SignInPromptLink>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/sign-up">{m.layout_sign_up()}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ThemeMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The site theme picker inside either account menu; a choice applies at once. */
function ThemeMenuItems() {
  const { choice, update } = useSiteTheme();
  const labelId = useId();
  return (
    <>
      <DropdownMenuLabel id={labelId}>{m.settings_theme_title()}</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        aria-labelledby={labelId}
        value={choice}
        // Radix hands back a plain string; only a known choice is applied.
        onValueChange={(value) => {
          if (isSiteThemeChoice(value)) update(value);
        }}
      >
        {SITE_THEME_CHOICES.map((option) => (
          <DropdownMenuRadioItem key={option} value={option}>
            {SITE_THEME_LABELS[option]()}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}
