import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';

// POST /api/kurs/progress — postęp kursanta (Faza 4). Publiczne;
// autoryzacja = token zapisu (kapability, jak /kurs/[token]).
// Body: { token, lesson_id, ukonczona }

export async function POST(request: NextRequest) {
  let body: { token?: string; lesson_id?: string; ukonczona?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body musi być JSON-em' }, { status: 400 });
  }
  if (!body.token || !body.lesson_id) {
    return NextResponse.json({ error: 'Podaj token i lesson_id' }, { status: 400 });
  }
  const ukonczona = body.ukonczona !== false;

  try {
    if (!isSupabaseConfigured()) {
      const enrollment = demoStore.getEnrollmentByToken(body.token);
      if (!enrollment || enrollment.status !== 'aktywny') {
        return NextResponse.json({ error: 'Brak dostępu' }, { status: 404 });
      }
      const lesson = demoStore
        .listLessons(enrollment.course_id)
        .find((l) => l.id === body.lesson_id);
      if (!lesson) return NextResponse.json({ error: 'Lekcja nie istnieje' }, { status: 404 });
      demoStore.upsertCourseProgress(enrollment.id, lesson.id, ukonczona);
      return NextResponse.json({ ok: true });
    }

    if (!isAdminConfigured()) {
      return NextResponse.json({ error: 'Brak service role' }, { status: 503 });
    }
    const supabase = createAdminClient();
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('*')
      .eq('token', body.token)
      .eq('status', 'aktywny')
      .maybeSingle();
    if (!enrollment) return NextResponse.json({ error: 'Brak dostępu' }, { status: 404 });
    const { data: lesson } = await supabase
      .from('lessons')
      .select('id')
      .eq('id', body.lesson_id)
      .eq('course_id', enrollment.course_id)
      .maybeSingle();
    if (!lesson) return NextResponse.json({ error: 'Lekcja nie istnieje' }, { status: 404 });
    await supabase.from('course_progress').upsert(
      {
        enrollment_id: enrollment.id,
        lesson_id: lesson.id,
        ukonczona,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'enrollment_id,lesson_id' }
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd zapisu postępu' },
      { status: 500 }
    );
  }
}
