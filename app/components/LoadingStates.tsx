'use client';

export function CardSkeleton() {
    return (
        <div className="aspect-[2/3] liquid-glass-base rounded-2xl border border-white/10 overflow-hidden relative shadow-lg">
            <div className="w-full h-full bg-gradient-to-br from-white/[0.03] via-white/[0.08] to-white/[0.02] animate-pulse" />
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
        <div className="relative h-[80vh] min-h-[500px] w-full liquid-glass-base overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/40 to-transparent" />
            <div className="absolute bottom-0 left-0 p-8 sm:p-12 pb-24 space-y-4 max-w-2xl">
                <div className="h-12 w-80 rounded-2xl liquid-glass-pill bg-white/10 animate-pulse" />
                <div className="h-4 w-48 rounded-lg bg-white/5 animate-pulse" />
                <div className="h-16 w-full rounded-xl bg-white/5 animate-pulse" />
                <div className="flex gap-4 pt-2">
                    <div className="h-12 w-32 rounded-xl liquid-glass-pill bg-white/15 animate-pulse" />
                    <div className="h-12 w-36 rounded-xl liquid-glass-pill bg-white/10 animate-pulse" />
                </div>
            </div>
        </div>
    );
}

export function ContinueWatchingSkeleton() {
    return (
        <section className="px-4 sm:px-12 mb-10">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-5 h-5 rounded-md bg-white/10 animate-pulse" />
                <div className="h-6 w-48 rounded-lg bg-white/10 animate-pulse" />
            </div>

            <div className="flex gap-4 overflow-hidden">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex-shrink-0 w-72 rounded-2xl liquid-glass-base border border-white/10 overflow-hidden shadow-lg">
                        <div className="h-40 bg-white/[0.04] animate-pulse" />
                        <div className="p-4 space-y-2.5">
                            <div className="h-5 w-44 rounded-md bg-white/10 animate-pulse" />
                            <div className="h-3 w-28 rounded-md bg-white/5 animate-pulse" />
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

