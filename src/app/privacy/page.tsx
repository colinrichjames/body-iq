import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy | Body IQ" };

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-7">
    <h2 className="text-lg font-semibold">{title}</h2>
    <div className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-300">{children}</div>
  </section>
);

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <Link href="/login" className="text-sm text-zinc-400">
        &larr; Back
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-zinc-400">Body IQ is a personal training, nutrition and recovery tracker. This page says what it stores, who can see it, and what leaves the app.</p>

      <Section title="What Body IQ stores">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your email address (for sign-in), or nothing if you use a guest session.</li>
          <li>Body scans: weight, body fat, muscle and fat mass.</li>
          <li>Races, training plans, workouts and every set, rep, weight, RPE, distance and heart rate you log.</li>
          <li>Food you log and your calorie and macro targets.</li>
          <li>If you connect Garmin: your activities, sleep, HRV, Body Battery, resting heart rate, stress and steps.</li>
          <li>Settings such as your unit preference and your time zone.</li>
        </ul>
      </Section>

      <Section title="Where it lives and who can see it">
        <p>
          Your data is in a Supabase database. Access rules (row-level security) let your signed-in account read and change only your own rows. The app is hosted on Vercel. Body IQ has no ads, no
          analytics trackers and doesn&apos;t sell or share your data.
        </p>
        <p>The person who runs this Body IQ project can technically open the database, as with any app. Nothing is end-to-end encrypted, so don&apos;t store anything here you wouldn&apos;t want a database administrator to be able to see.</p>
      </Section>

      <Section title="What leaves the app">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="text-zinc-100">Food search and barcodes:</span> the text you search or the barcode you scan is sent to Open Food Facts, a free public food database. Your name, email and account are not sent.
          </li>
          <li>
            <span className="text-zinc-100">Sign-in emails:</span> your email is used to send the sign-in link.
          </li>
          <li>
            <span className="text-zinc-100">Garmin:</span> only if you connect it. See below.
          </li>
        </ul>
      </Section>

      <Section title="Your Garmin key">
        <ul className="list-disc space-y-1 pl-5">
          <li>You create the key in Garmin Connect and paste it into Body IQ. It only lets Body IQ read your data. It cannot change anything in your Garmin account or send workouts to your watch.</li>
          <li>The key is saved in a database table that your browser can&apos;t read back. After you save it, it is never shown again, only its last four characters.</li>
          <li>It is used only by the server when you tap Sync, to ask Garmin for your data. It is not logged.</li>
          <li>It is stored as plain text in that protected table, not separately encrypted. Supabase encrypts the database storage itself.</li>
          <li>Disconnect deletes the key from Body IQ straight away. Also delete it in Garmin Connect if you won&apos;t reuse it. You can do that at any time.</li>
        </ul>
      </Section>

      <Section title="Guest sessions">
        <p>A guest session needs no email. Guest data is deleted when you tap Leave guest session, or automatically 24 hours after you start, whichever comes first.</p>
      </Section>

      <Section title="Your controls">
        <ul className="list-disc space-y-1 pl-5">
          <li>Export everything as JSON or CSV from Settings.</li>
          <li>Delete workouts, scans, races and food entries one by one. Deletes can be undone for 7 days, then they are gone.</li>
          <li>Self-serve deletion of a whole account isn&apos;t built yet. Until it is, ask the person who runs this project to remove your account and data.</li>
        </ul>
      </Section>

      <p className="mt-8 text-xs text-zinc-500">Body IQ is not a medical service. It gives training and nutrition estimates, not medical advice.</p>
    </main>
  );
}
