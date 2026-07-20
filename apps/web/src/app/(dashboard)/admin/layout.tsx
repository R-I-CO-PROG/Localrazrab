import { AdminNav } from "@/components/admin/ui/admin-nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Full-screen "cockpit": a fixed overlay above the dashboard chrome (sidebar +
  // top header). The only way back to the app is the "В настройки" link in AdminNav.
  return (
    <div className="admin-shell fixed inset-0 z-50 flex flex-col overflow-y-auto">
      <AdminNav />
      <div className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6 lg:p-8">{children}</div>
    </div>
  );
}
