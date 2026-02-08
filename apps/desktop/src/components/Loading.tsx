import { Loader2 } from 'lucide-react';

export function Loading() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0a0a0a] text-[#fafafa] antialiased">
      <Loader2 className="w-6 h-6 animate-spin text-white/40 mb-4" />
      <p className="text-[15px] text-white/40">Starting...</p>
    </div>
  );
}
