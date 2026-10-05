# Research: editor và pipeline nội dung (Giai đoạn 1, 2026-10-04)

Ghi lại từ kết quả researcher (harness của researcher không cho ghi file). Chưa spike thật: output static-renderer, cast `bit_count` của Postgres, bind mảng `::int[]` qua Drizzle/pg.

## 0. Versions (npm, 2026-10-04)
| pkg | ver | license |
|---|---|---|
| `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/static-renderer`, `@tiptap/extension-unique-id` | 3.31.4 (ghim chính xác, cùng version) | MIT |
| `sanitize-html` / `@types/sanitize-html` | 2.18.0 / 2.16.2 | MIT |

`@tiptap/*` peer là version chính xác → ghim tất cả bằng nhau. `extension-unique-id` kéo `uuid ^14` (override `generateID` nên không dùng nhưng vẫn cài).

## 1. Editor Tiptap v3 tối thiểu
- StarterKit v3 gồm: blockquote, bulletList, codeBlock, document, hardBreak, heading, horizontalRule, listItem, orderedList, paragraph, text; marks bold, code, italic, link, strike, underline; dropcursor, gapcursor, undoRedo, listKeymap, trailingNode. (v3: Link/Underline nằm trong StarterKit, `history` → `undoRedo`.)
- Cấu hình đề xuất — **một module `editorExtensions` dùng chung cho editor và renderer server**:
```ts
StarterKit.configure({
  heading: { levels: [2, 3] },   // hoặc false
  codeBlock: false, code: false, link: false, underline: false,
  bulletList: false, orderedList: false, listItem: false, listKeymap: false,
  trailingNode: false,
})
// giữ: paragraph, bold, italic, strike, blockquote, hr (ngắt cảnh), hardBreak, undoRedo
```
- Tắt link: bớt bề mặt XSS/phishing. Cần user chốt: heading? strike?
- SSR: `useEditor({ immediatelyRender: false })` + route editor `ssr: false` (hoặc `ClientOnly`). Trang đọc không bao giờ import `@tiptap/*`. `useEditorState` cho trạng thái toolbar.

## 2. JSON → HTML phía server không DOM
| Cách | DOM | Ưu | Nhược |
|---|---|---|---|
| `@tiptap/static-renderer/pm/html-string` | không | dùng lại `renderHTML` của extension (DRY) | peer react/react-dom gây cảnh báo ở core/worker; phải spike output |
| `@tiptap/html` server | happy-dom | chính thức | nặng; tránh |
| Tự viết walker | không | ~60 dòng, allowlist theo cấu trúc | lệch schema nếu đổi; cần test đối chiếu |

Thứ tự: static-renderer → walker tự viết → không dùng `@tiptap/html`.

Pipeline (luôn từ draft trong DB, không bao giờ nhận HTML từ client):
1. `getSchema(editorExtensions)` + `Node.fromJSON(schema, doc).check()` (Zod chỉ cho envelope + giới hạn kích thước).
2. Chuẩn hoá pid (mục 3).
3. Render → `sanitizeHtml` → lưu `doc_json` + `html`.
4. Tính `word_count`, `paragraph_ids`, `content_hash`.

## 3. `data-pid` ổn định
- `@tiptap/extension-unique-id` MIT trên npm; options `attributeName`, `types`, `generateID`, `filterTransaction`; theo dõi id qua split/merge/paste/undo.
- **Hai lớp:** client dùng UniqueID (`attributeName: 'pid'`, `types: ['paragraph','heading']`, `generateID` = 8 ký tự base32); server lúc đăng là nguồn chuẩn: giữ id hợp lệ lần đầu gặp, id thiếu/sai dạng/trùng (copy-paste) thì sinh mới; regex `^[a-z2-9]{8}$`.
- Lưu ý (chưa kiểm): editor có thể gán id lúc load → update giả → autosave thừa. Gán id khi tạo draft, hoặc bỏ qua update chỉ đổi id.
- Seed hiện dùng `attrs.pid = 'p1'…` — không khớp regex mới → seed phải đổi theo.

## 4. sanitize-html
```ts
const pid = ['data-pid'];
export const CHAPTER_SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: ['p','h2','h3','strong','em','s','blockquote','hr','br'],
  allowedAttributes: { p: pid, h2: pid, h3: pid },
  allowedSchemes: [], allowProtocolRelative: false, disallowedTagsMode: 'discard',
};
```
- Test: fixture render từ schema editor đi qua sanitize phải giữ nguyên từng byte (bắt lệch schema/allowlist).
- `authorNote` là plain text → escape khi render, không qua sanitize.

## 5. Đếm chữ tiếng Việt
- Quy ước: "chữ" = token cách nhau bởi khoảng trắng (âm tiết). Không dùng `Intl.Segmenter('vi')` (ICU khác nhau giữa Node/Safari), không dùng `CharacterCount` làm số chuẩn.
```ts
const SEP = /[\s—–…]+/u;
const HAS_WORD = /[\p{L}\p{N}]/u;
export function countWords(text: string): number {
  let n = 0;
  for (const t of text.normalize('NFC').split(SEP)) if (HAS_WORD.test(t)) n++;
  return n;
}
// docToText(doc): nối text node; hardBreak → '\n'; block nối bằng '\n'
```
- Đặt ở `packages/shared`, dùng cả client và server; server tính lại lúc đăng (số dùng cho kiểm 300–20.000). Đóng băng định nghĩa. Seed có `countWords` riêng → thay bằng bản shared.

## 6. Kiểm tra trùng lặp (không thêm dep)
- Chuẩn hoá: NFC, lowercase, `[^\p{L}\p{M}\p{N}\s]+` → space, tách theo khoảng trắng. Shingle k=5 âm tiết, dedupe bằng `Set`.
- MinHash 128 hoán vị (FNV-1a 32-bit + fmix, double hashing), SimHash 64-bit (`BigInt.asIntN(64)` cho bigint có dấu). ~20k shingle × 128 ≈ 2,6M phép tính, vài chục ms.
- LSH 16 band × 8 hàng: J=0.9 → ~100% thành ứng viên; 0.8 → ~95%; 0.5 → ~6%. Lọc cuối `jaccardEst >= 0.7`.
- Giới hạn: copy nửa chương (J ~0.3) không bắt được.
- **Cần cột mới** `lsh_keys integer[] NOT NULL` + GIN (`array_ops` hỗ trợ `&&`). GIN trên `minhash` vô dụng (khớp giá trị bất kỳ vị trí). Mỗi band key = `h32(band.join(','), bandIndex) | 0`. Migration mới → cần user duyệt.
```sql
SELECT f.chapter_id, f.minhash FROM chapter_fingerprints f
JOIN chapters c ON c.id = f.chapter_id AND c.status = 'published' AND c.deleted_at IS NULL
JOIN stories s ON s.id = c.story_id
WHERE f.lsh_keys && $1::int[] AND s.author_id <> $2 AND f.chapter_id <> $3;
```
- SimHash: chỉ đường tắt copy y nguyên (`bit_count((a # b)::bit(64)) <= 3`, PG14+, cần kiểm). Giá trị thấp; vẫn tính vì cột đã có.
- Đăng lại: upsert fingerprint; loại chính chương và chương cùng tác giả.

## 7. Autosave
- `editor.on('update')` → dirty → debounce 2s, `maxWait` ~10s. Một request đang bay; sửa giữa chừng thì gửi thêm một lần sau khi xong.
- Chống ghi đè giữa tab: client gửi `{doc, baseUpdatedAt}`; `UPDATE ... WHERE chapter_id=$ AND updated_at=$base` → 0 dòng = 409 "đang mở ở tab khác". **Bẫy:** `timestamptz` micro giây vs JS ms → app tự đặt `updated_at = new Date()` mỗi lần ghi draft (đúng ms). Phương án khác: cột `rev integer`.
- Rời trang: `visibilitychange`/`pagehide` + `beforeunload` khi dirty. `sendBeacon`/`keepalive` giới hạn ~64 KB → chương dài có thể mất âm thầm → **mirror doc vào localStorage** `draft:{chapterId}`; mở lại thấy bản local mới hơn thì hỏi khôi phục.
- Trạng thái: đã lưu (HH:mm) / chưa lưu / đang lưu / lỗi (retry 2s→4s→8s…30s) / xung đột.
- Đăng: đọc draft từ DB, một transaction; enqueue fingerprint/search/purge sau commit.

## 8. Giữ 20 revision
```ts
const keep = tx.select({ id: chapterRevisions.id }).from(chapterRevisions)
  .where(eq(chapterRevisions.chapterId, cid))
  .orderBy(desc(chapterRevisions.createdAt), desc(chapterRevisions.id)).limit(REVISION_KEEP);
await tx.delete(chapterRevisions).where(and(eq(chapterRevisions.chapterId, cid), notInArray(chapterRevisions.id, keep)));
```
- Index `(chapter_id, created_at DESC)` có sẵn. `SELECT ... FOR UPDATE` trên chapter đầu transaction để tuần tự hoá. Bỏ qua revision nếu `content_hash` trùng bản gần nhất. Revision chỉ ghi lúc đăng.

## Câu hỏi chưa giải quyết
1. Marks/nodes: giữ `strike`? Cho h2/h3 trong chương?
2. Duyệt cột `lsh_keys integer[]` + GIN cho `chapter_fingerprints`?
3. `chapter_drafts.updated_at` do app đặt (ms) hay thêm cột `rev`?
4. Ngưỡng trùng lặp Jaccard ≥ 0.7 toàn chương có đúng ý "vượt ngưỡng"?
5. (Đã rõ: `packages/db` dùng driver `pg`.)
6. `uuid` (dep của UniqueID) có cần duyệt riêng?

## Nguồn
- https://tiptap.dev/docs/editor/api/utilities/static-renderer
- https://tiptap.dev/docs/editor/extensions/functionality/starterkit
- https://tiptap.dev/docs/editor/extensions/functionality/uniqueid
- https://tiptap.dev/docs/editor/getting-started/install/react
- https://www.postgresql.org/docs/current/gin-builtin-opclasses.html
