"use client";
import { useT } from "@/i18n/provider";
import { LOCALE_LABELS, LOCALES, type Locale } from "@/i18n/messages";
import { Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function LocaleSwitcher() {
  const { locale, setLocale } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-800/70 hover:bg-slate-700/70 text-xs"
      >
        <Globe className="w-3.5 h-3.5" />
        <span className="uppercase">{locale}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-20 w-40 rounded-md border border-slate-700 bg-slate-900 shadow-xl">
          {LOCALES.map((l: Locale) => (
            <button
              key={l}
              onClick={() => {
                setLocale(l);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-800 ${
                l === locale ? "text-brand-300" : ""
              }`}
            >
              {LOCALE_LABELS[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
