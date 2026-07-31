"use client";

import { Headphones, Mail } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SupportContactProps = {
  contact_email: string;
  contact_text: string;
};

export function SupportContact({ contact_email, contact_text }: SupportContactProps) {
  if (!contact_email && !contact_text) return null;

  return (
    <details className="group relative">
      <summary
        aria-label="售后联系"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "h-10 cursor-pointer list-none px-2 marker:hidden group-open:bg-sky-50 group-open:text-sky-700 [&::-webkit-details-marker]:hidden",
        )}
      >
        <Headphones className="h-4 w-4 shrink-0" />
        <span aria-hidden="true" className="hidden sm:inline">售后联系</span>
      </summary>

      <div className="fixed inset-x-4 top-14 z-50 mt-2 max-h-[calc(100dvh-4.5rem)] w-auto overflow-y-auto rounded-md border border-slate-200 bg-white p-4 text-left shadow-[0_18px_50px_rgba(15,23,42,0.16)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:w-[min(20rem,calc(100vw-2rem))]">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-sky-50 text-sky-700">
            <Headphones className="h-4 w-4" />
          </span>
          售后联系
        </div>
        {contact_text ? (
          <p className="mt-3 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">
            {contact_text}
          </p>
        ) : null}
        {contact_email ? (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-500">售后邮箱</div>
            <div className="mt-1 break-all text-sm font-medium text-slate-800">{contact_email}</div>
            <Button asChild size="sm" className="mt-3 w-full shadow-none">
              <a href={`mailto:${encodeURIComponent(contact_email)}`} aria-label={`发送邮件至 ${contact_email}`}>
                <Mail className="h-4 w-4" />
                发送邮件
              </a>
            </Button>
          </div>
        ) : (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            暂未配置售后邮箱，请按上方说明联系商家。
          </p>
        )}
      </div>
    </details>
  );
}
