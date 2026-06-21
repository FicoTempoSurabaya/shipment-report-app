import Link from "next/link";
import { Truck } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 text-[var(--steel)]">
      <section className="ind-panel w-full max-w-2xl p-6 sm:p-8">
        <div className="ind-badge-cyan mb-6">
          <Truck className="h-4 w-4" />
          Shipment Report App
        </div>

        <div className="ind-divider-accent mb-5" />
        <h1 className="ind-heading text-3xl sm:text-5xl">
          Panel laporan shipment harian.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--muted)] sm:text-base sm:leading-7">
          Masuk sebagai regular, admin, atau superadmin. Freelance tetap memakai form
          publik tanpa login.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link className="ind-btn-primary" href="/login">
            Login Dashboard
          </Link>
          <Link className="ind-btn-secondary" href="/freelance">
            Input Freelance
          </Link>
        </div>
      </section>
    </main>
  );
}
