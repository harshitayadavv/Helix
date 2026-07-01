'use client';
import { HelixLoader } from '@/components/loading/HelixLoader';

export default function Loading() {
  return (
    <div className="flex h-screen bg-[#0a0a0f]">
      <HelixLoader label="Loading" sublabel="Just a moment..." />
    </div>
  );
}