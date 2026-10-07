import { notFound } from 'next/navigation';
import CourseView from './CourseView';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { Contact, Course, CourseProgress, Enrollment, Lesson } from '@/lib/types';

// Widok kursanta /kurs/[token] (Faza 4) — panel klienta końcowego firmy.
// Dostęp: kapability token (po opłacie / nadany). Jasny motyw.
export const metadata = {
  title: 'Kurs — STRONEVO',
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = 'force-dynamic';

interface CourseData {
  enrollment: Enrollment;
  course: Course;
  lessons: Lesson[];
  progress: CourseProgress[];
  firma: string;
}

async function getCourseData(token: string): Promise<CourseData | null> {
  if (!isSupabaseConfigured()) {
    const enrollment = demoStore.getEnrollmentByToken(token);
    if (!enrollment || enrollment.status !== 'aktywny') return null;
    const course = demoStore.getCourse(enrollment.course_id);
    if (!course) return null;
    const c = course.contact_id ? demoStore.getContact(course.contact_id) : null;
    return {
      enrollment,
      course,
      lessons: demoStore.listLessons(course.id),
      progress: demoStore.listCourseProgress(enrollment.id),
      firma: c?.firma ?? c?.imie ?? 'STRONEVO',
    };
  }

  const supabase = isAdminConfigured() ? createAdminClient() : await createClient();
  const { data: enr } = await supabase.from('enrollments').select('*').eq('token', token).maybeSingle();
  const enrollment = enr as Enrollment | null;
  if (!enrollment || enrollment.status !== 'aktywny') return null;
  const [{ data: course }, { data: lessons }, { data: progress }] = await Promise.all([
    supabase.from('courses').select('*').eq('id', enrollment.course_id).maybeSingle(),
    supabase.from('lessons').select('*').eq('course_id', enrollment.course_id).order('kolejnosc'),
    supabase.from('course_progress').select('*').eq('enrollment_id', enrollment.id),
  ]);
  if (!course) return null;
  let firma = 'STRONEVO';
  if ((course as Course).contact_id) {
    const { data: c } = await supabase
      .from('contacts')
      .select('firma, imie')
      .eq('id', (course as Course).contact_id!)
      .maybeSingle();
    firma = (c as Contact | null)?.firma ?? firma;
  }
  return {
    enrollment,
    course: course as Course,
    lessons: (lessons ?? []) as Lesson[],
    progress: (progress ?? []) as CourseProgress[],
    firma,
  };
}

export default async function KursPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getCourseData(token);
  if (!data) notFound();

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-10 font-sans">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
          Kurs online · {data.firma}
        </p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-stone-900">{data.course.tytul}</h1>
        {data.course.opis && <p className="mt-2 text-sm text-stone-600">{data.course.opis}</p>}
        {data.enrollment.external?.imie && (
          <p className="mt-1 text-xs text-stone-400">Kursant: {data.enrollment.external.imie}</p>
        )}

        <CourseView
          token={token}
          lessons={data.lessons}
          initialDone={data.progress.filter((p) => p.ukonczona).map((p) => p.lesson_id)}
        />

        <p className="mt-8 text-center text-[11px] text-stone-400">
          Platforma kursowa: STRONEVO · link jest osobisty
        </p>
      </div>
    </main>
  );
}
