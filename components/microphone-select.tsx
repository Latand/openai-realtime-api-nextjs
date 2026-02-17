"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Mic2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MicrophoneSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  settingsLoaded?: boolean; // Wait for settings before auto-selecting
  hideLabel?: boolean;
  triggerClassName?: string;
}

export function useMicrophoneDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const enumerateDevices = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Request permission first to get device labels
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        // Stop the stream immediately after getting permission
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        // Continue even if permission is denied - we'll show devices without labels
      }

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputDevices = allDevices.filter(
        (device) => device.kind === "audioinput"
      );
      setDevices(audioInputDevices);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get devices");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    enumerateDevices();

    // Listen for device changes (plug/unplug)
    const handleDeviceChange = () => {
      enumerateDevices();
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        handleDeviceChange
      );
    };
  }, [enumerateDevices]);

  return { devices, error, isLoading, refresh: enumerateDevices };
}

export function MicrophoneSelector({
  value,
  onValueChange,
  disabled = false,
  settingsLoaded = true,
  hideLabel = false,
  triggerClassName,
}: MicrophoneSelectorProps) {
  const { devices, error, isLoading } = useMicrophoneDevices();
  const didInitialAutoPickRef = useRef(false);

  // Auto-select first device if none selected (or saved device no longer exists)
  useEffect(() => {
    if (!settingsLoaded || isLoading || devices.length === 0) return;

    // Check if current value is valid (exists in devices list)
    const valueIsValid = value && devices.some(d => d.deviceId === value);

    // Prefer a known-good USB mic name if present (your setup typically uses "Maono"),
    // otherwise fall back to the system default device, otherwise first device.
    const maono = devices.find(d => (d.label || "").toLowerCase().includes("maono") && d.deviceId !== "default")
      ?? devices.find(d => (d.label || "").toLowerCase().includes("maono"));
    const systemDefault = devices.find(d => d.deviceId === "default");
    const preferred = maono ?? systemDefault ?? devices[0];

    if (!valueIsValid) {
      console.log("[MicrophoneSelector] Auto-selecting device:", preferred.label || preferred.deviceId);
      onValueChange(preferred.deviceId);
      didInitialAutoPickRef.current = true;
      return;
    }

    // One-time startup fix: if settings loaded "default" but we have a concrete Maono device,
    // switch once to reduce surprise, while still allowing the user to select "default" later.
    if (!didInitialAutoPickRef.current && value === "default" && maono && maono.deviceId !== "default") {
      console.log("[MicrophoneSelector] Startup prefer Maono over system default:", maono.label || maono.deviceId);
      onValueChange(maono.deviceId);
      didInitialAutoPickRef.current = true;
    }
  }, [devices, value, onValueChange, isLoading, settingsLoaded]);

  if (error) {
    return (
      <div className="form-group space-y-2">
        <Label className="text-sm font-medium text-red-400">
          Microphone Error: {error}
        </Label>
      </div>
    );
  }

  return (
    <div className="form-group space-y-2">
      {!hideLabel && (
        <Label htmlFor="microphoneSelect" className="text-sm font-medium">
          Microphone
        </Label>
      )}
      <Select
        value={value}
        onValueChange={onValueChange}
        disabled={disabled || isLoading}
      >
        <SelectTrigger className={cn("w-full", triggerClassName)}>
          {hideLabel && <Mic2 className="w-4 h-4 text-slate-400" />}
          <SelectValue placeholder={isLoading ? "Loading..." : "Select mic"} />
        </SelectTrigger>
        <SelectContent>
          {devices.map((device, index) => (
            <SelectItem key={device.deviceId} value={device.deviceId}>
              {device.label || `Microphone ${index + 1}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
