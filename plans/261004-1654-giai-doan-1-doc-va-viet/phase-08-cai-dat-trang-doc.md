---
phase: 8
title: "Phase 8: Trang đọc B — tuỳ chỉnh đọc và preferences"
status: pending
priority: P1
effort: "1d"
dependencies: [7]
---

# Phase 8: Trang đọc B — tuỳ chỉnh đọc và preferences

Spec checkbox: `Trang đọc chương theo mục 6 và mục 8.` — **chưa đánh `[x]` ở phase này**; đánh ở cuối phase 9. <!-- Red Team: tách phase trang đọc thành 3 phase -->

## Context Links

- Spec mục 6 ("Cài đặt hiển thị lưu localStorage, áp dụng bằng script inline trong `<head>`"), mục 7 (bật 18+ cần đăng nhập + tự xác nhận đủ 18 tuổi), mục 8 (bảng tuỳ chỉnh khu đọc)
- [plan.md](./plan.md) — "Kiến trúc dữ liệu cho UI" (dữ liệu cá nhân qua Hono + `hc`, `no-store`)
- `plans/reports/researcher-261004-2352-tanstack-start-ssr-ui-report.md` mục 4 (script inline)
- Phase 1: preset `sang`, `nga`, `sepia`, `xanh-diu`, `xam-toi`, `den-oled` (`[data-reader-theme]`), `--font-reader-*`, `Sheet`. Phase 2: `validate()`, `coreError()`, `Result`, `makeTestApiDeps`. Phase 7: `ReaderNav`, `BOOT_SCRIPT`, `MatureGate`, `getPreferences`, `GET /me` có `preferences`.
- Code: `packages/shared/src/schemas/preferences.ts:7-10` (`userPreferencesSchema` chỉ có `showMature`), `packages/api/src/routes/me.ts:7-12`, `packages/db/src/schema/auth.ts:24` (`preferences jsonb`), `apps/web/src/lib/me.ts:12-22`

## Overview

- Bảng tuỳ chỉnh đọc (Sheet mở từ nút cài đặt trên `ReaderNav`), xem trước ngay khi chỉnh.
- `BOOT_SCRIPT` mở rộng: áp cài đặt từ `localStorage['nh:reader']` lên `<html>` trước khi vẽ.
- Đồng bộ `users.preferences.reader` cho người đã đăng nhập qua `PATCH /api/v1/me/preferences`.
- Hoàn tất `MatureGate`: người đã đăng nhập bật 18+ ngay trên màn cảnh báo (checkbox xác nhận + nút bật). Phase 10 dùng chung endpoint cho `/settings`.

## Key Insights

- **Một hàm áp dụng, hai nơi chạy:** `applyReaderSettings(root, settings)` dùng ở runtime React; `BOOT_SCRIPT` là chuỗi tĩnh viết tay (cùng giá trị ở server và client, không mismatch). Chống lệch bằng unit test chạy chuỗi boot trên fake `document` rồi so attribute/CSS var với `applyReaderSettings` trên cùng bảng fixture.
- Script boot tự kiểm allowlist (enum, khoảng số) — không tin localStorage; giá trị sai → bỏ qua đúng field đó, giữ mặc định. Bọc try/catch toàn bộ (Safari private mode ném khi truy cập storage).
- **Render đầu của React không phụ thuộc cài đặt** (đọc localStorage trong effect), nên không hydration mismatch; `<html suppressHydrationWarning>` đã có từ phase 7.
- **Font khác mặc định chỉ tải khi chọn:** `@font-face` khai báo sẵn (phase 1), trình duyệt chỉ tải khi có phần tử dùng family đó → chỉ cần đổi biến `--reader-font`. Không thêm `<link preload>` cho font phụ.
- **Đồng bộ "mới hơn thắng":** mỗi bản cài đặt có `updatedAt` (ms). Khi `useMe` có user: server mới hơn → áp + ghi local; local mới hơn → PATCH (debounce 1s). Hàm thuần `pickNewer` để test.
- **Trang công khai dùng link tài liệu** (phase 7): mỗi chương là document mới, nên script boot chạy ở mọi lượt xem — chính vì vậy boot phải nhẹ và không lỗi. <!-- Red Team: X1 liên kết reloadDocument -->
- `PATCH /me/preferences` merge **dưới khoá dòng** (`SELECT ... FOR UPDATE`) để hai tab (một bật 18+, một đổi cỡ chữ) không ghi đè nhau.
- Bật `showMature` bắt buộc `confirmAdult: true` (spec mục 7) — kiểm ở core, không chỉ ở form.

## Requirements

**Functional**

- Bảng tuỳ chỉnh (Sheet):
  - màu nền: 6 preset của phase 1, mỗi nút có mẫu màu và nhãn;
  - font: Literata, Noto Serif, Be Vietnam Pro, Inter;
  - cỡ chữ 14–28px (bước 1), khoảng cách dòng 1.5–2.2 (bước 0.1), khoảng cách đoạn 0–2em (bước 0.25);
  - độ rộng cột hẹp/vừa/rộng (chỉ hiện và chỉ có tác dụng ≥ 1024px), căn trái/đều;
  - "Khôi phục mặc định"; mọi thay đổi áp ngay lên trang.
- Mặc định: preset theo hệ thống (không đặt thuộc tính → `nga` khi light, `xam-toi` khi dark, theo phase 1), Literata, 19px, 1.8, 1em, vừa, căn trái.
- Lưu `localStorage['nh:reader']` = JSON `ReaderSettings` có `updatedAt`.
- Đã đăng nhập: đồng bộ với `users.preferences.reader` theo "mới hơn thắng".
- `PATCH /api/v1/me/preferences`:
  - body `{ reader?: ReaderSettings; showMature?: boolean; confirmAdult?: boolean }`, cần đăng nhập (không cần xác thực email);
  - `showMature: true` thiếu `confirmAdult: true` → 400 `ADULT_CONFIRMATION_REQUIRED`;
  - trả 200 `{ preferences }` đã parse; `no-store`.
- `MatureGate` (đã đăng nhập, chưa bật): checkbox "Tôi xác nhận đã đủ 18 tuổi" + nút "Hiện nội dung 18+" (khoá tới khi tích) → PATCH → invalidate `meQueryKey` → gỡ màn, đặt `nh:mature=1`.

**Non-functional**

- Script boot < 1,5 KB, không phụ thuộc module, chạy trước CSS vẽ trang.
- Mọi preset đạt WCAG AA (phase 1 đã kiểm); bảng tuỳ chỉnh dùng được bằng bàn phím, có label.
- Chuỗi qua Paraglide (`reader_settings_*`, `mature_confirm_adult`, `mature_enable`).

## Architecture

```
<head> BOOT_SCRIPT ── đọc nh:reader → data-reader-theme/font/width/align + --reader-font-size/line-height/para-gap
                  └─ đọc nh:mature → data-mature-ok
ReaderNav ─ nút cài đặt ─▶ ReaderSettingsSheet ─ useReaderSettings
   useReaderSettings: state ⇄ localStorage ⇄ applyReaderSettings(document.documentElement)
                      useMe() có user → pickNewer(local, server.reader) → PATCH /api/v1/me/preferences (debounce 1s)
MatureGate ─ checkbox + nút ─▶ PATCH { showMature: true, confirmAdult: true } ─▶ invalidate me
Hono me.ts ─ requireAuth ─ validate('json', preferencesPatchSchema) ─▶ core.updatePreferences(db, userId, patch)
   BEGIN · SELECT preferences FOR UPDATE · merge · userPreferencesSchema.parse · UPDATE · COMMIT
```

```ts
// packages/shared/src/schemas/reader.ts (phase 7 đã có parseChapterSegment)
export const READER_THEMES = ['sang', 'nga', 'sepia', 'xanh-diu', 'xam-toi', 'den-oled'] as const;
export const READER_FONTS = ['literata', 'noto-serif', 'be-vietnam-pro', 'inter'] as const;
export const READER_WIDTHS = ['hep', 'vua', 'rong'] as const;
export const READER_ALIGNS = ['trai', 'deu'] as const;
export const READER_RANGES = { fontSize: [14, 28, 1], lineHeight: [1.5, 2.2, 0.1], paragraphSpacing: [0, 2, 0.25] } as const;
export const readerSettingsSchema: z.ZodObject<{ theme /* optional = theo hệ thống */; font; fontSize; lineHeight;
  paragraphSpacing; width; align; updatedAt: z.ZodNumber }>;
export type ReaderSettings = z.infer<typeof readerSettingsSchema>;
export const DEFAULT_READER_SETTINGS: ReaderSettings;
// packages/shared/src/schemas/preferences.ts
export const userPreferencesSchema; // + reader: readerSettingsSchema.optional()
export const preferencesPatchSchema; // { reader?, showMature?, confirmAdult? } (strict)

// packages/core/src/users/preferences.ts
export function updatePreferences(db: Db, userId: string, patch: PreferencesPatch):
  Promise<Result<UserPreferences, 'ADULT_CONFIRMATION_REQUIRED'>>;

// apps/web/src/lib/reader/settings.ts
export function applyReaderSettings(root: HTMLElement, s: ReaderSettings): void;
export function readLocalSettings(storage: Storage): ReaderSettings | null;
export function pickNewer(a: ReaderSettings | null, b: ReaderSettings | null): 'local' | 'server' | 'none';
```

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `packages/shared/src/schemas/reader.ts` (+ test) | modify | hằng, `readerSettingsSchema`, `DEFAULT_READER_SETTINGS` |
| `packages/shared/src/schemas/preferences.ts` (+ test) | modify | `reader` optional; `preferencesPatchSchema` |
| `packages/core/src/users/preferences.ts` (+ int test) | modify | `updatePreferences` |
| `packages/api/src/routes/me.ts` (+ test) | modify | `PATCH /preferences` (chain) |
| `packages/api/src/lib/core-errors.ts` | modify | `ADULT_CONFIRMATION_REQUIRED` → 400 |
| `apps/web/src/lib/boot-script.ts` (+ test) | modify | thêm phần cài đặt đọc |
| `apps/web/src/lib/reader/settings.ts` (+ test) | create | `applyReaderSettings`, `readLocalSettings`, `pickNewer` |
| `apps/web/src/lib/reader/use-reader-settings.ts` | create | state + localStorage + đồng bộ server |
| `apps/web/src/lib/preferences.ts` | create | `usePatchPreferences` (`useMutation` + `hc`) |
| `apps/web/src/components/reader/reader-settings-sheet.tsx` | create | |
| `apps/web/src/components/reader/reader-nav.tsx` | modify | nút cài đặt |
| `apps/web/src/components/reader/mature-gate.tsx` | modify | checkbox xác nhận + nút bật |
| `apps/web/src/styles/reader.css` | modify | map `data-reader-font/width/align` + CSS var; width chỉ áp ở `min-width: 1024px` |
| `packages/shared/messages/vi.json` | modify | `reader_settings_*`, `mature_confirm_adult`, `mature_enable` |
| `apps/web/e2e/reader-settings.spec.ts` | create | |

## Implementation Steps

1. **Shared:** hằng + `readerSettingsSchema` (enum, `z.number().min().max()` + kiểm bước bằng `refine`, `updatedAt` int ≥ 0); `DEFAULT_READER_SETTINGS`; `reader` optional trong `userPreferencesSchema` (dữ liệu cũ không có `reader` vẫn parse); `preferencesPatchSchema` `.strict()`. Unit test biên (13/29 px, 2.25, theme lạ, thiếu `updatedAt`).
2. **Core `updatePreferences`:** kiểm `showMature === true && confirmAdult !== true` → `err('ADULT_CONFIRMATION_REQUIRED')` trước khi mở transaction; transaction `SELECT preferences ... FOR UPDATE` → merge nông (`reader` thay nguyên khối) → `userPreferencesSchema.parse` → `UPDATE users SET preferences, updated_at = now()`. Int test: merge không xoá `reader` khi chỉ bật 18+; hai PATCH song song đều được giữ.
3. **API:** `.patch('/preferences', sessionMiddleware, requireAuth, validate('json', preferencesPatchSchema), handler)` trong chain của `me.ts`; lỗi qua `coreError()`. Unit test với `makeTestApiDeps`: khách 401, thiếu `confirmAdult` 400, body lạ 400 `VALIDATION_ERROR`, thành công 200.
4. **`settings.ts`:** `applyReaderSettings` đặt `data-reader-theme` (bỏ thuộc tính khi theme undefined), `data-reader-font`, `data-reader-width`, `data-reader-align` và `--reader-font-size`, `--reader-line-height`, `--reader-para-gap`; `readLocalSettings` = `JSON.parse` + `safeParse`; `pickNewer`.
5. **`BOOT_SCRIPT`:** viết tay, chỉ dùng cú pháp ES2017, đọc `nh:reader`, kiểm từng field theo hằng chèn literal (giá trị lặp lại của `READER_*` — test bước 9 bắt lệch), gọi cùng logic đặt attribute như `applyReaderSettings`; giữ phần `nh:mature` của phase 7.
6. **`useReaderSettings`:** khởi tạo `DEFAULT` → effect đọc local; mỗi thay đổi: `updatedAt = Date.now()`, ghi local, áp ngay; khi `useMe` trả user: `pickNewer` → server mới hơn thì áp + ghi local, local mới hơn thì PATCH debounce 1s; lỗi PATCH chỉ log (local vẫn đúng).
7. **UI:** `ReaderSettingsSheet` (radio group preset có mẫu màu, select font, slider/stepper số, segmented width chỉ hiện ≥ 1024px, segmented align, nút khôi phục); nút cài đặt trong `ReaderNav`; phím ←/→ đã bỏ qua khi sheet mở (phase 7).
8. **`MatureGate`:** user chưa bật → checkbox + nút; thành công → `queryClient.invalidateQueries(meQueryKey)`, đặt `nh:mature=1`; lỗi → thông báo inline.
9. **Test đối chiếu boot:** chạy `BOOT_SCRIPT` bằng `new Function('localStorage','document', BOOT_SCRIPT)` với fake; so attribute/CSS var với `applyReaderSettings` trên bảng fixture (mặc định, mỗi field biên, JSON hỏng, field lạ).
10. **i18n:** key cho mọi nhãn bảng tuỳ chỉnh và preset; `pnpm i18n:compile`.
11. **E2E `reader-settings.spec.ts`** theo ma trận; kiểm "không nháy" bằng cách chặn mọi request `resourceType === 'script'` (script inline vẫn chạy) rồi assert `<html data-reader-theme="sepia">` và `--reader-font-size: 24px`.
12. **Thủ công:** DevTools Network — chọn Inter thì mới tải file font Inter; preset đen OLED trên mobile 375px.
13. **Gate:** `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. **Không** đánh `[x]` checkbox 6 (đánh ở phase 9).

## Function / Interface Checklist

- [ ] `READER_THEMES`, `READER_FONTS`, `READER_WIDTHS`, `READER_ALIGNS`, `READER_RANGES`
- [ ] `readerSettingsSchema`, `DEFAULT_READER_SETTINGS`, `preferencesPatchSchema`, `userPreferencesSchema.reader`
- [ ] `updatePreferences`
- [ ] `PATCH /api/v1/me/preferences`
- [ ] `applyReaderSettings`, `readLocalSettings`, `pickNewer`, `BOOT_SCRIPT` (phần đọc)
- [ ] `useReaderSettings`, `usePatchPreferences`, `ReaderSettingsSheet`, `MatureGate` (nút bật)

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | `BOOT_SCRIPT` và `applyReaderSettings` cho cùng kết quả trên mọi fixture; localStorage hỏng/ném lỗi → không throw, giữ mặc định | unit |
| Critical | Đặt sepia + 24px → tải lại với script module bị chặn → `<html data-reader-theme="sepia">` + `--reader-font-size: 24px` | e2e |
| Critical | `showMature: true` thiếu `confirmAdult` → 400 `ADULT_CONFIRMATION_REQUIRED`; khách → 401 | unit api + int |
| High | Merge: bật 18+ không xoá `reader`; hai PATCH song song giữ cả hai | int |
| High | User chưa bật mở chương 18+ → tích xác nhận → bật → thấy nội dung; tải lại không nháy màn cảnh báo | e2e |
| High | Đăng nhập trên trình duyệt B → nhận cài đặt đã lưu từ A (server mới hơn) | e2e (2 context) |
| High | Schema: 13px, 29px, line-height 2.25, theme lạ → lỗi; `preferences` cũ không có `reader` vẫn parse | unit |
| Medium | `pickNewer`: null/null, local mới, server mới, bằng nhau | unit |
| Medium | "Khôi phục mặc định" → bỏ `data-reader-theme`, cỡ 19px | e2e |
| Medium | Width chỉ áp ≥ 1024px (viewport 375 không đổi độ rộng cột) | e2e |
| Medium | Chọn Inter mới tải font Inter | thủ công |

## Dependency Map

- **Cần:** phase 1 (preset, font, `Sheet`, tương phản AA), phase 2 (`validate`, `coreError`, `Result`, `makeTestApiDeps`), phase 7 (`ReaderNav`, `BOOT_SCRIPT`, `MatureGate`, `getPreferences`, `GET /me` có `preferences`).
- **Phase sau dùng:**
  - phase 9: không phụ thuộc trực tiếp (tiến độ/lượt đọc gắn vào route chương);
  - phase 10: `PATCH /me/preferences` cho `/settings`, `useMe().preferences.showMature` cho danh sách 18+;
  - phase 11: `includeMature` theo `preferences` server đọc.

## Success Criteria

- [ ] Bảng tuỳ chỉnh đủ mục spec mục 8, xem trước ngay
- [ ] Tải lại không nháy (e2e chặn script module vẫn thấy cài đặt)
- [ ] Đồng bộ giữa thiết bị khi đăng nhập, "mới hơn thắng"
- [ ] Bật 18+ cần đăng nhập + xác nhận, kiểm ở core
- [ ] Gate 5 lệnh xanh; checkbox 6 **chưa** đánh

## Risk Assessment

| Rủi ro | Khả năng × Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Chuỗi boot lệch logic với `applyReaderSettings` | Trung bình × Trung bình | Test đối chiếu bảng fixture (bước 9) |
| Hydration mismatch | Thấp × Trung bình | Render đầu dùng mặc định; đọc local trong effect |
| PATCH dồn dập khi kéo slider | Trung bình × Thấp | Debounce 1s; chỉ khi đã đăng nhập |
| Đồng hồ máy lệch làm "mới hơn thắng" sai | Thấp × Thấp | Hậu quả chỉ là cài đặt hiển thị; người dùng chỉnh lại |
| Hai tab ghi đè preferences | Thấp × Thấp | `FOR UPDATE` + merge ở core |

Rollback: không migration. `preferences.reader` optional nên bản trước đọc dữ liệu mới vẫn được (Zod `object` bỏ key lạ). Gỡ sheet + endpoint là về trạng thái phase 7.

## Security Considerations

- Script boot không `eval` giá trị từ localStorage; chỉ so khớp allowlist rồi gán attribute/CSS var số → không chèn CSS/HTML tuỳ ý.
- `PATCH` đi qua CSRF `/api/v1`, cần phiên, `no-store`; body `.strict()`; không trả `id`.
- `showMature` chỉ bật khi đăng nhập + xác nhận; server không tin cờ client cho danh sách (phase 10, 11 đọc preferences từ DB).

## Câu hỏi mở (đã chốt — Validation Session 1, 2026-10-05)

1. Mặc định: 19px, line-height 1.8, khoảng đoạn 1em, cột vừa, preset theo hệ thống.
2. Độ rộng hẹp/vừa/rộng = 60/68/75 `ch`.

## Next Steps

Phase 9: tiến độ đọc (`/api/v1/reading/progress` + `sendBeacon`), purge CDN, đếm lượt đọc; đánh `[x]` checkbox 6 ở cuối phase đó.
