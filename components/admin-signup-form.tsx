"use client";

import { useState, type FormEvent } from "react";
import { ShieldCheck, UserPlus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { postAdminCredentials } from "@/lib/admin-client-auth";

type AdminSignupFormProps = {
  initial_error?: string;
  setup_required: boolean;
};

export function AdminSignupForm({ initial_error, setup_required }: AdminSignupFormProps) {
  const [error, setError] = useState(initial_error ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setSubmitting(true);
    setError("");
    try {
      await postAdminCredentials("/api/admin/signup", {
        username: String(formData.get("username") ?? ""),
        display_name: String(formData.get("display_name") ?? ""),
        password: String(formData.get("password") ?? ""),
      });
      window.location.assign("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <label className="grid gap-2 text-sm font-semibold">
        用户名
        <div className="relative">
          <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="admin-input pl-9"
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="字母、数字或连字符"
            required
          />
        </div>
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        昵称
        <input className="admin-input" name="display_name" type="text" maxLength={80} placeholder="可留空" />
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        密码
        <input
          className="admin-input"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="请输入密码"
          required
        />
      </label>
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <Button className="bg-sky-600 shadow-none hover:bg-sky-700" disabled={submitting}>
        {setup_required ? <ShieldCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
        {submitting ? "提交中" : setup_required ? "创建并进入后台" : "注册"}
      </Button>
    </form>
  );
}
