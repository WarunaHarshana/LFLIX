'use client';

export function CardSkeleton() {
    return (
        <div className="aspect-[2/3] bg-[var(--surface-3)] rounded-lg overflow-hidden animate-pulse">
            <div className="w-full h-full bg-gradient-to-br from-[var(--surface-3)] to-[var(--surface-hover)]" />
        </div>
    );
}

export function CardGridSkeleton({ count = 8 }: { count?: number }) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
            {Array.from({ length: count }).map((_, i) => (
                <CardSkeleton key={i} />
            ))}
        </div>
    );
}

export function HeroSkeleton() {
    return (
        <div className="relative h-[80vh] w-full animate-pulse">
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--surface-2)] to-[var(--surface-3)]" />
            <div className="absolute bottom-0 left-0 p-12 pb-24 space-y-4 max-w-2xl">
                <div className="h-12 w-96 bg-[var(--border-default)] rounded-lg" />
                <div className="h-4 w-64 bg-[var(--border-default)] rounded" />
                <div className="h-20 w-full bg-[var(--border-default)] rounded" />
                <div className="flex gap-4 pt-2">
                    <div className="h-12 w-32 bg-[var(--border-default)] rounded" />
                    <div className="h-12 w-40 bg-[var(--border-strong)] rounded" />
                </div>
            </div>
        </div>
    );
}

export function ContinueWatchingSkeleton() {
    return (
        <section className="px-12 mb-10">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-5 h-5 bg-[var(--border-default)] rounded animate-pulse" />
                <div className="h-6 w-48 bg-[var(--border-default)] rounded animate-pulse" />
            </div>

            <div className="flex gap-4 overflow-hidden">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex-shrink-0 w-72 bg-[var(--surface-3)] rounded-xl overflow-hidden animate-pulse">
                        <div className="h-40 bg-[var(--border-default)]" />
                        <div className="p-4 space-y-2">
                            <div className="h-5 w-40 bg-[var(--border-default)] rounded" />
                            <div className="h-3 w-24 bg-[var(--border-default)] rounded" />
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
