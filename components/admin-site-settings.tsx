"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  Globe2,
  Image as ImageIcon,
  KeyRound,
  ListChecks,
  Lock,
  Mail,
  Megaphone,
  Save,
  Search,
  Settings2,
  ShoppingBag,
  Store,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminFetch } from "@/lib/admin-client-auth";
import type { AdminUser, AdminUserRole, InstanceGeneralSettings } from "@/lib/admin-auth";
import type { SiteSettings } from "@/lib/site-settings";

type AdminSiteSettingsProps = {
  initial_settings: SiteSettings;
  initial_general_settings: InstanceGeneralSettings;
  initial_users: AdminUser[];
};

type TextField = Exclude<keyof SiteSettings, "notice_items">;
type UserDraft = {
  username: string;
  display_name: string;
  password: string;
};

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

function toUserDrafts(users: AdminUser[]) {
  const drafts: Record<number, UserDraft> = {};
  users.forEach((user) => {
    drafts[user.id] = {
      username: user.username,
      display_name: user.display_name,
      password: "",
    };
  });
  return drafts;
}

export function AdminSiteSettings({
  initial_settings,
  initial_general_settings,
  initial_users,
}: AdminSiteSettingsProps) {
  const [settings, setSettings] = useState(initial_settings);
  const [generalSettings, setGeneralSettings] = useState(initial_general_settings);
  const [users, setUsers] = useState(initial_users);
  const [userDrafts, setUserDrafts] = useState(() => toUserDrafts(initial_users));
  const [userForm, setUserForm] = useState<{
    username: string;
    display_name: string;
    password: string;
    role: AdminUserRole;
  }>({
    username: "",
    display_name: "",
    password: "",
    role: "USER",
  });
  const [noticeText, setNoticeText] = useState(noticesToText(initial_settings.notice_items));
  const [saving, setSaving] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [message, setMessage] = useState("");

  const previewNotices = useMemo(
    () => toPayload(settings, noticeText).notice_items,
    [noticeText, settings],
  );

  function updateField(field: TextField, value: string) {
    setSettings((current) => ({ ...current, [field]: value }));
  }

  function updateGeneralSetting(field: keyof InstanceGeneralSettings, value: boolean) {
    setGeneralSettings((current) => ({ ...current, [field]: value }));
  }

  function updateUserForm(field: keyof typeof userForm, value: string) {
    setUserForm((current) => {
      if (field === "role") {
        return { ...current, role: value === "ADMIN" ? "ADMIN" : "USER" };
      }
      return { ...current, [field]: value };
    });
  }

  function updateUserDraft(userId: number, field: keyof UserDraft, value: string) {
    setUserDrafts((current) => ({
      ...current,
      [userId]: {
        ...(current[userId] ?? { username: "", display_name: "", password: "" }),
        [field]: value,
      },
    }));
  }

  async function saveSettings() {
    setSaving(true);
    setMessage("");

    try {
      const response = await adminFetch("/api/admin/settings", {
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

  async function saveAccessSettings() {
    setSavingAccess(true);
    setMessage("");

    try {
      const response = await adminFetch("/api/admin/access-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(generalSettings),
      });
      const data = (await response.json()) as {
        settings?: InstanceGeneralSettings;
        message?: string;
      };

      if (!response.ok || !data.settings) {
        setMessage(data.message ?? "保存访问设置失败");
        return;
      }

      setGeneralSettings(data.settings);
      setMessage("访问设置已保存");
    } catch {
      setMessage("网络错误，访问设置保存失败");
    } finally {
      setSavingAccess(false);
    }
  }

  async function createUser() {
    if (!userForm.username || !userForm.password) {
      setMessage("用户名和密码不能为空");
      return;
    }

    setCreatingUser(true);
    setMessage("");

    try {
      const response = await adminFetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userForm),
      });
      const data = (await response.json()) as {
        user?: AdminUser;
        message?: string;
      };

      if (!response.ok || !data.user) {
        setMessage(data.message ?? "创建用户失败");
        return;
      }

      const createdUser = data.user;
      setUsers((current) => [...current, createdUser]);
      setUserDrafts((current) => ({
        ...current,
        [createdUser.id]: {
          username: createdUser.username,
          display_name: createdUser.display_name,
          password: "",
        },
      }));
      setUserForm({ username: "", display_name: "", password: "", role: "USER" });
      setMessage("用户已创建");
    } catch {
      setMessage("网络错误，创建用户失败");
    } finally {
      setCreatingUser(false);
    }
  }

  async function updateUser(userId: number, payload: Partial<AdminUser> & { password?: string }) {
    setMessage("");

    try {
      const response = await adminFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        user?: AdminUser;
        message?: string;
      };

      if (!response.ok || !data.user) {
        setMessage(data.message ?? "更新用户失败");
        return;
      }

      const updatedUser = data.user;
      setUsers((current) => current.map((user) => (user.id === userId ? updatedUser : user)));
      if ("username" in payload || "display_name" in payload || "password" in payload) {
        setUserDrafts((current) => ({
          ...current,
          [updatedUser.id]: {
            username: updatedUser.username,
            display_name: updatedUser.display_name,
            password: "",
          },
        }));
      }
      setMessage("用户已更新");
    } catch {
      setMessage("网络错误，更新用户失败");
    }
  }

  async function saveUserDraft(user: AdminUser) {
    const draft = userDrafts[user.id];
    if (!draft) {
      return;
    }

    await updateUser(user.id, {
      username: draft.username,
      display_name: draft.display_name,
      password: draft.password || undefined,
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid min-w-0 gap-5">
        <section className="admin-panel min-w-0">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-bold text-sky-600">
                <Lock className="h-4 w-4" />
                访问控制
              </div>
              <h2 className="mt-1 truncate text-lg font-bold sm:text-xl">登录与注册</h2>
            </div>
            <Button onClick={saveAccessSettings} disabled={savingAccess} className="w-full bg-sky-600 shadow-none hover:bg-sky-700 sm:w-auto">
              <Save className="h-4 w-4" />
              {savingAccess ? "保存中" : "保存访问设置"}
            </Button>
          </div>
          <div className="grid gap-3 p-5">
            <AdminToggle
              label="禁止用户注册"
              description="开启后，首次管理员之外的公开注册会被后端拒绝。"
              checked={generalSettings.disallow_user_registration}
              onChange={(checked) => updateGeneralSetting("disallow_user_registration", checked)}
            />
            <AdminToggle
              label="禁止普通用户密码登录"
              description="开启后，普通 USER 账号不能使用密码登录；ADMIN 账号仍可进入后台。"
              checked={generalSettings.disallow_password_auth}
              onChange={(checked) => updateGeneralSetting("disallow_password_auth", checked)}
            />
            <AdminToggle
              label="禁止修改用户名"
              description="开启后，用户更新接口会拒绝 username 修改。"
              checked={generalSettings.disallow_change_username}
              onChange={(checked) => updateGeneralSetting("disallow_change_username", checked)}
            />
          </div>
        </section>

        <section className="admin-panel min-w-0">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-bold text-sky-600">
              <Users className="h-4 w-4" />
              账号管理
            </div>
            <h2 className="mt-1 truncate text-lg font-bold sm:text-xl">后台用户</h2>
          </div>
          <div className="grid gap-5 p-5">
            <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_1fr_1fr_140px_auto] md:items-end">
              <AdminField label="用户名" icon={<UserPlus className="h-4 w-4" />}>
                <input
                  className="admin-input bg-white"
                  value={userForm.username}
                  onChange={(event) => updateUserForm("username", event.target.value)}
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="如 admin"
                />
              </AdminField>
              <AdminField label="昵称" icon={<Users className="h-4 w-4" />}>
                <input
                  className="admin-input bg-white"
                  value={userForm.display_name}
                  onChange={(event) => updateUserForm("display_name", event.target.value)}
                  placeholder="可留空"
                />
              </AdminField>
              <AdminField label="密码" icon={<KeyRound className="h-4 w-4" />}>
                <input
                  className="admin-input bg-white"
                  type="password"
                  minLength={8}
                  maxLength={128}
                  value={userForm.password}
                  onChange={(event) => updateUserForm("password", event.target.value)}
                  placeholder="新用户密码"
                />
              </AdminField>
              <AdminField label="角色" icon={<Lock className="h-4 w-4" />}>
                <select
                  className="admin-input bg-white"
                  value={userForm.role}
                  onChange={(event) => updateUserForm("role", event.target.value)}
                >
                  <option value="USER">普通用户</option>
                  <option value="ADMIN">管理员</option>
                </select>
              </AdminField>
              <Button type="button" onClick={createUser} disabled={creatingUser} className="bg-emerald-600 shadow-none hover:bg-emerald-700">
                <UserPlus className="h-4 w-4" />
                {creatingUser ? "创建中" : "创建用户"}
              </Button>
            </div>

            <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
              {users.map((user) => {
                const draft = userDrafts[user.id] ?? {
                  username: user.username,
                  display_name: user.display_name,
                  password: "",
                };

                return (
                  <div key={user.id} className="grid gap-3 border-b border-slate-100 p-4 text-sm last:border-b-0 lg:grid-cols-[1.1fr_1fr_1fr_96px_96px_96px] lg:items-end">
                    <label className="grid min-w-0 gap-1 text-xs font-bold text-slate-500">
                      用户名
                      <input
                        className="admin-input bg-white"
                        value={draft.username}
                        disabled={generalSettings.disallow_change_username}
                        onChange={(event) => updateUserDraft(user.id, "username", event.target.value)}
                      />
                      <span className="truncate font-medium text-slate-400">ID {user.id}</span>
                    </label>
                    <label className="grid min-w-0 gap-1 text-xs font-bold text-slate-500">
                      昵称
                      <input
                        className="admin-input bg-white"
                        value={draft.display_name}
                        onChange={(event) => updateUserDraft(user.id, "display_name", event.target.value)}
                      />
                    </label>
                    <label className="grid min-w-0 gap-1 text-xs font-bold text-slate-500">
                      重置密码
                      <input
                        className="admin-input bg-white"
                        type="password"
                        minLength={8}
                        maxLength={128}
                        value={draft.password}
                        placeholder="留空不修改"
                        onChange={(event) => updateUserDraft(user.id, "password", event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="h-10 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-sky-50 hover:text-sky-700"
                      onClick={() => updateUser(user.id, { role: user.role === "ADMIN" ? "USER" : "ADMIN" })}
                    >
                      {user.role === "ADMIN" ? "管理员" : "普通用户"}
                    </button>
                    <button
                      type="button"
                      className="h-10 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-sky-50 hover:text-sky-700"
                      onClick={() => updateUser(user.id, { row_status: user.row_status === "NORMAL" ? "ARCHIVED" : "NORMAL" })}
                    >
                      {user.row_status === "NORMAL" ? "正常" : "已停用"}
                    </button>
                    <Button type="button" onClick={() => saveUserDraft(user)} className="h-10 bg-sky-600 shadow-none hover:bg-sky-700">
                      <Save className="h-4 w-4" />
                      保存
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="admin-panel min-w-0">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-bold text-sky-600">
                <Settings2 className="h-4 w-4" />
                基本信息
              </div>
              <h2 className="mt-1 truncate text-lg font-bold sm:text-xl">{settings.site_name || "未命名站点"}</h2>
            </div>
            <Button onClick={saveSettings} disabled={saving} className="w-full bg-emerald-600 shadow-none hover:bg-emerald-700 sm:w-auto">
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
      </div>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <div className="admin-panel p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Store className="h-4 w-4 text-sky-500" />
            前台品牌预览
          </div>
          <div className="admin-panel-muted p-4">
            <div className="flex items-center gap-2 font-bold">
              <span className="brand-mark h-10 w-10">
                {settings.site_logo_url ? (
                  <img src={settings.site_logo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ShoppingBag className="h-5 w-5" />
                )}
              </span>
              <span className="min-w-0 truncate text-xl text-slate-950">{settings.site_name || "站点名称"}</span>
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
              <div key={`${notice}-${index}`} className="flex gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm leading-6 shadow-sm">
                <span className="font-bold text-sky-600">0{index + 1}</span>
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

function AdminToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-md border border-slate-200 bg-white p-4">
      <span className="min-w-0">
        <span className="block text-sm font-bold text-slate-800">{label}</span>
        <span className="mt-1 block text-sm leading-6 text-slate-500">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-sky-600"
      />
    </label>
  );
}
