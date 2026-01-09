"use client";

import { useEffect, useState } from "react";
import { getCostStats, clearCostLogs } from "@/lib/cost-tracker";
import { DollarSign, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

export function MinimalCostDisplay() {
  const [totalCost, setTotalCost] = useState(0);
  const [details, setDetails] = useState<Record<string, number>>({});

  useEffect(() => {
    // Initial load
    getCostStats().then(stats => {
        setTotalCost(stats.totalCost);
        setDetails(stats.byModel);
    });

    // Listen for updates
    const handleCostUpdate = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        if (detail && typeof detail.cost === 'number') {
            setTotalCost(prev => prev + detail.cost);
            setDetails(prev => ({
                ...prev,
                [detail.model]: (prev[detail.model] || 0) + detail.cost
            }));
        }
    };

    const handleCostCleared = () => {
        setTotalCost(0);
        setDetails({});
        toast.info("Cost history cleared");
    };

    window.addEventListener('ai-cost-logged', handleCostUpdate);
    window.addEventListener('ai-cost-cleared', handleCostCleared);
    
    return () => {
        window.removeEventListener('ai-cost-logged', handleCostUpdate);
        window.removeEventListener('ai-cost-cleared', handleCostCleared);
    };
  }, []);

  const handleClear = async () => {
      await clearCostLogs();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700/30 transition-all text-xs font-mono text-slate-400 hover:text-slate-200"
            title="Estimated AI Cost"
        >
            <DollarSign className="w-3 h-3 text-slate-500" />
            <span>{totalCost.toFixed(4)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 bg-slate-900 border-slate-800 p-3" align="end">
        <div className="space-y-2">
            <h4 className="font-medium text-xs text-slate-400 uppercase tracking-wider mb-2">Cost Breakdown</h4>
            {Object.entries(details).length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-2">No recorded costs</div>
            ) : (
                Object.entries(details).sort(([,a], [,b]) => b - a).map(([model, cost]) => (
                    <div key={model} className="flex justify-between items-center text-xs">
                        <span className="text-slate-300 truncate max-w-[140px]" title={model}>{model}</span>
                        <span className="font-mono text-slate-400">${cost.toFixed(4)}</span>
                    </div>
                ))
            )}
            <div className="border-t border-slate-800 mt-2 pt-2 flex justify-between items-center text-xs font-medium">
                <span className="text-slate-200">Total</span>
                <div className="flex items-center gap-3">
                    <span className="font-mono text-emerald-400">${totalCost.toFixed(4)}</span>
                    <button 
                        onClick={handleClear}
                        className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-red-400 transition-colors"
                        title="Clear history"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

