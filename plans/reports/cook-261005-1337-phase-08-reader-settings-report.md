# Cook phase 8: cài đặt trang đọc và preferences

Ngày: 2026-10-05. Status: DONE. Checkbox 6 spec **chưa** đánh (phase 9).

## Đã làm
- `packages/shared`: `READER_THEMES/FONTS/WIDTHS/ALIGNS/RANGES`, `readerSettingsSchema`, `DEFAULT_READER_SETTINGS`, `isInReaderRange`; `userPreferencesSchema.reader` (optional, `.catch`); `preferencesPatchSchema` (strict).
- `packages/core/src/users/preferences.ts`: `updatePreferences` (kiểm `confirmAdult` trước transaction, `SELECT … FOR UPDATE`, merge nông).
- `packages/api`: `PATCH /api/v1/me/preferences` → 200 `{ preferences }`; `ADULT_CONFIRMATION_REQUIRED` → 400.
- `apps/web`:
  - `lib/boot-script.ts`: `BOOT_SCRIPT` áp `nh:reader` trước khi vẽ (1038 byte, allowlist, fallback từng field).
  - `lib/reader/settings.ts`: `applyReaderSettings`, `parseStoredSettings`, `readLocalSettings`, `writeLocalSettings`, `pickNewer`.
  - `lib/reader/use-reader-settings.ts`: store theo tab (`useSyncExternalStore`), đồng bộ "mới hơn thắng", PATCH debounce 1s, nghe `storage`.
  - `lib/preferences.ts`: `usePatchPreferences`.
  - `components/reader/reader-settings-sheet.tsx` (Sheet không modal), nút cài đặt trong `reader-nav.tsx`, form bật 18+ trong `mature-gate.tsx`.
  - `styles/reader.css`: font, width (≥ 1024px: 60/68/75ch), căn đều. Preset đổi tên tiếng Anh trong `tokens.css`/`token-values.ts`.
- `vi.json`: `reader_settings_*`, `mature_confirm_adult`, `mature_enable`, `mature_enable_error`; bỏ `mature_enable_hint`.
- Docs: `docs/design-guidelines.md` (tên preset).

## Test
- Unit: schema biên; `BOOT_SCRIPT` ≡ `applyReaderSettings` trên 16 fixture (gồm JSON hỏng, chèn CSS); `pickNewer`; storage bị chặn.
- Int: `updatePreferences` (xác nhận tuổi, merge, khoá dòng thật bằng client giữ khoá); API PATCH 401/400/200 + `no-store`.
- E2E `reader-settings.spec.ts`: chặn file script vẫn thấy sepia + 24px; reset; width chỉ desktop; đồng bộ 2 context; bật 18+ qua form, reload không thấy màn cảnh báo.
- Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e` xanh (354 / 171 / 34).

## Lệch plan
Xem mục "Kết quả" trong `phase-08-cai-dat-trang-doc.md`. Chính: enum tiếng Anh theo code-standards.

## Câu hỏi mở
- Xoá `nh:reader` khi đăng xuất? (hiện giữ theo thiết bị)
- Bước thủ công (Inter chỉ tải khi chọn; OLED 375px) chưa kiểm bằng mắt.
