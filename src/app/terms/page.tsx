import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms | Body IQ" };

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-7">
    <h2 className="text-lg font-semibold">{title}</h2>
    <div className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-300">{children}</div>
  </section>
);

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <Link href="/login" className="text-sm text-zinc-400">
        &larr; Back
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Terms of service</h1>
      <p className="mt-2 text-sm text-zinc-400">Plain-language terms for using Body IQ, a free personal training, nutrition and recovery tracker. Using the app means you agree to them.</p>

      <Section title="Not medical advice">
        <p>
          Body IQ gives general fitness and nutrition guidance from simple rules and your own numbers: training plans, calorie and macro targets, readiness, and weight suggestions. It is not medical advice and does not replace a doctor, dietitian or coach. Check with a professional before changing your training or eating if you have a health condition, are injured, pregnant, or unsure. Stop if something hurts.
        </p>
      </Section>

      <Section title="Your account and your data">
        <p>You are responsible for what you enter and for keeping your sign-in safe. Guest sessions are temporary and are deleted when you leave them or after 24 hours. Add an email to keep your data. What is stored and who can see it is described on the <Link href="/privacy" className="text-emerald-400 underline">Privacy</Link> page.</p>
      </Section>

      <Section title="Third-party services">
        <p>Food search uses Open Food Facts data and Garmin sync uses a personal key you create with Garmin. Those services have their own terms, and their data can be incomplete or wrong. Check food labels and device numbers yourself.</p>
      </Section>

      <Section title="No guarantees">
        <p>Body IQ is provided as is, free, without warranties. It may have bugs, change, or be unavailable, and you can export your data at any time from Settings. To the extent the law allows, the people who make Body IQ are not liable for injury, loss of data or other harm from using it.</p>
      </Section>

      <Section title="Changes">
        <p>These terms may change as the app does. Continuing to use Body IQ after a change means you accept the new terms.</p>
      </Section>
    </main>
  );
}
