# Cloudflare: cache HTML công khai

Áp khi deploy production (chưa áp ở dev). Origin đã trả header cache đúng; phần này chỉ bảo Cloudflare tôn trọng chúng. Nguồn chuẩn về quy tắc cache vẫn là spec mục 6 và code ở `apps/web/src/lib/cache-headers.ts`.

## Origin trả gì

| Trường hợp | Status | `Cache-Control` |
| --- | --- | --- |
| Trang chương, trang truyện, `/terms`, `/content-policy` đúng URL chuẩn | 200 | `public, s-maxage=86400, stale-while-revalidate=3600` |
| Danh sách đúng URL chuẩn: `/`, `/authors/{username}`, `/tags/{slug}` (và `?page=N`, N > 1) | 200 | `public, s-maxage=600, stale-while-revalidate=3600` |
| Sai slug (path viết thường vẫn khác URL chuẩn), tag đã gộp sang tag chuẩn | 301 | `public, s-maxage=3600` |
| Chỉ khác chữ hoa/thường hoặc có query lạ (trang tag: mọi query ngoài một `page` dạng chuẩn; `page=1` cũng bị bỏ) | 301 | `no-store` |
| `/` cuối path (router tự chuyển, trước loader) | 307 | không có |
| Không tồn tại hoặc không đọc được; trang tag vượt số trang | 404 | `public, s-maxage=60` |
| `/sitemap.xml`, `/sitemap/pages`, `/sitemap/stories/{n}`, `/sitemap/chapters/{n}` | 200 | `public, s-maxage=3600, stale-while-revalidate=86400` |
| `/sitemap/stories/{n}`, `/sitemap/chapters/{n}` với `n` không hợp lệ hoặc quá số trang | 404 | `public, s-maxage=60` |
| `/robots.txt` | 200 | `public, s-maxage=86400` |
| `/api/*`, `/_serverFn/*` | — | `no-store` hoặc không cache |

- HTML công khai không bao giờ phụ thuộc cookie và không có `Set-Cookie`; phần cá nhân tải ở client qua `/api/v1/*`.
- Truyện 18+ thêm `X-Robots-Tag: noindex`; `og:*`/meta description của trang truyện và chương 18+ dùng ảnh OG mặc định và mô tả trung tính (giữ tiêu đề), không lộ bìa hay giới thiệu trong link preview. HTML mọi danh sách không bao giờ chứa truyện 18+; người đã bật xem 18+ tải lại danh sách ở client qua `GET /api/v1/stories` (`no-store`).
- `/settings` trả `no-store`, không nằm trong Cache Rule.
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
     or http.request.uri.path in {"/terms" "/content-policy" "/robots.txt" "/sitemap.xml"}
     or starts_with(http.request.uri.path, "/sitemap/")
   )
   ```

   Sitemap và `robots.txt` phải nằm trong rule: mỗi lần origin dựng sitemap là một lượt đếm/quét bảng chương trên Postgres. Sitemap không được purge khi nội dung đổi; truyện bị ẩn hoặc tác giả bị ban rời sitemap trong tối đa 1 giờ (trang của chúng đã bị purge và trả 404).

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

## Purge cache (worker)

Mọi thay đổi nội dung công khai (chương, truyện, đổi tên hiển thị, ban) ghi một sự kiện vào outbox `content_events`; worker chuyển thành job `purge-urls` rồi gọi API Cloudflare purge theo URL (100 URL/request, timeout 10 giây, lỗi thì BullMQ retry). URL tính từ trạng thái hiện tại trong DB (`urlsFor`, `packages/core/src/cdn/urls-for.ts`):

- Chương: chương đó, chương đọc được liền trước/sau, trang truyện.
- Truyện: trang truyện và mọi chương từng đăng (kể cả đã ẩn/xoá mềm); đổi slug thì purge cả bộ URL slug cũ.
- User: trang tác giả và mọi trang của mọi truyện của họ.
- Kèm theo (chương, truyện, user): trang chủ `/`, trang tác giả, trang 1 của trang tag chuẩn của mọi tag gắn với truyện, kể cả tag vừa bỏ khi tác giả đổi tag (`previousTagSlugs` trong event) (`catalogUrls`, `packages/core/src/catalog/urls.ts`). Trang tag `?page=N` (N > 1) không purge, chỉ hết hạn theo `s-maxage=600`.

**Token:** tạo API Token với đúng một quyền **Zone → Cache Purge → Purge**, giới hạn ở zone của site. Chỉ worker đọc hai biến:

| Biến | Giá trị |
| --- | --- |
| `CF_ZONE_ID` | Zone ID (32 ký tự hex, ở trang Overview của zone) |
| `CF_API_TOKEN` | Token ở trên |

Production thiếu hoặc chỉ có một biến thì worker không khởi động. Dev/test để trống: purge là no-op (log một lần).

**Purge tay** (khi một lần purge tự động bị lỡ, hoặc sau khi restore DB):

```sh
pnpm cdn:purge -- --story <publicId>   # trang truyện + mọi chương từng đăng, in số URL
```

Cần đã đặt `CF_*`, `DATABASE_URL`, `APP_URL`; thiếu `CF_*` thì thoát mã 1. Trường hợp rộng hơn dùng "Purge Everything" trên dashboard.

**Sau deploy (hoặc rollback) làm đổi asset:** khi bản mới đổi hash file CSS/JS/font (ví dụ đổi font, redesign giao diện), bấm **"Purge Everything" trên dashboard ngay sau khi web mới healthy** (`/api/v1/health` trả 200). Lý do: HTML trang chương/truyện đang cache `s-maxage=86400` (`PUBLIC_CACHE`, `apps/web/src/lib/cache-headers.ts`) vẫn trỏ tới asset cũ, mà asset cũ không còn trên origin → trang mất CSS, JS không hydrate, nút ở màn cảnh báo 18+ không chạy. Worker không tự purge trường hợp này (outbox chỉ có sự kiện nội dung). Không chắc bản mới có đổi asset hay không (so tên file trong `apps/web/.output/public/assets/` giữa hai bản) thì cứ purge.

## Cho phép index (`ALLOW_INDEXING`)

Máy tìm kiếm chỉ được vào khi `ALLOW_INDEXING=true` (mặc định `false`, không phụ thuộc `NODE_ENV`):

- `false`: `/robots.txt` trả `User-agent: *` + `Disallow: /`, và mọi trang HTML có `<meta name="robots" content="noindex">` (đặt ở root route, trang lá không gỡ được).
- `true`: `/robots.txt` chỉ chặn `/api/`, `/write`, `/moderation` và trỏ tới `/sitemap.xml`; trang công khai không còn meta robots.
- Bất kể biến này: trang 18+ (meta + `X-Robots-Tag: noindex`), trang riêng tư (tìm kiếm, đăng nhập, viết, tủ truyện...) và trang 404/lỗi luôn `noindex`.

Chỉ bật trên production thật. Staging (NAS) và dev luôn để `false`, kể cả khi chạy `NODE_ENV=production`. Sau khi đổi giá trị phải restart web (env đọc một lần) và purge `/robots.txt` cùng HTML đã cache trên Cloudflare (`robots.txt` cache 1 ngày, trang 1 ngày), nếu không bản cũ còn tới khi hết hạn.

## IP người dùng: đếm lượt đọc và rate limit

Mọi chỗ cần IP (rate limit đăng ký/đăng nhập/viết, giới hạn lượt đọc theo IP, `sessions.ip_address`) đi qua một hàm `clientIp()` ở `packages/core/src/rate-limit/client-ip.ts`:

- `TRUST_CF_IP=false` (mặc định): dùng `request.ip` của srvx (IP kết nối TCP), bỏ qua `X-Forwarded-For` và `CF-Connecting-IP`. **Sau Cloudflare đó là IP edge**, nên mọi người chung một bucket: rate limit chặn oan, đếm lượt đọc lệch.
- `TRUST_CF_IP=true`: dùng `CF-Connecting-IP`. Chỉ bật khi firewall của origin **chỉ nhận kết nối từ dải IP Cloudflare** (https://www.cloudflare.com/ips/), nếu không ai cũng tự đặt được header này và lách giới hạn.

Khi đặt origin sau Cloudflare: bật firewall như trên rồi đặt `TRUST_CF_IP=true`. Lần đầu nhận request, log web in một dòng `[rate-limit] client IP source: <cf-connecting-ip|peer|none>` (không in IP) để kiểm; `none` nghĩa là mọi người chung một bucket, phải xử lý trước khi mở public.

`NODE_ENV=production` mà `TRUST_CF_IP=false` thì web vẫn khởi động nhưng log một cảnh báo `[rate-limit] TRUST_CF_IP=false in production: ...` (một lần mỗi process, khi web nạp env lúc nhận request đầu tiên). Origin nhận kết nối trực tiếp không qua Cloudflare thì bỏ qua cảnh báo này; đứng sau Cloudflare thì phải bật như trên.

`RATE_LIMIT_FACTOR` chỉ dùng cho test; production khác 1 thì web không khởi động.

### Rủi ro đã chấp nhận: khoá chủ tài khoản tới 24 giờ

Giới hạn theo email toàn cục (mọi IP cộng lại, `RATE_LIMITS` trong `packages/shared/src/rate-limits.ts`) chặn dò mật khẩu và spam email phân tán, nhưng kẻ xấu biết email của ai đó có thể dùng nó để khoá chính chủ:

- Gửi đủ 10 yêu cầu quên mật khẩu/ngày cho email đó (`forgotPassword.emailGlobal`, đếm cả yêu cầu thành công): chủ không nhận được link đặt lại mật khẩu tới khi hết cửa sổ 24 giờ.
- Liên tục đăng nhập sai quá 50 lần/giờ (`signIn.emailGlobal`, chỉ đếm lần sai): đăng nhập bằng mật khẩu bị chặn với mọi IP, kể cả chủ nhập đúng.

Gộp lại, chủ tài khoản dùng mật khẩu có thể bị khoá tới 24 giờ. Chủ có liên kết Google OAuth vẫn đăng nhập được (OAuth không đi qua giới hạn theo email). Phiên đang đăng nhập không bị đăng xuất.

Chấp nhận cho năm đầu (ít người dùng, chưa có giá trị để nhắm). **Xem lại khi có người dùng thật**: theo dõi log 429 của `/sign-in/email` và `/request-password-reset`; hướng xử lý khi cần là bỏ qua giới hạn email toàn cục cho thiết bị đã từng đăng nhập thành công, hoặc thêm CAPTCHA (Turnstile) sau vài lần sai.

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
