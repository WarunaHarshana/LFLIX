export default function DiscoverDetailLoading() {
  return (
    <div className="min-h-screen bg-black text-white animate-pulse">
      <div className="h-[70vh] bg-neutral-900/80" />
      <div className="px-6 md:px-12 py-8 space-y-4">
        <div className="h-8 w-64 bg-neutral-800 rounded" />
        <div className="h-4 w-full max-w-3xl bg-neutral-900 rounded" />
        <div className="h-4 w-5/6 max-w-2xl bg-neutral-900 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="h-28 bg-neutral-900 rounded-2xl" />
          <div className="h-28 bg-neutral-900 rounded-2xl" />
          <div className="h-28 bg-neutral-900 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
