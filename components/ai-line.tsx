'use client';
import { useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, LoaderCircle, Search, Sparkles } from 'lucide-react';
import { AI_LINE_MAX, cleanAiText, type AiChip } from '../lib/ai-line';
import './map-home.css';

export {
  roleAiLine, cleanAiText, AI_LINE_MAX,
  aiAskKey, administratorChatPath, leaveAiAsk, takeAiAsk, askAdministratorInChats,
} from '../lib/ai-line';
export type { AiChip, RoleAiLine } from '../lib/ai-line';

type AiLineProps = {
  placeholder: string;
  /** The last resort for a line so narrow that the placeholder does not fit even in the smaller size. */
  shortPlaceholder?: string;
  chips?: AiChip[];
  onSubmit: (text: string) => void;
  /** Without it a chip that has href is a plain link. */
  onChip?: (chip: AiChip) => void;
  busy?: boolean;
  /** Accessible name of the input. */
  label?: string;
  /**
   * 'ai' (the sparkle) only where the text really reaches the AI administrator;
   * 'search' where it is read by the search rules alone.
   */
  icon?: 'ai' | 'search';
  initialText?: string;
  /** Keep the text after sending, for example to show what was searched. */
  keepText?: boolean;
  className?: string;
};

// An example cut in the middle reads as broken. The example is shown whole: in the size of the typed text
// where it fits, a step smaller on a narrow phone, and only then replaced by the short one.
// Measured in the input's own font, because fonts differ from device to device.
function useFittingPlaceholder(placeholder: string, short?: string) {
  const input = useRef<HTMLInputElement>(null);
  const [fit, setFit] = useState({ text: placeholder, compact: false });

  useLayoutEffect(() => {
    const element = input.current;
    const context = document.createElement('canvas').getContext('2d');
    if (!element || !context) return;
    const measure = () => {
      const room = element.clientWidth;
      if (!room) return;
      const style = getComputedStyle(element);
      const small = style.getPropertyValue('--t-font-label').trim() || '14px';
      const fits = (text: string, size: string) => {
        context.font = style.fontStyle + ' ' + style.fontWeight + ' ' + size + ' ' + style.fontFamily;
        // Four pixels of reserve for the rounding of letter widths.
        return context.measureText(text).width + 4 <= room;
      };
      const next = fits(placeholder, style.fontSize) ? { text: placeholder, compact: false }
        : fits(placeholder, small) || !short ? { text: placeholder, compact: true }
          : { text: short, compact: !fits(short, style.fontSize) };
      setFit(current => current.text === next.text && current.compact === next.compact ? current : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [placeholder, short]);

  return { input, ...fit };
}

// One line for a free request and a row of shortcuts under it.
export function AiLine({
  placeholder, shortPlaceholder, chips = [], onSubmit, onChip, busy = false,
  label = 'Запрос для AI', icon = 'ai', initialText = '', keepText = false, className,
}: AiLineProps) {
  const id = useId(), [text, setText] = useState(initialText);
  const { input, text: example, compact } = useFittingPlaceholder(placeholder, shortPlaceholder);
  const value = cleanAiText(text), Icon = icon === 'search' ? Search : Sparkles;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!value || busy) return;
    onSubmit(value);
    if (!keepText) setText('');
  }

  return (
    <div className={'map-home-ai' + (className ? ' ' + className : '')}>
      {/* tabIndex -1: focus can be returned to the line from a script without opening the keyboard of a phone. */}
      <form className="map-home-ai-form" onSubmit={submit} aria-busy={busy} tabIndex={-1}>
        <label className="map-home-ai-label" htmlFor={id}>{label}</label>
        <Icon className="map-home-ai-icon" size={20} aria-hidden="true" />
        <input
          ref={input}
          id={id}
          className="map-home-ai-input"
          data-compact={compact ? 'true' : undefined}
          type="text"
          value={text}
          onChange={event => setText(event.target.value)}
          placeholder={example}
          maxLength={AI_LINE_MAX}
          autoComplete="off"
          enterKeyHint="send"
          readOnly={busy}
        />
        <button className="map-home-ai-send" type="submit" disabled={busy || !value} aria-label="Отправить">
          {busy ? <LoaderCircle className="map-home-spin" size={20} aria-hidden="true" /> : <ArrowUp size={20} aria-hidden="true" />}
        </button>
      </form>
      {chips.length > 0 && (
        <ul className="map-home-chips" aria-label="Быстрые действия">
          {chips.map(chip => (
            <li key={chip.id}>
              {chip.href && !onChip
                ? <a className="map-home-chip" href={chip.href} aria-label={chip.hint}>{chip.label}</a>
                : (
                  <button
                    className="map-home-chip"
                    type="button"
                    disabled={busy}
                    aria-pressed={chip.active}
                    aria-label={chip.hint}
                    onClick={() => onChip?.(chip)}
                  >
                    {chip.label}
                  </button>
                )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
