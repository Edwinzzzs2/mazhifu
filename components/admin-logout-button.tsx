"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { adminFetch, clearAdminAccessToken } from "@/lib/admin-client-auth";

type AdminLogoutButtonProps = {
  className: string;
  icon_only?: boolean;
};

export function AdminLogoutButton({ className, icon_only = false }: AdminLogoutButtonProps) {
  const [submitting, setSubmitting] = useState(false);

  async function handleLogout() {
    setSubmitting(true);
    try {
      await adminFetch("/api/admin/logout", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
    } finally {
      clearAdminAccessToken();
      window.location.assign("/admin/login");
    }
  }

  return (
    <button
      type="button"
      className={className}
      disabled={submitting}
      onClick={handleLogout}
      title="退出登录"
    >
      <LogOut className="h-4 w-4" />
      {icon_only ? null : submitting ? "退出中" : "退出登录"}
    </button>
  );
}
