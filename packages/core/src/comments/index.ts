// Public exports of the comments domain; re-exported by `src/index.ts`.
export { type EditCommentError, editComment } from './edit-comment';
export { type PinCommentError, setCommentPinned } from './pin-comment';
export {
  type StoryDiscussionPage,
  createDiscussionComment,
  listStoryDiscussion,
} from './discussion';
export { type CommentThreadsPage } from './thread-page';
export { canPinComment } from '../policies/comment';
