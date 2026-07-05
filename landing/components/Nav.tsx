'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Menu, X } from 'lucide-react';
import { Wordmark } from './LogoMark';
import { DOCS_URL, GITHUB_URL, LOGIN_URL, NAV_LINKS, SIGNUP_URL } from '@/lib/site';

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {/* Announcement bar */}
      <div className="bg-ink text-cream-100">
        <div className="shell flex h-9 items-center justify-center gap-3 text-[12px]">
          <span className="truncate">
            hyperspace is open source, built at the WeMakeDevs hackathon
          </span>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden shrink-0 items-center gap-1 rounded-full border border-ink-600 bg-ink-700 px-2.5 py-0.5 text-[11px] font-semibold text-cream-50 transition hover:bg-ink-600 sm:inline-flex"
          >
            Star on GitHub
            <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Main nav */}
      <div
        className={`border-b bg-white transition-colors duration-300 ${
          scrolled ? 'border-cream-200' : 'border-transparent'
        }`}
      >
        <nav className="shell flex h-16 items-center justify-between" aria-label="Main">
          <a href="/" className="text-ink" aria-label="hyperspace home">
            <Wordmark />
          </a>

          {/* Desktop links */}
          <div className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-md px-3.5 py-2 text-sm text-ink-500 transition hover:bg-cream-100 hover:text-ink"
              >
                {link.label}
              </a>
            ))}
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md px-3.5 py-2 text-sm text-ink-500 transition hover:bg-cream-100 hover:text-ink"
            >
              Docs
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <a
              href={LOGIN_URL}
              className="text-sm font-medium text-ink-600 transition hover:text-ink"
            >
              Log in
            </a>
            <a href={SIGNUP_URL} className="btn-bump-dark !py-2">
              Get Started
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          {/* Mobile toggle */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink transition hover:bg-cream-100 md:hidden"
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>

        {/* Mobile menu */}
        {open && (
          <div className="border-t border-cream-200 bg-white md:hidden">
            <div className="shell flex flex-col gap-1 py-4">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-3 font-display text-lg text-ink transition hover:bg-cream-100"
                >
                  {link.label}
                </a>
              ))}
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-3 font-display text-lg text-ink transition hover:bg-cream-100"
              >
                Docs <ArrowUpRight className="h-4 w-4" />
              </a>
              <div className="mt-3 flex flex-col gap-3 border-t border-cream-200 pt-4">
                <a href={LOGIN_URL} className="btn-bump-accent w-full">
                  Log in
                </a>
                <a href={SIGNUP_URL} className="btn-bump-gold w-full">
                  Get Started
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
