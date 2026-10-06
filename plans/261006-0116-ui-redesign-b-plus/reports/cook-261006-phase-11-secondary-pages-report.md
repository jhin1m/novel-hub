# Cook report — phase 11 trang phụ (2026-10-06, --auto)

## Kết quả
- `PageShell`/`PageTitle`/`pageCardClass` (`components/page-shell.tsx` + test) áp cho search, tags, authors, library, settings, auth, moderation, write new/edit, static, 404.
- Tab link pill: `components/segmented-link-classes.ts`; `LibraryTabs` restyle tại chỗ, `TabLinks` → `components/moderation/moderation-tab-links.tsx` (giữ `Link to/search`, `aria-current`, `small` wrap).
- Tách: `settings.tsx` 207→117 (+`settings/mature-setting.tsx` 102), `moderation.tsx` 203→160, `report-card.tsx` 335→137 (+`report-actions.ts` 107 có test 11 case, `report-target-context.tsx` 105), `story-form.tsx` 202→197 (bỏ `STATUS_LABELS`).
- `/search`: `StoryRowList` + `SectionHeading`; tag picker chip hoá (giữ Radix Checkbox); `ChapterStatusBadge` ở `chapter-list`; badge moderation theo trạng thái (mở → warning).
- e2e mới: `mobile-navigation.spec.ts` "secondary pages at 360px" (search, sign-in, library, moderation).

## Gate
- Full gate (tester): typecheck, lint, format:check, unit 693, int 301 (1 skip S3), e2e 93 — xanh.
- Sau fix review: typecheck/lint/format/unit xanh; e2e stories/search/library/moderation/catalog/mobile-navigation 44/44 xanh; build web OK, CSS variant chip sinh đúng.
- rg Success Criteria: `font-serif` chỉ còn file nội dung; badge cũ, `STATUS_LABELS`, `SegmentedLinks` rỗng; không đổi `packages/`.

## Review
- Không Critical/High. 2 Medium tag-picker (focus ring vô hình trên chip đã chọn, mờ chồng khi disabled) — đã sửa. Low: radius card → `rounded-xl` đã sửa; pagination giữ nút 44px.
- Decisions `[auto]`: xem `## Cook Log` trong phase-11.

## Docs
- Không sửa `docs/` (phase 12 phụ trách). Docs impact: minor → phase 12 ghi `PageShell`, class tab, khung trang.

## Câu hỏi mở (sáng user duyệt)
- `/moderation` rộng 1240 hay cap ~960?
- Badge kind tag `warning` có nên dùng variant warning?
