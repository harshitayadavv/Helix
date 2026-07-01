'use client';
import { useReactFlow } from 'reactflow';
import { ZoomIn, ZoomOut, Maximize2, LayoutGrid, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

const NODE_TYPES = [
  { key: 'file', label: 'Files', color: '#3b82f6' },
  { key: 'function', label: 'Functions', color: '#22c55e' },
  { key: 'class', label: 'Classes', color: '#a855f7' },
  { key: 'module', label: 'Modules', color: '#f97316' },
];

export function GraphControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [activeFilters, setActiveFilters] = useState<string[]>(['file', 'function', 'class', 'module']);
  const [showFilters, setShowFilters] = useState(false);

  const toggleFilter = (key: string) => {
    setActiveFilters((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]
    );
  };

  return (
    <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-2">
      <div className="flex flex-col gap-1 bg-[#12121a] border border-[#1e1e2e] rounded-lg p-1 shadow-xl">
        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => zoomIn()}>
          <ZoomIn size={13} />
        </Button>
        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => zoomOut()}>
          <ZoomOut size={13} />
        </Button>
        <div className="h-px bg-[#1e1e2e]" />
        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => fitView({ padding: 0.1 })}>
          <Maximize2 size={13} />
        </Button>
        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => {}}>
          <LayoutGrid size={13} />
        </Button>
      </div>

      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          className="w-7 h-7 bg-[#12121a] border border-[#1e1e2e] rounded-lg shadow-xl"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter size={13} />
        </Button>

        {showFilters && (
          <div className="absolute bottom-9 left-0 bg-[#12121a] border border-[#1e1e2e] rounded-xl p-3 shadow-2xl w-48">
            <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2">Filter nodes</div>
            {NODE_TYPES.map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => toggleFilter(key)}
                className="flex items-center gap-2 w-full py-1.5 px-2 rounded-md hover:bg-[#1a1a25] transition-colors"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full transition-opacity"
                  style={{ background: color, opacity: activeFilters.includes(key) ? 1 : 0.2 }}
                />
                <span className="text-xs text-zinc-400">{label}</span>
                {activeFilters.includes(key) && (
                  <span className="ml-auto text-[10px] text-zinc-600">✓</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}