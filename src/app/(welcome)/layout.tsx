/** Onboarding em tela cheia: o assistente Welcome não cabe no cartão estreito das telas de login. */
export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative isolate min-h-dvh overflow-x-hidden">
      <div aria-hidden className="welcome-backdrop pointer-events-none absolute inset-0 -z-10" />
      {children}
    </main>
  );
}
