import { hashKey, useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import { meQueryKey } from '@/lib/me';
import { useSiteThemeSync } from '@/lib/site-theme/use-site-theme';
import { useGuestProgressSync } from '@/lib/use-guest-progress-sync';

const meQueryHash = hashKey(meQueryKey);

/**
 * Reconciles what this browser keeps (site theme, a guest's reading positions) with the account,
 * once per app; renders nothing.
 *
 * Mounted at the root, outside the router's Suspense boundaries, so it hydrates before the page.
 * Calling `useMe()` straight away would start the account request then, and the header could
 * receive the account before it hydrates: a mismatch with its server-rendered placeholder. So the
 * sync only mounts once some other part of the page has loaded the account.
 */
export function SiteThemeSync() {
  const queryClient = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) =>
      queryClient.getQueryCache().subscribe((event) => {
        // Only these events can change the cached account. Observer events also fire while a
        // component renders `useQuery` (the reconcile below calls `useMe()`); reacting to them
        // would update this component in the middle of rendering its child.
        if (event.query.queryHash !== meQueryHash) return;
        if (event.type === 'added' || event.type === 'updated' || event.type === 'removed') {
          onChange();
        }
      }),
    [queryClient],
  );
  // Data, not `status === 'success'`: a failed background refetch keeps the account but flips the
  // status to error, and unmounting the sync then would drop the cross-tab listener.
  const accountLoaded = useSyncExternalStore(
    subscribe,
    () => queryClient.getQueryState(meQueryKey)?.data !== undefined,
    () => false,
  );
  return accountLoaded ? <AccountReconcile /> : null;
}

function AccountReconcile() {
  useSiteThemeSync();
  useGuestProgressSync();
  return null;
}
