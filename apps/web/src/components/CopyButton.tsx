'use client';

import { useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CopyButtonProps {
  value: string;
  label?: string;
  ariaLabel: string;
}

function legacyCopy(text: string): boolean {
  const previousFocus = document.activeElement as HTMLElement | null;
  const field = Object.assign(document.createElement('textarea'), { value: text });
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0';
  document.body.append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } finally {
    field.remove();
    previousFocus?.focus({ preventScroll: true });
  }
}

export function CopyButton({ value, label = 'Copy', ariaLabel }: CopyButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMsgRef = useRef('');
  const [copied, setCopied] = useState(false);
  const [tipMessage, setTipMessage] = useState('');

  const handleCopy = async () => {
    const button = btnRef.current;
    if (!button || !value) return;

    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      ok = legacyCopy(value);
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    button.removeAttribute('data-copied');
    button.removeAttribute('data-failed');

    let message = ok ? 'Copied' : 'Copy failed';
    if (message === lastMsgRef.current) {
      message += '\u00A0';
    }
    lastMsgRef.current = message;

    setCopied(ok);
    setTipMessage(message);
    button.setAttribute(ok ? 'data-copied' : 'data-failed', '');

    timerRef.current = setTimeout(() => {
      button.removeAttribute('data-copied');
      button.removeAttribute('data-failed');
      setCopied(false);
      setTipMessage('');
    }, 2000);
  };

  return (
    <span className="copy-wrap">
      <button
        ref={btnRef}
        type="button"
        onClick={handleCopy}
        aria-label={ariaLabel}
        className="copy-btn"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-[var(--emerald)]" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span>{copied ? 'Copied' : label}</span>
      </button>
      <span className="copy-tip" role="status">
        {tipMessage}
      </span>
    </span>
  );
}
