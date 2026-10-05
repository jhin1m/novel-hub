# Fix: gate đỏ ở `pnpm format:check` (file inlang tự sinh)

- Triệu chứng: `prettier --check .` báo `packages/shared/project.inlang/.meta.json`, `README.md`.
- Gốc: inlang SDK (3.0.6, qua `@inlang/paraglide-js` 2.25.4) tự sinh `.gitignore`, `.meta.json`, `README.md`, `.lix/` trong `project.inlang` khi `pnpm install` chạy compile (tạo 2026-10-05 17:11). Git bỏ qua nhờ `.gitignore` lồng của inlang (`*` + `!settings.json`), nhưng Prettier 3 chỉ đọc `.gitignore` gốc + `.prettierignore`, không đọc `.gitignore` lồng.
- Sửa: `.prettierignore` thêm `**/*.inlang/*` và `!**/*.inlang/settings.json` (cùng quy tắc với inlang). `settings.json` vẫn được check (`prettier --file-info` → `ignored: false`).
- Verify: gate đầy đủ `typecheck && lint && format:check && test && test:int && test:e2e` exit 0, e2e 72 passed. Log: `/tmp/nh-gate.log`.

## Validation Log
- [auto] Sửa `.prettierignore` thay vì format file sinh ra: file do SDK ghi lại, format tay sẽ bị ghi đè lần sau.
- [auto] `.prettierignore` không thuộc nhóm config cấm đổi (Docker, env, CI, Cloudflare): là ignore của tooling, thay đổi 3 dòng.
- [auto] Bỏ code-reviewer subagent/regression test: thay đổi chỉ 3 dòng ignore, gate là bằng chứng (YAGNI).

## Câu hỏi mở
Không có.
