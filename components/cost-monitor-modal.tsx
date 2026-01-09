"use client";

import { useEffect, useState } from "react";
import { getCostStats } from "@/lib/cost-tracker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Activity, MessageSquare, Mic } from "lucide-react";

export function CostMonitorModal() {
  const [stats, setStats] = useState<{ totalCost: number; byModel: Record<string, number> } | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadStats();
    }
  }, [isOpen]);

  async function loadStats() {
    const data = await getCostStats();
    setStats(data);
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" aria-label="View AI Costs">
          <DollarSign className="w-4 h-4" />
          <span className="hidden md:inline">Costs</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>AI Cost Estimator</DialogTitle>
        </DialogHeader>
        
        {stats ? (
            <div className="grid gap-4 py-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Spent</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${stats.totalCost.toFixed(4)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Estimated costs based on local usage logs.
                        </p>
                    </CardContent>
                </Card>
                
                <div className="space-y-2">
                    <h3 className="text-sm font-medium">Breakdown by Model</h3>
                    {Object.entries(stats.byModel).length === 0 ? (
                        <div className="text-sm text-muted-foreground text-center py-2">No usage recorded yet</div>
                    ) : (
                        Object.entries(stats.byModel).map(([model, cost]) => (
                            <div key={model} className="flex justify-between items-center text-sm border p-3 rounded-lg bg-card">
                                <div className="flex items-center gap-2">
                                    {model.includes('whisper') ? <Mic className="w-4 h-4 text-blue-500"/> :
                                    model.includes('realtime') ? <Activity className="w-4 h-4 text-green-500"/> :
                                    <MessageSquare className="w-4 h-4 text-orange-500"/>}
                                    <span className="font-mono text-xs">{model}</span>
                                </div>
                                <span className="font-bold">${cost.toFixed(4)}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        ) : (
            <div className="py-8 text-center text-muted-foreground">Loading stats...</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

