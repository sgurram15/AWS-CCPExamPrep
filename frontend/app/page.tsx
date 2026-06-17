import Link from "next/link";

export default function Home() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-slate-900">
        Pass the AWS Cloud Practitioner exam
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
        Timed mock exams, untimed practice with full explanations, domain-focused study, and
        progress tracking — built around the CLF-C02 blueprint. Runs entirely in your browser; your
        progress is saved on this device.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/study" className="btn-primary px-6 py-3 text-base">
          Start studying
        </Link>
        <Link href="/dashboard" className="btn-secondary px-6 py-3 text-base">
          View dashboard
        </Link>
      </div>
    </div>
  );
}
