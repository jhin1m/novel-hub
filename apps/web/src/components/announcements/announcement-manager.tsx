import { ANNOUNCEMENT_RULES, normalizePlainText, plainTextLength } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/api-errors';
import {
  type AnnouncementDto,
  useDeleteAnnouncement,
  usePostAnnouncement,
  useStoryAnnouncements,
} from '@/lib/announcements';
import { formatDateTime } from '@/lib/format';
import { useMe } from '@/lib/me';
import { pageCardClass } from '../page-shell';
import { ConfirmDialog } from '../moderation/confirm-dialog';

/**
 * Where the author writes announcements to the story's followers and deletes earlier ones, on the
 * story's management page. Only a public story with a published chapter has followers to tell:
 * before that (`canPost` false) the section is left out, or shows just the earlier ones (a story
 * hidden later) so they can still be deleted. A muted account sees the list with a notice instead
 * of the form (the server refuses it as well); an unverified email never reaches this page
 * (`WriterGate`).
 */
export function AnnouncementManager({ publicId, canPost }: { publicId: string; canPost: boolean }) {
  const me = useMe();
  const list = useStoryAnnouncements(publicId);
  if (!canPost && (list.isPending || list.isError || list.data.length === 0)) return null;
  return (
    <section id="announcements" aria-labelledby="announcement-manage" className={pageCardClass}>
      <h2 id="announcement-manage" className="mb-4 text-lg font-semibold">
        {m.announcement_manage_title()}
      </h2>
      <div className="flex max-w-[720px] flex-col gap-6">
        {!canPost ? null : me.data?.status === 'muted' ? (
          <p className="text-sm text-muted-foreground">{m.error_user_muted()}</p>
        ) : (
          <AnnouncementForm publicId={publicId} />
        )}
        {list.isPending ? null : list.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {apiErrorMessage(list.error)}
          </p>
        ) : list.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{m.announcement_list_empty()}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {list.data.map((item) => (
              <li key={item.id}>
                <ManagedAnnouncement publicId={publicId} announcement={item} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function AnnouncementForm({ publicId }: { publicId: string }) {
  const id = useId();
  const [body, setBody] = useState('');
  const post = usePostAnnouncement(publicId);
  const max = ANNOUNCEMENT_RULES.bodyMax;
  const length = plainTextLength(body.trim());
  const sendable = normalizePlainText(body, max) !== null;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!sendable || post.isPending) return;
        post.mutate(body, { onSuccess: () => setBody('') });
      }}
    >
      <label htmlFor={`${id}-body`} className="text-sm font-semibold">
        {m.announcement_compose_label()}
      </label>
      <Textarea
        id={`${id}-body`}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (post.isSuccess) post.reset();
        }}
        placeholder={m.announcement_compose_placeholder()}
        aria-describedby={`${id}-hint ${id}-count`}
        aria-invalid={length > max || undefined}
        className="max-h-72 min-h-24"
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {m.announcement_compose_hint({ max, perDay: ANNOUNCEMENT_RULES.perStoryPerDay })}
      </p>
      <div className="flex items-center justify-end gap-2">
        <p
          id={`${id}-count`}
          className={
            length > max
              ? 'mr-auto text-xs text-destructive'
              : 'mr-auto text-xs text-muted-foreground'
          }
        >
          {m.comment_char_count({ count: length, max })}
        </p>
        <Button type="submit" size="sm" disabled={!sendable || post.isPending}>
          {m.announcement_submit()}
        </Button>
      </div>
      {post.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {apiErrorMessage(post.error)}
        </p>
      ) : null}
      {post.isSuccess ? (
        <p role="status" className="text-sm text-muted-foreground">
          {m.announcement_posted()}
        </p>
      ) : null}
    </form>
  );
}

function ManagedAnnouncement({
  publicId,
  announcement,
}: {
  publicId: string;
  announcement: AnnouncementDto;
}) {
  const remove = useDeleteAnnouncement(publicId);
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <p className="text-xs text-muted-foreground">
        {m.announcement_posted_at({ date: formatDateTime(announcement.createdAt) })}
      </p>
      <p className="leading-relaxed whitespace-pre-line">{announcement.body}</p>
      <div className="flex items-center justify-end gap-2">
        {remove.isError ? (
          <p role="alert" className="mr-auto text-sm text-destructive">
            {apiErrorMessage(remove.error)}
          </p>
        ) : null}
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="outline" disabled={remove.isPending}>
              {m.announcement_delete()}
            </Button>
          }
          title={m.announcement_delete_title()}
          description={m.announcement_delete_description()}
          onConfirm={() => remove.mutate(announcement.id)}
        />
      </div>
    </article>
  );
}
