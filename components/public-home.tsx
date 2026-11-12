'use client';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { SmartGuestMap } from './smart-guest-map';
import type { SearchLink } from './public-search-intro';
import { bookingEntryPath } from '../lib/entry';
import '../app/chat.css';
import '../app/warm-theme.css';
import './public-map.css';

type Row = Record<string, any>;

const TITLE = 'Жильё на сутки или на несколько часов';
const JOIN_LINKS: SearchLink[] = [
  { href: '/join/owner', label: 'Сдавать жильё' },
  { href: '/join/cleaner', label: 'Работать на уборках' },
];
const LEGAL_LINKS: SearchLink[] = [
  { href: '/privacy', label: 'Приватность' },
  { href: '/terms', label: 'Условия' },
  { href: '/data-deletion', label: 'Удаление данных' },
];

// The page a visitor sees before signing in: the same map and request sheet as the guest's first screen.
export default function PublicHome() {
  const [access, setAccess] = useState<Row | null>(null);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    fetch('/api/access', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(value => {
        if (live) setAccess(value as Row | null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // A chosen flat leads to its booking form: through sign-in for a visitor, straight there for an account.
  async function choose(property: Row, filters: Row) {
    if (entering) return;
    const next = bookingEntryPath(property.id, filters);
    if (!access?.user) {
      window.location.assign('/signin?next=' + encodeURIComponent(next));
      return;
    }
    setEntering(true);
    setError('');
    try {
      if (!JSON.parse(access.profile?.roles || '[]').includes('guest')) {
        const response = await fetch('/api/onboarding/guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city: filters.city || property.city }),
        });
        if (!response.ok) throw Error('Не удалось открыть профиль гостя. Попробуйте войти снова.');
      }
      window.location.assign(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось перейти к бронированию.');
      setEntering(false);
    }
  }

  const signedIn = !!access?.user;
  // The two "work with us" links are in the header of a wide screen; a phone has them only in the opened sheet.
  const links: SearchLink[] = [
    ...(access?.platformAdmin ? [{ href: '/admin', label: 'Управление сервисом' }] : []),
    ...JOIN_LINKS.map(link => ({ ...link, phoneOnly: true })),
    ...LEGAL_LINKS,
  ];

  return (
    <div className="chat-app workspace-shell public-map-shell smart-public" data-section="map">
      <header className="public-top">
        <a className="public-top-brand" href="/" aria-label="AI Аренда — главная">
          <img src="/brand-mark.png" width={28} height={28} alt="" />
          <span>AI Аренда</span>
        </a>
        <nav className="public-top-nav" aria-label="Вход и разделы сервиса">
          {JOIN_LINKS.map(link => <a key={link.href} className="public-top-link" href={link.href}>{link.label}</a>)}
          <a className="public-top-enter" href={signedIn ? '/workspace/guest/map' : '/signin'}>{signedIn ? 'Мой аккаунт' : 'Войти'}</a>
        </nav>
      </header>
      <main className="public-map-main">
        <SmartGuestMap publicMode accountId="public" title={TITLE} links={links} onChoose={choose} />
      </main>
      {(error || entering) && (
        <div className="public-map-entry-status" role={error ? 'alert' : 'status'}>
          {error || 'Переходим к бронированию…'}
          {error && (
            <button type="button" onClick={() => setError('')} aria-label="Закрыть сообщение">
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
