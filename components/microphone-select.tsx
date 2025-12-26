"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface MicrophoneSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
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
}: MicrophoneSelectorProps) {
  const { devices, error, isLoading } = useMicrophoneDevices();

  // Auto-select first device if none selected
  useEffect(() => {
    if (!value && devices.length > 0 && !isLoading) {
      onValueChange(devices[0].deviceId);
    }
  }, [devices, value, onValueChange, isLoading]);

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
      <Label htmlFor="microphoneSelect" className="text-sm font-medium">
        Microphone
      </Label>
      <Select
        value={value}
        onValueChange={onValueChange}
        disabled={disabled || isLoading}
      >
        <SelectTrigger className="w-full">
          <SelectValue
            placeholder={isLoading ? "Loading devices..." : "Select microphone"}
          />
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
