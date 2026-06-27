# Project Rules

## UI Components

- 全项目 UI 组件默认使用 shadcn/ui 体系，配置以 `components.json` 为准。
- 通用组件必须放在 `components/ui/*`，业务组件从 `@/components/ui/...` 引用，不要在业务文件里临时手写一套弹窗、按钮、卡片、表单控件。
- 新增 shadcn/ui 组件时，优先按 shadcn 文档/CLI 的结构引入；CLI 不可用时，也要按 shadcn 的 Radix primitive + Tailwind + `cn()` 模式落到 `components/ui`。
- 图标默认使用 `lucide-react`。
- 提示消息统一使用 shadcn 推荐的 Sonner：全局 `Toaster` 在 `app/layout.tsx` 挂载，业务侧使用 `toast.success/info/error`。不要使用浏览器原生 `alert()` / `confirm()`。
- `.eslintrc.json` 已启用 `no-alert`，新增代码不能再使用浏览器原生弹窗。
- 不要引入第二套 UI 组件库，除非用户明确要求。

## 样式
  - 优先使用tailwind风格

## Commands

- 改完代码后，不需要跑 `build` 或 `dev`，除非用户明确指定。
