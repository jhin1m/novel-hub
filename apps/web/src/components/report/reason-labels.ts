import type { ReportReason } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';

export const REASON_LABELS: Record<ReportReason, () => string> = {
  copyright: m.report_reason_copyright,
  plagiarism: m.report_reason_plagiarism,
  spam: m.report_reason_spam,
  prohibited: m.report_reason_prohibited,
  mislabeled: m.report_reason_mislabeled,
  duplicate: m.report_reason_duplicate,
};
