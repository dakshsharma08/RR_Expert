/**
 * Optional syllabus PDF / notes photo / notice screenshot (≤10 MB).
 * It's read into memory and sent to Gemini as inline data. Never stored.
 */
import { useRef, useState } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import { ATTACHMENT_TYPES, LIMITS, type IntakeInput } from '@shared/plan';
import { Button } from '@/components/ui/button';

type Attachment = NonNullable<IntakeInput['attachment']>;

export function AttachmentPicker({
  value,
  onChange,
}: {
  value: IntakeInput['attachment'];
  onChange: (a: IntakeInput['attachment']) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onFile(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (!(ATTACHMENT_TYPES as readonly string[]).includes(f.type)) {
      setError('Use a PDF, PNG, JPG or WEBP file.');
      return;
    }
    if (f.size > LIMITS.fileBytes) {
      setError(`That file is ${(f.size / 1048576).toFixed(1)} MB. The limit is 10 MB.`);
      return;
    }
    setLoading(true);
    try {
      const data = await fileToBase64(f);
      onChange({ name: f.name.slice(0, 200), mimeType: f.type as Attachment['mimeType'], data });
    } catch {
      setError('Could not read that file.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        Reference material <span className="font-normal text-muted">· optional</span>
      </p>
      {value ? (
        <div className="flex items-center gap-3 rounded-[14px] border border-hairline bg-surface-2/60 p-3">
          <FileText className="size-5 text-accent-text" strokeWidth={1.5} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm">{value.name}</span>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label={`Remove ${value.name}`}
            className="inline-flex size-11 items-center justify-center rounded-xl text-muted hover:text-text"
          >
            <X className="size-4" strokeWidth={1.5} />
          </button>
        </div>
      ) : (
        <Button
          variant="subtle"
          onClick={() => ref.current?.click()}
          loading={loading}
          icon={<Paperclip className="size-4" strokeWidth={1.5} />}
        >
          Add syllabus, notes photo or screenshot
        </Button>
      )}
      <input
        ref={ref}
        type="file"
        accept={ATTACHMENT_TYPES.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <p className="text-xs text-muted">
        PDF, PNG, JPG or WEBP up to 10 MB. Gemini reads it once to plan. We don't store it.
      </p>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}
