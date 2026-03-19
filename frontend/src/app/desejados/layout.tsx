"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";

export default function DesejadosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="flex min-h-screen bg-[var(--color-bg-main)]">
      <Sidebar isCollapsed={isCollapsed} onToggle={() => setIsCollapsed(!isCollapsed)} />
      <main className="flex-1 p-8 overflow-auto transition-all duration-300">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
