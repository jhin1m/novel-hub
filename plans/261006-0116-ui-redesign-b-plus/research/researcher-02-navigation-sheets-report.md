# Research: Navigation, Sheets & Reader UX — Radix Dialog, Responsive Sheets, Focus Traps

**Date:** 2026-10-06  
**Status:** Research complete; 5 technical questions addressed with recommendations.

---

## Q1: Sheet Desktop Overlay (Transparent vs. Modal)

**Question:** Sheet cài đặt desktop phải không lớp phủ tối (giữ cột chữ nhìn thấy). Với Radix Dialog 1.6.7:
- Giữ `modal` hay `modal={false}`?
- Hệ quả focus trap, scroll lock, đóng click ngoài?
- E2E `getByRole('dialog', { name: 'Cài đặt hiển thị' })` vẫn hoạt động?

**Finding:**
- Radix Dialog `modal={false}` vẫn **trap focus** và khóa scroll nhưng **không block background interaction** ở accessibility layer.
- Overlay `bg-black/50` có thể thay thành `bg-transparent` bằng CSS; vẫn dùng `inert` attribute trên background để prevent pointer events.
- `getByRole('dialog')` vẫn work; focus trapping theo chuẩn ARIA không đổi.

**Recommendation:**
```tsx
// Giữ modal={false}, thay overlay CSS
<Sheet modal={false}>
  <SheetContent side="right" className="gap-0 overflow-y-auto">
    {/* Content */}
  </SheetContent>
</Sheet>

// Thay SheetOverlay className:
// Từ: 'bg-black/50'
// Sang: 'bg-transparent' (hoặc bỏ bcs modal={false} không render overlay tối)
```

- **Focus trap:** Giữ nguyên; `modal={false}` không disable trap.
- **Scroll lock:** Vẫn hoạt động; Radix lock scroll ngay khi `<Portal>` mount.
- **Click outside:** Đóng vẫn work (đóng khi click overlay; overlay transparent nhưng vẫn `inert`).
- **E2E:** Không đổi; `getByRole('dialog')` vẫn match.

---

## Q2: Bottom Sheet Mobile (Radix Dialog + Tailwind, No vaul)

**Question:** Bottom sheet dùng Radix Dialog + Tailwind (không vaul). Pattern responsive cùng component (`side="bottom"` ở < md, "right" ≥ md) — an toàn với SSR/hydration?

**Finding:**
- Radix Dialog hỗ trợ `side="bottom"` | `"right"` | `"left"` | `"top"` native.
- Responsive dùng **CSS-only** (Tailwind `md:`) an toàn; nếu dùng `matchMedia` JS sẽ xảy ra hydration mismatch.
- Safe-area: dùng CSS `padding-bottom: max(0px, env(safe-area-inset-bottom))` hoặc `pb-[max(0,_var(safe-area-inset-bottom))]` (Tailwind v4 hỗ trợ `env()` trong `@theme`).

**Recommendation:**
```tsx
// Responsive side; CSS-only dùng Tailwind media queries
const responsive = {
  side: 'bottom' as const, // render bottom sheet luôn; Tailwind sẽ điều chỉnh width/height via className
};

<Sheet modal={false}>
  <SheetContent 
    side="bottom"
    className={cn(
      'h-[90vh] md:h-auto md:max-w-sm md:right-0 md:w-auto md:inset-y-0 md:border-t md:border-r',
      'rounded-t-2xl md:rounded-none pb-[max(0,_env(safe-area-inset-bottom))]'
    )}
  >
    {/* Content */}
  </SheetContent>
</Sheet>
```

- SSR/hydration: CSS media queries không gây mismatch; server render một version, client style động qua Tailwind breakpoints.
- Safe-area: nên áp dùng Tailwind thay vì viết `env()` trực tiếp (Tailwind v4 parse `env()` trong `@theme`).

---

## Q3: TanStack Router Tab Navigation (activeProps + aria-current + exact)

**Question:** Thanh tab dưới mobile 5 mục với TanStack Router Link:
- `activeProps` tự gắn `aria-current="page"` không?
- `activeOptions.exact` cho `/` (root) hoặc navigation tab?
- E2E: tìm link nào? Hidden routes?

**Finding:**
- `activeProps` là object props áp dụng khi link match; phải **tự gắn** `aria-current: 'page'` nếu cần.
- `activeOptions.exact` (default `false`) chỉ match exact path; `/` chỉ match khi pathname là `/` đúng, không match `/search`.
- E2E: dùng `getByRole('link', { current: 'page' })` để tìm active link.

**Recommendation:**
```tsx
<Link 
  to="/" 
  activeProps={{
    className: 'bg-primary-soft',
    'aria-current': 'page',
  }}
  activeOptions={{ exact: true }}
>
  Trang chủ
</Link>

// E2E
getByRole('link', { current: 'page' }); // Tìm active tab
```

- Ẩn tab ở trang đọc/editor: dùng `{tabBarHidden && <div />}` hoặc CSS `hidden` based on route match (đơn giản nhất: if-statement ở layout).
- Padding nội dung: thêm `pb-[72px]` khi tab bar visible (mobile < md).

---

## Q4: Nav Visibility + A11y + aria-disabled

**Question:** Rail desktop + thanh dưới mobile ẩn/hiện theo cuộn (hook `useNavVisibility`). A11y cho link "Trước"/"Sau" (chữ hiển thị ngắn). Disabled link?

**Finding:**
- `useNavVisibility` hook hiện tại dùng scroll tracking + middle-tap toggle → tốt; giữ nguyên.
- **Disabled link:** Không nên dùng `aria-disabled="true"` trên `<a href>`. Link vẫn điều hướng được dù có attribute.
  - Giải pháp: `<Button disabled>` (native button, không href) hoặc `<span role="button" aria-disabled="true">`.
- **aria-label:** Chữ hiển thị ngắn ("Trước") phải nằm trong `aria-label` đầy đủ ("Chương trước") để WCAG 2.5.3.

**Recommendation:**
```tsx
// Disabled link: dùng Button disabled
<Button disabled>Trước</Button>

// Hoặc span cho semantic không phải button:
<span role="button" aria-disabled="true" aria-label="Chương trước">
  Trước
</span>

// Active link có aria-label chứa chữ hiển thị
<NavLink 
  href={prevHref} 
  aria-label="Chương trước" // Chứa "Trước"
>
  Trước
</NavLink>
```

- Focus: khi link disabled, không focusable (`tabindex="-1"` hoặc button `disabled`).

---

## Q5: Editor Toolbar Mobile (visualViewport)

**Question:** Toolbar editor mobile dính đáy, phía trên bàn phím ảo iOS/Android. Mức tối thiểu không thư viện?

**Finding:**
- **Modern (iOS 15+, Android 11+):** Dùng Tailwind `h-dvh` (dynamic viewport height) — tự adjust khi keyboard mở.
- **Fallback JS:** `window.visualViewport` resize event; dùng `visualViewport.height` để track keyboard height.
- **Position:** `fixed bottom-0`; dùng `transform: translateY(-100%)` nếu cần move toolbar.

**Recommendation:**
```tsx
// CSS-only (modern browsers)
<div className="h-dvh overflow-y-auto"> {/* Content */} </div>
<div className="fixed bottom-0 inset-x-0 pb-[max(0,_env(safe-area-inset-bottom))] bg-card">
  {/* Toolbar */}
</div>

// Fallback JS (iOS < 15, Android < 11)
useEffect(() => {
  const onResize = () => {
    const height = window.visualViewport?.height || window.innerHeight;
    // Adjust toolbar or content based on height
  };
  window.visualViewport?.addEventListener('resize', onResize);
}, []);
```

- Tailwind `h-dvh` không cần JS; cách này được khuyến nghị nhất (DVH là viewport unit mới).
- Không cần thư viện; JS fallback là vài dòng với `visualViewport` API.

---

## Unresolved Questions

1. **Bottom sheet gesture support:** Radix Dialog `side="bottom"` không hỗ trợ swipe-to-dismiss native (cần vaul hoặc custom JS). Liệu có cần? (Hoặc giữ desktop-only scroll dismiss?)
2. **Custom focus outline desktop sheet:** Khi sheet phải không tối, focus outline (ring) có độ tương phản đủ trên background không sáng? (Test cần trước khi implement.)
3. **Tab bar visibility state:** Làm sao track route để ẩn tab bar ở trang đọc/editor? (Route match hay layout prop?)
4. **visualViewport polyfill:** Cần fallback cho iOS < 15? (Hay chỉ support iOS 15+ là đủ?)

---

**Sources:**
- [Radix UI Dialog Documentation](https://www.radix-ui.com/primitives/docs/components/dialog)
- [TanStack Router Navigation Guide](https://tanstack.com/router/latest/docs/framework/react/guide/navigation)
- [Mobile Keyboard with visualViewport (DEV Community)](https://dev.to/franciscomoretti/fix-mobile-keyboard-overlap-with-visualviewport-3a4a)
- [ARIA disabled vs HTML disabled (Deque Blog)](https://www.deque.com/de/blog/distinguishing-between-aria-and-native-html-attributes/)
- [Sheet Pattern Examples (shadcn/ui)](https://www.shadcn.io/patterns/sheet-standard-1)
