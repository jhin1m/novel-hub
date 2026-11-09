---
phase: 9
title: "Thanh Đọc tiếp cho khách"
status: done
priority: P1
effort: "5h"
dependencies: [3, 7, 8]
---

# Phase 9: Thanh Đọc tiếp cho khách

**Status:** done

<!-- Updated: Red Team - quy tắc đồng bộ theo số chương, hint riêng cho khách, bỏ route API và Web Locks -->

## Bối cảnh chung

- Repo `/Users/jhin1m/Desktop/ducanh-project/novel-hub`, nhánh `redesign/261109`. Không đổi nhánh, không push, không deploy, không đụng `dcn-prod`. Worker không commit; phiên điều phối chạy gate, đổi Status, đánh checkbox spec, commit.
- Trong code mọi thứ tiếng Anh; chuỗi hiển thị qua `packages/shared/messages/vi.json`, rồi `pnpm i18n:compile`. Không ghi số phase, tên plan trong code hay tên test.
- Logic trong `packages/core`, input ngoài validate bằng Zod, quyền đọc đi qua `canReadChapter`. **Không đổi schema: cần đổi thì dừng, hỏi user.**
- Brief mục 8: tính năng mới user đã duyệt dù spec đang ghi tạm dừng. Board: `design-boards/Main.dc.html` dòng 70-81, `design-boards/Mobile.dc.html` dòng 46-56.
- Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Đỏ sau 2 lần sửa thì dừng, hỏi user.

## Overview

Khách đọc chương được lưu vị trí vào localStorage. Trang chủ hiện thanh Đọc tiếp tải ở client. Khi đăng nhập, tiến độ đồng bộ vào `reading_progress` có sẵn mà không làm lùi tiến độ của tài khoản.

## Requirements

- Dữ liệu chỉ ở client: `localStorage['nh:guest-progress']` = `{"v":1,"items":[{publicId,number,scrollPct,updatedAt}]}`, tối đa 5 truyện, mới nhất trước.
- Chỉ ghi khi `me.isSuccess && me.data === null` (khách thật; `/me` lỗi 5xx không phải khách), chương đọc được, truyện không 18+, màn 18+ không hiện, đã khôi phục xong vị trí.
- Thanh dùng đúng khung của thành viên. Khách thêm ghi chú từ `lg`: "Lưu trên máy này. **Đăng nhập** để giữ khi đổi máy."
- Tên, bìa lấy từ server tại thời điểm hiện, không lưu ở local, để truyện bị ẩn hoặc đổi thành 18+ không còn hiện.
- HTML trang chủ không đổi: không có chữ của thanh, không cookie. Placeholder không chứa chữ.
- **Đồng bộ không bao giờ làm lùi tiến độ tài khoản**: chỉ ghi khi tài khoản chưa có hàng cho truyện đó, hoặc số chương local lớn hơn số chương server. Không so đồng hồ.

## Key Insights

- `PUT /api/v1/reading/progress` ghi đè vô điều kiện và mỗi (user, story) chỉ có một hàng (`packages/core/src/reading/progress.ts:26-28`), nên ghi nhầm là mất vĩnh viễn. So `updatedAt` không an toàn: đồng hồ máy lệch, và mở chương rồi rời trang cũng sinh bản ghi "mới". So số chương không cần đồng hồ.
- `GET /reading/progress/:publicId` trả `{ progress: ContinueDto | null }`; `null` là ca thường gặp, nghĩa là tài khoản chưa đọc truyện này.
- `findReadableChapterRef` (`packages/core/src/reader/readable-chapter-ref.ts`) đã đi qua `canReadChapter` và trả `isMature`. Chương không đọc được thì trả `null`, thanh xóa bản ghi rồi thử bản kế tiếp.
- Dữ liệu này chỉ UI web dùng nên đi qua `createServerFn`, theo spec mục 3. `/_serverFn/*` không vào cache rule của Cloudflare (`docs/deployment-cloudflare.md:18,45`). Không mở rộng `/api/v1`.
- `/me` trả 401 chạy `forgetAccount()`, gỡ `data-continue-rows` (`apps/web/src/lib/me.ts:25`, `account-hint.ts`), đúng lúc khách cần giữ chỗ. Vì vậy khách dùng attribute riêng `data-guest-continue`.
- Trong `BOOT_SCRIPT`, khối reader settings `return` sớm khi chưa có cài đặt đọc. Khối khách phải đứng trước nó, trong `try` riêng.
- Mount ở root phải đi sau cổng `accountLoaded` của `SiteThemeSync` (`apps/web/src/components/site-theme-sync.tsx`), nếu không `useMe()` chạy sớm và gây hydration mismatch ở header.
- `useReadingProgress` đã có debounce 3 giây, chống lưu trùng, `pagehide` và `visibilitychange`. Tách phần theo dõi ra để dùng chung, chỉ khác nơi ghi.
- `useResumeScroll` không phụ thuộc đăng nhập, `ResumeLink` dùng được cho khách.
- Safari xóa localStorage sau 7 ngày không tương tác; chấp nhận, ghi docs.

## Related Code Files

| File | Việc | Test |
|------|------|------|
| `packages/shared/src/schemas/reader.ts` | Export `MAX_CHAPTER_NUMBER`, `guestProgressItem` (Zod, dùng lại `chapterRefShape`, thêm `scrollPct`, `updatedAt`), `guestContinueInput` | `reader.test.ts` |
| `packages/shared/src/index.ts` | Export | |
| `packages/core/src/reading/guest-continue.ts` | Tạo `getGuestContinueCard` | `guest-continue.int.test.ts` mới |
| `packages/core/src/index.ts` | Export | |
| `apps/web/src/server-fns/reading.ts` | Tạo `getGuestContinue`, method GET, validate Zod | |
| `apps/web/src/lib/reader/guest-progress.ts` | Tạo: store (đọc, upsert, xóa, subscribe, snapshot) | `.test.ts` mới |
| `apps/web/src/lib/reader/use-reading-progress.ts` | Tách `useScrollCheckpoint(content, enabled, save)`, giữ chữ ký `useReadingProgress` | |
| `apps/web/src/lib/reader/use-guest-reading-progress.ts` | Tạo, dùng `useScrollCheckpoint` | |
| `apps/web/src/lib/use-guest-progress-sync.ts` | Tạo | `.test.ts` mới |
| `apps/web/src/components/site-theme-sync.tsx` | Con sau cổng gọi thêm `useGuestProgressSync()`; đổi tên con thành `AccountReconcile`, sửa comment | |
| `apps/web/src/routes/stories.$storyKey.chapter-{$number}.tsx` | Gọi hook khách | |
| `apps/web/src/components/home/home-continue-reading.tsx` | Nhánh khách | |
| `apps/web/src/lib/boot-script.ts` | `data-guest-continue` | `boot-script.test.ts` |
| `apps/web/src/styles/app.css` | `.continue-hint` hiện khi có một trong hai attribute | |
| `packages/shared/messages/vi.json` | 3 chuỗi ghi chú | |
| `apps/web/e2e/guest-continue-reading.spec.ts` | Tạo | |
| `docs/project-spec.md` mục 8, `docs/design-guidelines.md` | Một đoạn về thanh khách và giới hạn Safari | |
| `plans/reports/visual-compare-261109-redesign-design-chot-report.md` | Thêm mục ảnh thanh | |

## Architecture

```ts
// packages/core/src/reading/guest-continue.ts
// The card for a guest's saved position; null when the chapter cannot be read or the story is 18+.
export async function getGuestContinueCard(
  db: Db, publicId: string, number: number,
): Promise<StoryCardDto | null>;
```

`findReadableChapterRef` trước; `null` hoặc `isMature` thì trả `null`. Sau đó một truy vấn `selectStoryCards` theo `public_id` với `publicStoryWhere({ includeMature: false })`.

Store theo mẫu `use-site-theme.ts`: snapshot cache theo chuỗi raw, notify listener sau mọi lần ghi hoặc xóa, listener `storage` cho tab khác, server snapshot `null`, `try/catch` mọi thao tác storage. Mỗi phần tử parse bằng `guestProgressItem` và `isValidPublicId`; sai thì bỏ ngay khi đọc. Khi store rỗng, gỡ `data-guest-continue`.

Luồng đồng bộ, chạy khi đã có tài khoản và local có bản ghi, duyệt từ cũ đến mới:

```text
card = getGuestContinue(publicId, number)
  lỗi mạng hoặc 5xx → giữ tất cả, dừng, thử lại lần tải sau
  null → xóa bản local (chương không còn, hoặc truyện đã 18+), đi tiếp

res = GET /reading/progress/:publicId
  không ok → giữ tất cả, dừng
  progress !== null && number <= progress.chapterNumber → xóa bản local, đi tiếp

PUT /reading/progress { publicId, number, scrollPct }
  204 → xóa bản local nếu updatedAt còn nguyên
  401, 429, 5xx, lỗi mạng → giữ tất cả, dừng
  4xx khác → xóa bản local, đi tiếp

xong → invalidate historyQueryKey
```

Tối đa 5 truyện nên tối đa 15 request, một lần. Thao tác idempotent nên nhiều tab chạy cùng lúc vẫn an toàn, không cần Web Locks.

Trạng thái thanh của khách:

| Điều kiện | Hiển thị |
|-----------|----------|
| `me` đang tải, hoặc query đang tải | Placeholder (ẩn nếu không có hint) |
| Có card | Thanh |
| Card `null` | Xóa bản ghi, thử bản kế tiếp, tối đa 2 lần mỗi lượt tải |
| Lỗi tải | Ẩn thanh, giữ bản ghi |
| `/me` lỗi | Ẩn thanh, không xem là khách |

## Implementation Steps

1. Int test `getGuestContinueCard`: 18+ trả null; truyện ẩn, tác giả bị ban trả null; chương xóa mềm, chương nháp trả null; `publicId` sai format trả null.
2. Schema Zod với cận trên `MAX_CHAPTER_NUMBER`, core, server function.
3. `guest-progress.ts` theo store ở trên, upsert theo `publicId`, cắt 5.
4. Tách `useScrollCheckpoint` từ `useReadingProgress`, test hành vi cũ vẫn xanh (`e2e/reader-progress.spec.ts`). Tạo `useGuestReadingProgress`; enabled khi `me.isSuccess && me.data === null && !gated && !resuming && !story.isMature`. Ghi đồng bộ, không gọi mạng.
5. `HomeContinueReading`: nhánh khách theo bảng trạng thái, đọc store qua `useSyncExternalStore`, `useQuery` gọi server function.
6. `BOOT_SCRIPT`: trong `try` riêng, trước khối reader settings; không có `nh:account` mà `nh:guest-progress` có `items` không rỗng thì `data-guest-continue` = "". Không đọc nội dung ra DOM.
7. `useGuestProgressSync` theo luồng trên, gọi trong con sau cổng của `SiteThemeSync`.
8. e2e, ảnh thanh khách 1440 và 390, sáng và tối vào báo cáo so ảnh. Thêm đoạn docs.

## Test Matrix

| Mức | Kịch bản | Nơi |
|-----|----------|-----|
| Critical | HTML `/` không chứa "Bạn đang đọc dở", không `set-cookie`, kể cả khách có bản ghi | e2e |
| Critical | Khách mở chương 18+: không ghi local | e2e |
| Critical | Truyện đổi thành 18+ hoặc bị ẩn: thanh không hiện, đồng bộ không ghi, bản ghi bị xóa | e2e, test sync |
| Critical | Tài khoản ở chương 50, local chương 5: không ghi, kể cả đồng hồ máy lệch | test sync, e2e |
| High | Tài khoản chưa có hàng cho truyện (`progress: null`): ghi | test sync |
| High | Local chương lớn hơn server: ghi | test sync |
| High | `GET progress` 500: giữ local, không `PUT` | test sync |
| High | Khách đọc, về trang chủ, bấm Đọc tiếp, về đúng vị trí | e2e |
| High | Đăng ký hoặc đăng nhập: tiến độ vào tài khoản, local trống, thanh theo tài khoản | e2e |
| High | Sau 401 mà server function chưa trả: placeholder vẫn hiện, không xô layout | e2e |
| High | `/me` 500: không ghi local, không hiện thanh khách | e2e |
| High | Xóa bản đầu rồi hiện bản kế tiếp không cần tải lại | test store |
| High | Storage bị chặn, JSON hỏng, phần tử sai shape: bỏ qua, không lỗi | `.test.ts` |
| Medium | Hơn 5 truyện: cắt bản cũ nhất | `.test.ts` |
| Medium | Boot script: khách có bản ghi, không có cài đặt đọc, vẫn set attribute | `boot-script.test.ts` |
| Medium | `number` 2147483648 bị schema từ chối | `reader.test.ts` |

## Interface Checklist

- [ ] `getGuestContinueCard`, server function `getGuestContinue`
- [ ] `guestProgressItem`, `guestContinueInput`, `MAX_CHAPTER_NUMBER`
- [ ] `readGuestProgress`, `upsertGuestProgress`, `removeGuestProgress`, `subscribeGuestProgress`
- [ ] `useScrollCheckpoint`, `useGuestReadingProgress`, `useGuestProgressSync`
- [ ] `BOOT_SCRIPT` với `data-guest-continue`

## Dependency Map

Cần thanh và placeholder của phase 3, báo cáo của phase 8, docs của phase 7. Là phase cuối.

## Success Criteria

- [ ] Khách có thanh đúng board ở 1440 và 390
- [ ] Đăng nhập xong tiến độ vào tài khoản, không làm lùi tiến độ sẵn có
- [ ] Không có migration mới, không thêm route `/api/v1`, HTML không đổi theo người xem
- [ ] Báo cáo so ảnh có thêm mục thanh khách
- [ ] Gate xanh ở commit cuối

## Security Considerations

- Local chỉ giữ `publicId`, số chương, vị trí; không có dữ liệu cá nhân, không render chuỗi từ local. `publicId` đi qua `isValidPublicId` trước khi vào URL.
- Server function chỉ trả thẻ truyện công khai, không 18+, không id nội bộ.
- Đồng bộ dùng route có `requireAuth`, ghi đúng tài khoản đang đăng nhập.
- Server function công khai không rate limit, cùng mức với `/top-readers`. Mỗi lượt tải tối đa 2 lần gọi, truy vấn theo khóa unique `public_id`. Chấp nhận.

## Risk Assessment

- Máy dùng chung: lịch sử của khách vào tài khoản đăng nhập kế tiếp. Quy tắc số chương bảo đảm không làm lùi tiến độ; phần lịch sử thêm chỉ là vị trí đọc truyện công khai.
- Một truyện đọc từ lâu, tài khoản chưa có hàng, được đồng bộ sẽ nhận `updated_at = now()` và lên đầu lịch sử một lần. Chấp nhận để không đổi route ghi.
- Hint sai khi bản ghi không còn hợp lệ: thanh giữ chỗ rồi biến mất một lần, bản ghi bị xóa nên lần sau hết.
