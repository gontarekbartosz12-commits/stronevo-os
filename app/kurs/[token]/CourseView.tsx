'use client';

import { useState } from 'react';
import { Lesson } from '@/lib/types';

// Lekcje + postęp kursanta (zapis przez /api/kurs/progress, auth = token).
export default function CourseView({
  token,
  lessons,
  initialDone,
}: {
  token: string;
  lessons: Lesson[];
  initialDone: string[];
}) {
  const [done, setDone] = useState<Set<string>>(new Set(initialDone));
  const [open, setOpen] = useState<string | null>(lessons.find((l) => !initialDone.includes(l.id))?.id ?? lessons[0]?.id ?? null);
  const [busy, setBusy] = useState(false);

  const pct = lessons.length === 0 ? 0 : Math.round((done.size / lessons.length) * 100);

  async function toggleDone(lessonId: string, value: boolean) {
    setBusy(true);
    try {
      const res = await fetch('/api/kurs/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, lesson_id: lessonId, ukonczona: value }),
      });
      if (res.ok) {
        setDone((prev) => {
          const next = new Set(prev);
          if (value) next.add(lessonId);
          else next.delete(lessonId);
          return next;
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      {/* Pasek postępu */}
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-xs font-semibold text-stone-500">Twój postęp</p>
        <p className="text-xs font-bold text-stone-700">{pct}%{pct === 100 && ' 🎉'}</p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
        <div
          className="h-full rounded-full bg-[#9b2242] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-5 space-y-3">
        {lessons.map((lesson, i) => {
          const isDone = done.has(lesson.id);
          const isOpen = open === lesson.id;
          return (
            <div key={lesson.id} className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
              <button
                onClick={() => setOpen(isOpen ? null : lesson.id)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <span className="flex items-center gap-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isDone ? 'bg-emerald-500 text-white' : 'bg-stone-200 text-stone-600'
                    }`}
                  >
                    {isDone ? '✓' : i + 1}
                  </span>
                  <span className="font-semibold text-stone-800">{lesson.tytul}</span>
                </span>
                <span className="text-stone-400">{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen && (
                <div className="border-t border-stone-100 px-5 py-4">
                  {lesson.wideo_url && (
                    <p className="mb-3 text-sm">
                      <a href={lesson.wideo_url} target="_blank" className="text-[#9b2242] underline">
                        ▶ Obejrzyj wideo lekcji
                      </a>
                    </p>
                  )}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-600">
                    {lesson.tresc}
                  </p>
                  <button
                    onClick={() => toggleDone(lesson.id, !isDone)}
                    disabled={busy}
                    className={`mt-4 rounded-lg px-4 py-2 text-xs font-bold transition disabled:opacity-50 ${
                      isDone
                        ? 'border border-stone-300 text-stone-500 hover:bg-stone-50'
                        : 'bg-[#9b2242] text-white hover:opacity-90'
                    }`}
                  >
                    {isDone ? 'Cofnij ukończenie' : 'Oznacz jako ukończoną ✓'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
