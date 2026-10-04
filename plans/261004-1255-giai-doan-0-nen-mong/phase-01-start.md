---
title: "Phase 1: Monorepo, TypeScript, ESLint, Prettier, Vitest"
status: completed
priority: P1
effort: "1d"
dependencies: []
---

# Phase 1: Monorepo, TypeScript, ESLint, Prettier, Vitest

Spec checkbox: `Monorepo pnpm, TypeScript strict, ESLint, Prettier, Vitest.`

## Context Links

- Spec mục 2 (stack), 3 (cấu trúc repo), 4 (URL, slug, public_id, giới hạn nội dung), 9 (quy ước code)
- `plans/reports/researcher-261004-1954-infra-tooling-bullmq-report.md` (TS, ESLint, Vitest)
- `plans/reports/researcher-261004-1954-tanstack-start-hono-report.md` (scaffold Start, JIT packages)

## Overview

Dựng workspace pnpm với tooling chung, `packages/shared` có code thật (slug, public_id) và `apps/web` là app TanStack Start tối thiểu. Các package khác (`db`, `api`, `core`, `auth`, `worker`) tạo ở phase dùng tới chúng, không tạo vỏ rỗng.

## Key Insights

- `typescript-eslint` 8.71 chỉ hỗ trợ TS `<6.1` → ghim `typescript@~6.0.3`.
- TS 6: `types` mặc định `[]` → mỗi package khai báo `"types": ["node"]`.
- Package JIT: `"exports": { ".": "./src/index.ts" }`, `"sideEffects": false`; Vite SSR bundle được vì pnpm symlink ra ngoài `node_modules` (smoke-test thật ở phase 4, khi web import `@novel-hub/api`).
- `moduleResolution: bundler` cho mọi nơi (Vite + tsx), import tương đối không đuôi.
- Vitest 5: tên project phải duy nhất toàn repo và các project mặc định chạy song song → dùng **đúng 2 project khai báo ở root** (`unit`, `integration`) quét mọi package, không có `vitest.config.ts` riêng từng package. <!-- Red Team: integration DB isolation -->

## Requirements

- Functional:
  - `pnpm install` sạch; `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` xanh.
  - `@novel-hub/shared` export `slugify`, `generatePublicId`, `isValidPublicId`.
  - `apps/web` chạy `pnpm --filter @novel-hub/web dev` ra trang trống (không chuỗi hiển thị hardcode).
- Non-functional: strict TS, không `any`, version ghim qua `catalog:`.

## Architecture

```
.
├── package.json              # scripts gốc, packageManager, engines
├── pnpm-workspace.yaml       # packages: apps/*, packages/*; catalog; allowBuilds
├── tsconfig.base.json
├── eslint.config.js          # flat config gốc, projectService
├── .prettierrc / .prettierignore
├── vitest.config.ts          # test.projects
├── .nvmrc / .gitignore / .editorconfig
├── apps/web/                 # TanStack Start tối thiểu
└── packages/shared/          # slug, public-id
```

Vitest: một file `vitest.config.ts` ở root, `test.projects` khai báo inline 2 project:
- `unit`: include `{packages,apps}/*/src/**/*.test.{ts,tsx}`, exclude `**/*.int.test.ts`, chạy song song.
- `integration`: include `{packages,apps}/*/src/**/*.int.test.ts`, `fileParallelism: false`, `testTimeout`/`hookTimeout` 30s, `passWithNoTests: true`. Phase 3 gắn `globalSetup` (migrate DB test một lần) vào đây — mọi package dùng chung một DB test, tuần tự, không đua nhau.
- Root scripts: `test` = `vitest run --project unit`; `test:int` = `vitest run --project integration`.

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `package.json` | create | `private`, `type: module`, `packageManager: pnpm@12.9.1`, `engines.node >=24 <25`, scripts `typecheck`/`lint`/`lint:fix`/`format`/`format:check`/`test`/`test:int`/`dev` |
| `pnpm-workspace.yaml` | create | `packages`, `catalog` (typescript, zod, vitest, @types/node), `allowBuilds` (kiểm chứng tên setting pnpm 12 khi `pnpm install`) |
| `tsconfig.base.json` | create | flags mục Key Insights + research |
| `eslint.config.js` | create | xem Implementation step 4 |
| `.prettierrc`, `.prettierignore` | create | |
| `vitest.config.ts` | create | 2 project inline `unit` / `integration` (xem Architecture) |
| `.nvmrc`, `.editorconfig`, `.gitignore` | create | gitignore: `node_modules`, `.env`, `.env.*` trừ `.env.example`, `.output`, `dist`, `.tanstack`, `.nitro`, `packages/shared/src/paraglide`, `test-results`, `playwright-report` |
| `packages/shared/package.json` | create | `@novel-hub/shared`, exports `.`, `sideEffects: false` |
| `packages/shared/tsconfig.json` | create | extends base |
| `packages/shared/src/index.ts` | create | re-export |
| `packages/shared/src/slug.ts` | create | `slugify` |
| `packages/shared/src/public-id.ts` | create | `PUBLIC_ID_ALPHABET`, `generatePublicId`, `isValidPublicId` |
| `packages/shared/src/slug.test.ts` | create | |
| `packages/shared/src/public-id.test.ts` | create | |
| `apps/web/package.json` | create | `@novel-hub/web`, scripts `dev`/`build`/`start`/`typecheck` |
| `apps/web/tsconfig.json` | create | lib DOM, jsx react-jsx |
| `apps/web/vite.config.ts` | create | `tailwindcss()`, `tanstackStart({ srcDirectory: 'src' })`, `viteReact()`, `nitro()`, `resolve.tsconfigPaths` |
| `apps/web/src/router.tsx` | create | `getRouter()` |
| `apps/web/src/routes/__root.tsx` | create | `HeadContent`, `Scripts`, `Outlet`, `<html lang="vi">` |
| `apps/web/src/routes/index.tsx` | create | trang trống |
| `apps/web/src/routeTree.gen.ts` | generated | commit (để `typecheck` chạy được mà không cần dev) |
| `apps/web/src/styles/app.css` | create | `@import "tailwindcss";` — không token màu/font (chờ Design System, spec mục 8) |

## Implementation Steps

1. Root `package.json`, `pnpm-workspace.yaml` (catalog: `typescript: ~6.0.3`, `zod: ^4.6.5`, `vitest: ^5.0.3`, `@types/node: ^24`), `.nvmrc` = `24`.
2. `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`, `moduleDetection: force`, `module: esnext`, `moduleResolution: bundler`, `target: es2023`, `lib: [es2023]`, `skipLibCheck`, `noEmit`, `esModuleInterop`, `resolveJsonModule`. Không `baseUrl`, không `declaration`.
3. `packages/shared`:
   - `slugify(title)`: NFD + bỏ dấu kết hợp, `đ/Đ → d`, lowercase, ký tự không `[a-z0-9]` → `-`, gộp `-`, trim `-`, cắt ≤60 ký tự tại ranh giới `-` gần nhất (không để `-` cuối). Chuỗi rỗng sau chuẩn hoá → trả `'truyen'` (tránh URL `/truyen/-abc`) — ghi rõ trong test.
   - `PUBLIC_ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'` (bỏ `0 o 1 l i`). `generatePublicId()` dùng `crypto.getRandomValues` + rejection sampling (tránh lệch modulo). Việc "gặp trùng thì sinh lại" (spec mục 4) phải dựa vào lỗi unique khi INSERT, không kiểm tra trước rồi mới ghi (race) → helper retry-on-insert nằm ở `core` khi Giai đoạn 1 tạo truyện; seed phase 3 tự retry tương tự. <!-- Red Team: check-then-insert race -->
   - `isValidPublicId` regex `^[abcdefghjkmnpqrstuvwxyz23456789]{8}$`.
4. `eslint.config.js`: ignores (`**/node_modules`, `**/.output`, `**/.tanstack`, `**/.nitro`, `**/routeTree.gen.ts`, `**/src/paraglide/**`, `packages/db/drizzle/**`); `js.configs.recommended`; `tseslint.configs.recommendedTypeChecked` + `parserOptions.projectService: true, tsconfigRootDir: import.meta.dirname`; rules `@typescript-eslint/consistent-type-imports: error`, `@typescript-eslint/no-explicit-any: error`; `react-hooks` flat recommended cho `apps/web/**/*.{ts,tsx}`; `tseslint.configs.disableTypeChecked` cho `**/*.{js,mjs,cjs}` và `**/*.config.ts` nếu không thuộc tsconfig nào; `eslint-config-prettier/flat` cuối.
5. Prettier: `singleQuote`, `trailingComma: all`, `printWidth: 100`, `plugins: ['prettier-plugin-tailwindcss']`, `tailwindStylesheet: './apps/web/src/styles/app.css'` (kiểm chứng tên option với README plugin 0.8.x), `tailwindFunctions: ['cn', 'cva']`.
6. `apps/web`: scaffold theo `examples/react/start-basic` (versions ghim: `@tanstack/react-start@1.168.60`, `@tanstack/react-router@1.170.41`, `vite@^8.3.2`, `@vitejs/plugin-react@^6.1.1`, `nitro@3.0.260903-beta` exact, `tailwindcss` + `@tailwindcss/vite@^4.3.3`). Route `index` render `<main />`. Smoke-test bundle package JIT diễn ra ở phase 4 (web import `@novel-hub/api`); phase này chỉ cần `vite build` thành công.
7. Chạy `pnpm install`, xử lý cảnh báo build-script (cho phép `esbuild` nếu được hỏi). Chạy toàn bộ gate.
8. Đánh `[x]` checkbox 1 trong spec mục 5.

## Function / Interface Checklist

- [x] `slugify(input: string): string`
- [x] `generatePublicId(): string`
- [x] `isValidPublicId(id: string): boolean`

## Test Scenario Matrix

| Mức | Kịch bản | File |
|---|---|---|
| Critical | `slugify('Kiếm Đạo Độc Tôn')` = `kiem-dao-doc-ton` | `slug.test.ts` |
| Critical | dấu chồng tầng (`ỗ`, `ậ`, `ữ`), `Đ` hoa, ký tự đặc biệt, nhiều khoảng trắng | `slug.test.ts` |
| High | cắt 60 ký tự không để `-` cuối; chuỗi chỉ có ký hiệu → `'truyen'` | `slug.test.ts` |
| Critical | `generatePublicId` dài 8, chỉ ký tự trong alphabet, 10k lần không chứa `0 o 1 l i` | `public-id.test.ts` |
| Medium | `isValidPublicId` từ chối độ dài sai, chữ hoa, ký tự cấm | `public-id.test.ts` |

## Dependency Map

- Không phụ thuộc phase nào.
- Phase 3 dùng `slugify`, `generatePublicId` cho seed.
- `LIMITS` (giới hạn nội dung mục 4) để Giai đoạn 1 khi có form/API tạo truyện dùng tới (YAGNI).
- Phase sau thêm test vào package mới: glob ở root tự nhận, không phải sửa config (trừ `globalSetup` ở phase 3).

## Success Criteria

- [x] `pnpm install` không lỗi; lockfile được tạo
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` xanh
- [x] `pnpm test:int` xanh (không có test, `passWithNoTests`)
- [x] `pnpm --filter @novel-hub/web build` thành công; `dev` mở được `/`
- [x] Checkbox 1 spec mục 5 = `[x]`

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| `nitro` beta vỡ build | Ghim exact; nếu lỗi, thử tag beta trước đó; ghi lại version chạy được |
| Tên setting pnpm 12 cho build-script khác research | Đọc output `pnpm install`, dùng đúng tên CLI đề xuất |
| Project `unit` cần môi trường DOM cho component test sau này | Khi cần, thêm project `web-dom` riêng (jsdom/happy-dom) — không cần ở Giai đoạn 0 |
| typed lint chậm | Chấp nhận ở quy mô hiện tại |

## Security Considerations

- `.gitignore` chặn mọi `.env*` trừ `.env.example` ngay từ phase 1.
- `generatePublicId` dùng CSPRNG, không `Math.random`.

## Ghi chú triển khai (2026-10-04)

- Gate xanh: `typecheck`, `lint`, `format:check`, `test` (15/15), `test:int` (chưa có test), `web build`, `dev` trả 200 ở `/`.
- `pnpm install` không chặn build-script nào (Vite 8 dùng rolldown, không cần esbuild) nên chưa thêm `allowBuilds`; xem lại khi thêm `sharp` ở Giai đoạn 1.
- Theo review: `slugify` dùng NFKD và quy `ð/Ð` về `d`; project `unit` loại cả `*.int.test.tsx`; ESLint tắt lint có type cho mọi `**/*.config.ts` (chuẩn bị cho `drizzle.config.ts` ở phase 3).
- `.prettierignore` bỏ qua `plans/`, `docs/`, `CLAUDE.md` để không định dạng lại tài liệu.
- `vitest.config.ts` ở root không qua `tsc` (`pnpm -r` bỏ qua package root); chấp nhận.
- Báo cáo: `plans/reports/tester-261004-2105-phase-01-monorepo-report.md`, `plans/reports/code-reviewer-261004-2105-phase-01-monorepo-review-report.md`.

## Next Steps

Phase 2: hạ tầng dev và biến môi trường.
