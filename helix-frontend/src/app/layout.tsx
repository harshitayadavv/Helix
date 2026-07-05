import type { Metadata } from 'next';
import './globals.css';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { RepoProvider } from '@/context/RepoContext';

export const metadata: Metadata = {
  title: 'Helix — AI Code Intelligence',
  description: 'Understand your codebase with AI-powered dependency analysis and intelligent chat.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased bg-[#0a0a0f] text-white">
        <RepoProvider>
          {children}
          <OnboardingFlow />
        </RepoProvider>
      </body>
    </html>
  );
}
