'use client';
import { HelixLoader } from '@/components/loading/HelixLoader';
import { GitBranch } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex h-screen bg-[#0a0a0f]">
      <HelixLoader label="Loading repository" sublabel="Parsing dependency graph" icon={GitBranch} />
    </div>
  );
}