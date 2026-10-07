import Sidebar from '@/components/ui/Sidebar';
import Topbar from '@/components/ui/Topbar';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  let userEmail: string | null = null;

  if (configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userEmail = user?.email ?? null;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar userEmail={userEmail} demoMode={!configured} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-w-0 flex-1 px-6 py-6 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
