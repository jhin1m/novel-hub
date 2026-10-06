import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SaveStatus } from '@/lib/autosave';
import { SaveStatusText, saveStatusTone } from './save-status';

const at = new Date(2026, 9, 6, 9, 5);

describe('saveStatusTone', () => {
  it('maps every save status to its dot colour family', () => {
    const cases: [SaveStatus, ReturnType<typeof saveStatusTone>][] = [
      [{ kind: 'saved', at }, 'ok'],
      [{ kind: 'dirty' }, 'idle'],
      [{ kind: 'saving' }, 'idle'],
      [{ kind: 'error', retryInMs: 2000 }, 'problem'],
      [{ kind: 'conflict' }, 'problem'],
    ];
    for (const [status, tone] of cases) expect(saveStatusTone(status)).toBe(tone);
  });
});

describe('SaveStatusText', () => {
  it('is a live status with the kind and a decorative dot', () => {
    const html = renderToStaticMarkup(<SaveStatusText status={{ kind: 'saved', at }} />);
    expect(html).toMatch(/^<p role="status" aria-live="polite" data-status="saved"/);
    expect(html).toContain(
      '<span aria-hidden="true" class="mr-1.5 inline-block size-1.5 rounded-full align-middle bg-primary">',
    );
    expect(html).toContain('Đã lưu lúc 09:05');
  });

  it('colours problems in red, text and dot', () => {
    const html = renderToStaticMarkup(<SaveStatusText status={{ kind: 'conflict' }} />);
    expect(html).toContain('text-destructive');
    expect(html).toContain('bg-destructive');
    expect(html).not.toContain('text-muted-foreground');
  });

  it('keeps waiting states muted with a grey dot', () => {
    const html = renderToStaticMarkup(<SaveStatusText status={{ kind: 'dirty' }} />);
    expect(html).toContain('text-muted-foreground');
    expect(html).toContain('align-middle bg-muted-foreground');
    expect(html).toContain('Chưa lưu');
  });
});
