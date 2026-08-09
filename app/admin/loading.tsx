import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="admin-shell page-shell flex">
      <aside className="hidden lg:flex lg:h-dvh lg:w-56 lg:shrink-0 lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white">
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-4">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <div className="grid gap-2 p-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-md" />
          ))}
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-3 py-3 pb-24 sm:px-4 sm:py-4 lg:px-5 lg:py-5 xl:px-6">
        <div className="mx-auto w-full max-w-[1720px]">
          <div className="mb-4 flex h-10 items-center gap-2.5">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div className="grid gap-1.5">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="hidden h-3 w-52 sm:block" />
            </div>
          </div>
          <section className="admin-panel overflow-hidden">
            <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="grid gap-3 p-4 sm:p-5">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-md" />
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
