# Code Review: Phase 1 (monorepo pnpm, TS strict, ESLint, Prettier, Vitest)

Ngày: 2026-10-04 · Plan: `plans/261004-1255-giai-doan-0-nen-mong/phase-01-start.md` · Điểm: **9/10**

## Scope

- Files: root config (package.json, pnpm-workspace.yaml, tsconfig.base.json, eslint.config.js, vitest.config.ts, .prettierrc, .prettierignore, .gitignore, .editorconfig, .nvmrc), `packages/shared/**`, `apps/web/**` (trừ `.output`, `.tanstack`)
- LOC nguồn: khoảng 330 (không tính lockfile, routeTree.gen.ts)
- Focus: toàn bộ (repo mới, chưa có commit)
- Scout: chạy probe trong bản clone ở scratchpad (không đụng repo) cho ESLint, Vitest, build, slugify, public-id

## Gate (chạy thật trên repo)

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | xanh (shared, web) |
| `pnpm lint` | xanh, 0 lỗi/0 cảnh báo, lint 11 file (gồm 3 file `.tsx`) |
| `pnpm format:check` | xanh |
| `pnpm test` | 2 file, 14 test pass |
| `pnpm test:int` | "No test files found", exit 0 |
| `vite build` + `node .output/server/index.mjs` (bản clone, port 3199) | build OK, `/` trả 200, `<html lang="vi">`, CSS 200; `routeTree.gen.ts` sinh lại giống hệt bản đã có |

## Kiểm acceptance criteria

| # | Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | `slugify` | Đạt (có 1 Medium về `Ð`) | Biên 60/61 đúng: chuỗi 61 ký tự mà ký tự thứ 61 là `-` thì giữ đủ 60; cắt tại `lastDash` không bao giờ để `-` cuối vì `-` đã được gộp; `lastDash === 0` không xảy ra vì đã trim; một từ dài hơn 60 thì cắt cứng. Probe: chuỗi lặp "mot-hai-…" ra 59 ký tự, đúng ranh giới |
| 2 | `generatePublicId` / `isValidPublicId` | Đạt | 31 ký tự; ngưỡng `256 - 256 % 31 = 248 = 8 × 31` → không lệch modulo. Chi-square 1,6 triệu ký tự = 32.2 (df 30) → phân phối đều. Regex dựng từ alphabet, không có metachar trong class |
| 3 | Vitest 2 project | Đạt | Probe: glob bắt `apps/web/src/components/*.test.tsx` và `packages/*/src/deep/nested/*.test.ts`; 3 file `.int.test.ts` chạy tuần tự (start/end không chồng nhau); `passWithNoTests` ở root có hiệu lực cho project inline |
| 4 | ESLint | Đạt | Probe file `.tsx` trong `apps/web`: bắt được `no-floating-promises`, `require-await` (cần type info), `no-explicit-any`, `consistent-type-imports`, `react-hooks/rules-of-hooks`. Root `*.config.ts` đi qua `disableTypeChecked` |
| 5 | Version ghim | Đạt | Lockfile: typescript 6.0.3, vitest 5.0.3, zod 4.6.5, eslint 10.12.0, typescript-eslint 8.71.0, vite 8.3.2, nitro `3.0.260903-beta` (exact), react-start 1.168.60 và react-router 1.170.41 (exact). `catalog:` dùng đúng cho 4 package |
| 6 | Không hardcode UI, không token tự bịa, `.env*` | Đạt | `index.tsx` chỉ render `<main />`; `app.css` chỉ `@import 'tailwindcss'`; `.gitignore` có `.env`, `.env.*`, `!.env.example` |
| 7 | TS strict, JIT package | Đạt | `strict`, `noUncheckedIndexedAccess`, …; `exports` → `./src/index.ts`, `sideEffects: false`; không có `any` |

Lệch có chủ ý, chấp nhận: `.prettierignore` bỏ qua `plans/`, `docs/`, `CLAUDE.md`, `.claude`; thêm export `PUBLIC_ID_LENGTH`; `server.port: 3000`. Thêm `.vinxi`, `*.log`, `.DS_Store` vào `.gitignore` là vô hại.

File Inventory: đủ mọi file. Riêng `allowBuilds` trong `pnpm-workspace.yaml` không được thêm (xem L5).

## Critical

Không có.

## High

Không có.

## Medium

**M1. `slugify` không map `Ð` (U+00D0) / `ð` (U+00F0) về `d`** — `packages/shared/src/slug.ts:14`
- `Ð` (Eth) trông y hệt `Đ` (U+0110). Nó hay lọt vào văn bản tiếng Việt khi dán từ bộ chuyển mã cũ hoặc do người dùng gõ nhầm. NFD không tách được nó, nên regex `[^a-z0-9]` biến nó thành `-`.
- Probe: `slugify('Ðà Lạt')` → `a-lat`, `slugify('ðường')` → `uong`. Hậu quả là URL SEO sai chữ. Không phải lỗi bảo mật, và vì slug không phải khóa tra cứu nên không vỡ routing.
- Đề xuất: `.replace(/[đĐðÐ]/g, 'd')`, thêm 1 test.

## Low

**L1. Test cắt 60 ký tự yếu** — `packages/shared/src/slug.test.ts:34-39`
- Test chỉ kiểm `slug` là tiền tố kết thúc ở ranh giới từ. Nếu `slugify` trả `mot` thì test vẫn pass. Nên khẳng định giá trị chính xác: `'mot-hai-ba-bon-nam-sau-bay-tam-chin-muoi-mot-hai-ba-bon-nam'` (59 ký tự). Nên thêm case đúng 60 ký tự có `-` (không cắt) và case 61 ký tự cắt giữa từ.

**L2. `*.int.test.tsx` lọt vào project `unit`** — `vitest.config.ts:13`
- Probe: `packages/shared/src/c.int.test.tsx` bị chạy trong `unit`. Nếu sau này có file như vậy, nó sẽ đụng DB khi chạy `pnpm test`, tức gate không cần Docker sẽ không còn đúng. Đề xuất: exclude `**/*.int.test.{ts,tsx}` (hoặc giữ quy ước `.int.test.ts` và ghi rõ trong docs).

**L3. Glob `disableTypeChecked` chỉ khớp file config ở root** — `eslint.config.js:43`
- `'*.config.ts'` chỉ khớp ở root. Probe: một `packages/<pkg>/drizzle.config.ts` nằm ngoài `include` của tsconfig sẽ báo `Parsing error: … was not found by the project service`. Phase 3 sẽ gặp lỗi này với `packages/db/drizzle.config.ts`. Đề xuất: lúc đó đưa file vào `include` của `packages/db/tsconfig.json` (giữ được type info), hoặc đổi glob thành `**/*.config.ts`.

**L4. ESLint không đọc `.gitignore`, nên thiếu ignore cho output của Playwright và coverage** — `eslint.config.js:10-19`
- `test-results/`, `playwright-report/` (có file `.js` trong trace viewer), `coverage/` sẽ bị `eslint .` quét khi phase 5 thêm Playwright. Đề xuất: thêm vào `ignores`, hoặc dùng `includeIgnoreFile` từ `@eslint/compat` (dependency mới, cần hỏi user), hoặc liệt kê tay.

**L5. Bỏ `allowBuilds` so với File Inventory** — `pnpm-workspace.yaml`
- Đã kiểm: `node_modules/.modules.yaml` có `"allowBuilds": {}`. Lockfile không có `esbuild` (Vite 8 dùng rolldown, binary qua optional deps), chỉ có `fsevents` (prebuilt). Hiện tại không có gì bị chặn, nên lệch này hợp lý. Ghi chú để tới Giai đoạn 1 (`sharp`) kiểm lại output `pnpm install`.

**L6. File config ở root không được typecheck** — `package.json:11`
- `pnpm -r` không chạy package root, nên `vitest.config.ts` không qua `tsc`. Lỗi kiểu ở đó chỉ lộ ra lúc chạy. Chấp nhận được ở quy mô hiện tại. Nếu muốn chặt hơn: thêm `tsconfig.json` ở root include `*.config.ts` và script `typecheck:root`.

**L7. NFD thay vì NFKD** — `packages/shared/src/slug.ts:12`
- Chữ full-width, ligature, số La Mã bị bỏ: `slugify('Truyện ｆｕｌｌｗｉｄｔｈ １２３')` → `truyen`, `'ﬁnal'` → `nal`. NFKD tách tiếng Việt giống hệt NFD nhưng chuẩn hoá được các ký tự trên. Đề xuất đổi sang `normalize('NFKD')` (không ảnh hưởng test hiện có).

## Info

- Cắt tại ranh giới có thể làm slug rất ngắn: `'a-' + 'x'.repeat(70)` → `a`. Đúng spec ("cắt tại ranh giới"), và tiêu đề tối đa 150 ký tự với từ tiếng Việt ngắn nên hầu như không xảy ra.
- `vite build` in ra khoảng 20 cảnh báo `MODULE_LEVEL_DIRECTIVE "use client"` từ `@tanstack/react-router`. Đây là nhiễu upstream, không ảnh hưởng.
- `globals.node` áp cho cả code browser trong `apps/web`, và `types: ["node"]` cũng vậy. Hợp lý vì web chứa cả server routes. Hệ quả: lint và tsc không chặn `process.env` trong code client. Theo dõi khi tách server/client.
- Checkbox 1 mục 5 của spec (`docs/project-spec.md:142`) vẫn là `[ ]`, và phase file vẫn `status: todo`. Bước 8 của plan chưa làm (phần việc của lead).

## Edge cases tìm được khi scout

- Biên 60/61 của `slugify`: đúng (đã kiểm bằng probe và đọc code).
- Rejection sampling: đúng, phân phối đều.
- Glob Vitest bắt được test lồng sâu trong `apps/web/src/**` và `.tsx`: đúng.
- Lint có type info cho `.tsx`: đúng.
- `Ð`/`ð`, full-width: lỗi nhỏ (M1, L7).
- `*.int.test.tsx` lọt vào unit (L2); config ở package làm projectService báo lỗi (L3).

## Recommended Actions

1. M1: thêm `ðÐ` vào regex `đĐ`, kèm test.
2. L1: dùng `toBe` với giá trị chính xác trong test cắt 60 ký tự.
3. L2, L7: sửa nhanh, không đổi hợp đồng.
4. L3, L4: làm ở phase 3 / phase 5 khi file tương ứng xuất hiện.
5. Lead: đánh `[x]` checkbox spec và cập nhật status phase sau khi chốt.

## Metrics

- Type coverage: strict, 0 `any`
- Test: 14 unit test cho 2 module của shared (mọi nhánh của `slugify` và `generatePublicId` đều được chạy; nhánh từ chối byte không được test trực tiếp, đã kiểm bằng đọc code và thống kê)
- Lint issues: 0

## Unresolved Questions

- Trong lúc review, có một file `packages/shared/src/edge-case.test.ts` xuất hiện tạm (bản clone chép được nó) rồi biến mất khỏi repo. Có thể do một agent khác (tester) chạy song song. Cần xác nhận nó không bị để lại hoặc không cần commit.
- Port 3000 đang có một dev server chạy trong lúc review (không phải do reviewer bật).
