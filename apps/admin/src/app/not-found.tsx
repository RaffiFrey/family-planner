import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <Link href="/" className="text-sm text-primary hover:underline">
        Back to dashboard
      </Link>
    </main>
  );
}
