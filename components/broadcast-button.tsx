import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface BroadcastButtonProps {
  isSessionActive: boolean;
  detected: boolean;
  onClick: () => void;
}

export function BroadcastButton({
  isSessionActive,
  detected,
  onClick,
}: BroadcastButtonProps) {
  return (
    <Button
      variant={
        isSessionActive ? "destructive" : detected ? "secondary" : "default"
      }
      className={`w-full py-6 text-lg font-medium flex items-center justify-center gap-2 focus:ring-0 focus:ring-offset-0 ${
        detected && !isSessionActive ? "opacity-50 cursor-not-allowed" : ""
      }`}
      onClick={onClick}
      disabled={detected && !isSessionActive}
    >
      {isSessionActive && (
        <Badge
          variant="secondary"
          className="animate-pulse bg-red-100 text-red-700"
        >
          LIVE
        </Badge>
      )}
      {detected && !isSessionActive ? (
        <Badge variant="secondary" className="animate-pulse">
          Detected
        </Badge>
      ) : isSessionActive ? (
        "Stop"
      ) : (
        "Start"
      )}
    </Button>
  );
}
