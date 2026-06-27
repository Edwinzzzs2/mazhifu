"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  Globe2,
  Image as ImageIcon,
  ListChecks,
  Mail,
  Megaphone,
  Save,
  Search,
  Settings2,
  ShoppingBag,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SiteSettings } from "@/lib/site-settings";

type AdminSiteSettingsProps = {
  initial_settings: SiteSettings;
};

type TextField = Exclude<keyof SiteSettings, "notice_items">;

function noticesToText(items: string[]) {
  return items.join("\n");
}

function toPayload(settings: SiteSettings, noticeText: string): SiteSettings {
  return {
    ...settings,
    notice_items: noticeText
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

export function AdminSiteSettings({ initial_settings }: AdminSiteSettingsProps) {
  const [settings, setSettings] = useState(initial_settings);
  const [noticeText, setNoticeText] = useState(noticesToText(initial_settings.notice_items));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const previewNotices = useMemo(
    () => toPayload(settings, noticeText).notice_items,
    [noticeText, settings],
  );

  function updateField(field: TextField, value: string) {
    setSettings((current) => ({ ...current, [field]: value }));
  }

  async function saveSettings() {
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(settings, noticeText)),
      });
      const data = (await response.json()) as {
        settings?: SiteSettings;
        message?: string;
      };

      if (!response.ok || !data.settings) {
        setMessage(data.message ?? "保存失败，请稍后重试");
        return;
      }

      setSettings(data.settings);
      setNoticeText(noticesToText(data.settings.notice_items));
      setMessage("站点设置已保存");
    } catch {
      setMessage("网络错误，保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="admin-panel min-w-0">
        <div className="flex flex-col gap-3 border-b border-sky-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-bold text-sky-600">
              <Settings2 className="h-4 w-4" />
              基本信息
            </div>
            <h2 className="mt-1 truncate text-lg font-bold sm:text-xl">{settings.site_name || "未命名站点"}</h2>
          </div>
          <Button onClick={saveSettings} disabled={saving} className="w-full bg-emerald-500 shadow-none hover:bg-emerald-600 sm:w-auto">
            <Save className="h-4 w-4" />
            {saving ? "保存中" : "保存设置"}
          </Button>
        </div>

        <div className="grid gap-5 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <AdminField label="站点名称" icon={<Store className="h-4 w-4" />}>
              <input
                className="admin-input"
                value={settings.site_name}
                maxLength={80}
                onChange={(event) => updateField("site_name", event.target.value)}
              />
            </AdminField>
            <AdminField label="支付站点名" icon={<ShoppingBag className="h-4 w-4" />}>
              <input
                className="admin-input"
                value={settings.mapay_sitename}
                maxLength={80}
                placeholder="留空则使用站点名称"
                onChange={(event) => updateField("mapay_sitename", event.target.value)}
              />
            </AdminField>
          </div>

          <AdminField label="站点描述" icon={<Megaphone className="h-4 w-4" />}>
            <textarea
              className="admin-input min-h-24 resize-y"
              value={settings.site_description}
              maxLength={220}
              onChange={(event) => updateField("site_description", event.target.value)}
            />
          </AdminField>

          <div className="grid gap-4 md:grid-cols-2">
            <AdminField label="Logo 图片 URL" icon={<ImageIcon className="h-4 w-4" />}>
              <input
                className="admin-input"
                value={settings.site_logo_url}
                placeholder="/logo.png 或 https://..."
                onChange={(event) => updateField("site_logo_url", event.target.value)}
              />
            </AdminField>
            <AdminField label="浏览器图标 URL" icon={<Globe2 className="h-4 w-4" />}>
              <input
                className="admin-input"
                value={settings.site_icon_url}
                placeholder="/favicon.ico 或 https://..."
                onChange={(event) => updateField("site_icon_url", event.target.value)}
              />
            </AdminField>
          </div>

          <AdminField label="首页公告" icon={<Megaphone className="h-4 w-4" />}>
            <textarea
              className="admin-input min-h-20 resize-y"
              value={settings.announcement}
              maxLength={300}
              placeholder="留空则不显示公告"
              onChange={(event) => updateField("announcement", event.target.value)}
            />
          </AdminField>

          <div className="grid gap-4 md:grid-cols-2">
            <AdminField label="客服邮箱" icon={<Mail className="h-4 w-4" />}>
              <input
                className="admin-input"
                value={settings.contact_email}
                maxLength={120}
                onChange={(event) => updateField("contact_email", event.target.value)}
              />
            </AdminField>
            <AdminField label="SEO 标题" icon={<Search className="h-4 w-4" />}>
              <input
                className="admin-input"
                value={settings.seo_title}
                maxLength={100}
                placeholder="留空则使用站点名称"
                onChange={(event) => updateField("seo_title", event.target.value)}
              />
            </AdminField>
          </div>

          <AdminField label="客服说明" icon={<Mail className="h-4 w-4" />}>
            <textarea
              className="admin-input min-h-20 resize-y"
              value={settings.contact_text}
              maxLength={300}
              onChange={(event) => updateField("contact_text", event.target.value)}
            />
          </AdminField>

          <AdminField label="SEO 关键词" icon={<Search className="h-4 w-4" />}>
            <input
              className="admin-input"
              value={settings.seo_keywords}
              maxLength={180}
              placeholder="多个关键词用逗号分隔"
              onChange={(event) => updateField("seo_keywords", event.target.value)}
            />
          </AdminField>

          <AdminField label="购买须知（每行一条）" icon={<ListChecks className="h-4 w-4" />}>
            <textarea
              className="admin-input min-h-36 resize-y"
              value={noticeText}
              onChange={(event) => setNoticeText(event.target.value)}
            />
          </AdminField>
        </div>
      </section>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <div className="admin-panel p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Store className="h-4 w-4 text-sky-500" />
            前台品牌预览
          </div>
          <div className="rounded-md border border-sky-100 bg-sky-50 p-4">
            <div className="flex items-center gap-2 font-bold">
              <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-md bg-sky-500 text-white">
                {settings.site_logo_url ? (
                  <img src={settings.site_logo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ShoppingBag className="h-5 w-5" />
                )}
              </span>
              <span className="text-xl">{settings.site_name || "站点名称"}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{settings.site_description}</p>
            {settings.announcement ? (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {settings.announcement}
              </div>
            ) : null}
          </div>
        </div>

        <div className="admin-panel p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold">
            <ListChecks className="h-4 w-4 text-sky-500" />
            购买须知预览
          </div>
          <div className="grid gap-2">
            {previewNotices.map((notice, index) => (
              <div key={`${notice}-${index}`} className="flex gap-3 rounded-md border border-sky-100 bg-sky-50 p-3 text-sm leading-6">
                <span className="font-bold text-sky-500">0{index + 1}</span>
                <span>{notice}</span>
              </div>
            ))}
          </div>
        </div>

        {message ? (
          <div className="rounded-md border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700">
            {message}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function AdminField({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      <span className="flex items-center gap-2 text-slate-700">
        <span className="text-sky-500">{icon}</span>
        {label}
      </span>
      {children}
    </label>
  );
}
