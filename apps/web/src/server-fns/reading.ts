/** Reading data only this site's own UI needs, fetched from the browser. */
import { getGuestContinueCard } from '@novel-hub/core';
import { guestContinueInput } from '@novel-hub/shared';
import { createServerFn } from '@tanstack/react-start';
import { getInfra } from '../server/infra';

/** The story card for a guest's saved position; `null`: the chapter cannot be read, or it is 18+. */
export const getGuestContinue = createServerFn({ method: 'GET' })
  .validator(guestContinueInput)
  .handler(async ({ data }) => {
    const { db } = await getInfra();
    return getGuestContinueCard(db, data.publicId, data.number);
  });
