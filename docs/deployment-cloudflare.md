# Cloudflare: cache HTML công khai

Áp khi deploy production (chưa áp ở dev). Origin đã trả header cache đúng; phần này chỉ bảo Cloudflare tôn trọng chúng. Nguồn chuẩn về quy tắc cache vẫn là spec mục 6 và code ở `apps/web/src/lib/cache-headers.ts`.

## Origin trả gì

| Trường hợp | Status | `Cache-Control` |
| --- | --- | --- |
| Trang công khai đúng URL chuẩn (chương, sau này truyện, tác giả, tag, trang chủ) | 200 | `public, s-maxage=86400, stale-while-revalidate=3600` |
| Sai slug (path viết thường vẫn khác URL chuẩn) | 301 | `public, s-maxage=3600` |
| Chỉ khác chữ hoa/thường hoặc có query lạ | 301 | `no-store` |
| `/` cuối path (router tự chuyển, trước loader) | 307 | không có |
| Không tồn tại hoặc không đọc được | 404 | `public, s-maxage=60` |
| `/api/*`, `/_serverFn/*` | — | `no-store` hoặc không cache |

- HTML công khai không bao giờ phụ thuộc cookie và không có `Set-Cookie`; phần cá nhân tải ở client qua `/api/v1/*`.
- Truyện 18+ thêm `X-Robots-Tag: noindex`.
- URL chuẩn dựng bằng `canonicalPath()` (`packages/shared/src/canonical-path.ts`). Purge (worker) chỉ chạm URL chuẩn, nên mọi biến thể khác chỉ được giữ phản hồi 301/404, không bao giờ giữ nội dung.

## Cache Rule

Rules → Cache Rules → Create rule, tên `public-html`:

1. **Khi nào áp** (biểu thức):

   ```
   (http.request.method eq "GET" or http.request.method eq "HEAD")
   and (
     http.request.uri.path eq "/"
     or starts_with(http.request.uri.path, "/stories/")
     or starts_with(http.request.uri.path, "/authors/")
     or starts_with(http.request.uri.path, "/tags/")
     or http.request.uri.path in {"/terms" "/content-policy"}
   )
   ```

   Không đưa vào: `/api/*`, `/_serverFn/*`, `/write/*`, `/moderation*`, `/library*`, `/settings*`, `/search*`, trang đăng nhập/đăng ký/quên mật khẩu/đặt lại mật khẩu. Các đường dẫn này không khớp biểu thức trên nên Cloudflare không cache HTML của chúng.

2. **Cache eligibility:** Eligible for cache.
3. **Edge TTL:** Use cache-control header if present (bypass cache if not present). 307 của `/` cuối không có header nên không bị cache.
4. **Browser TTL:** Respect origin TTL (`s-maxage` chỉ áp cho CDN; browser không giữ HTML).
5. **Cache key:** giữ mặc định, **không bật "Ignore query string"**, không sort query.
   - Nếu bỏ query khỏi key: phản hồi 301 của `/x?a=1` bị cache dưới key của `/x` → URL chuẩn trả 301 về chính nó (vòng redirect); `/tags/x?page=2` nhận nhầm trang 1.
   - Giữ query trong key: biến thể có query chỉ có thể cache phản hồi 301 (không chứa nội dung), purge không cần chạm tới.

## URL Normalization

Rules → Settings → URL Normalization: để mặc định **Cloudflare normalization, Normalize incoming URLs: bật**.

Start tự decode path trước khi tới loader (`%2D` thành `-`), nên origin không phân biệt được URL percent-encode ký tự không dành riêng với URL chuẩn và trả 200 cho cả hai. Chuẩn hoá URL của Cloudflare đưa các biến thể này về cùng cache key với URL chuẩn, nên purge vẫn phủ được. Tắt chuẩn hoá thì những biến thể này có thể giữ bản cache riêng tới hết `s-maxage`.

## `stale-while-revalidate`

Header luôn gửi `stale-while-revalidate=3600` (chốt ở validate 2026-10-05). Gói Cloudflare không hỗ trợ thì bỏ qua phần này; không đổi header theo gói.

## Kiểm tra sau khi áp

Thay `https://example.com` và URL chương thật:

```sh
URL=https://example.com/stories/kiem-dao-doc-ton-k7m2xq9p/chapter-1

# Lần hai phải HIT; không có set-cookie
curl -sI "$URL" | grep -iE 'cf-cache-status|cache-control|set-cookie'
curl -sI "$URL" | grep -iE 'cf-cache-status|cache-control|set-cookie'

# Query lạ → 301 về URL chuẩn, không phải 200
curl -sI "$URL?utm_source=x" | grep -iE '^HTTP|location|cache-control'

# Trang tag: trang 2 khác nội dung trang 1 (sau khi có trang tag)
curl -s https://example.com/tags/tien-hiep | md5
curl -s 'https://example.com/tags/tien-hiep?page=2' | md5

# API không bao giờ cache
curl -sI https://example.com/api/v1/health | grep -iE 'cf-cache-status|cache-control'
```

Kỳ vọng: URL chuẩn `cf-cache-status: HIT` ở lần hai; `?utm_source=x` trả `301` + `cache-control: no-store`; API `DYNAMIC` hoặc `BYPASS`.
