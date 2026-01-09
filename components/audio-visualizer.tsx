"use client";

import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  currentVolume: number;
  isSessionActive: boolean;
  color?: string;
}

export function AudioVisualizer({
  currentVolume,
  isSessionActive,
  color = "#f59e0b",
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barsRef = useRef<number[]>(new Array(40).fill(0)); // 40 bars

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;

    const render = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Determine target height based on volume
      // volume is 0.0 to 1.0 (approximately)
      // We want some noise when active but silent, and zero when inactive
      const targetHeight = isSessionActive 
        ? Math.max(currentVolume * 150, 2) // Minimum movement when active
        : 0;

      // Update bars smoothly
      barsRef.current = barsRef.current.map((current) => {
        // Randomize target slightly for organic look
        const jitter = isSessionActive ? Math.random() * 5 : 0;
        const target = targetHeight + jitter;
        
        // Smooth interpolation
        return current + (target - current) * 0.2;
      });

      // Draw bars
      const barWidth = 4;
      const gap = 4;
      const startX = (canvas.width - (barsRef.current.length * (barWidth + gap))) / 2;
      const centerY = canvas.height / 2;

      ctx.fillStyle = color;

      barsRef.current.forEach((height, i) => {
        // Mirror from center
        const x = startX + i * (barWidth + gap);
        
        // Draw rounded pill shape
        ctx.beginPath();
        ctx.roundRect(x, centerY - height / 2, barWidth, height, 4);
        ctx.fill();
        
        // Fade out edges
        const distanceFromCenter = Math.abs(i - barsRef.current.length / 2);
        const opacity = Math.max(0.2, 1 - distanceFromCenter / (barsRef.current.length / 2));
        ctx.globalAlpha = opacity;
      });
      ctx.globalAlpha = 1.0;

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [currentVolume, isSessionActive, color]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={60}
      className="w-full max-w-[320px] h-[60px]"
    />
  );
}

