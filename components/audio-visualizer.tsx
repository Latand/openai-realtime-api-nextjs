"use client";

import { useEffect, useRef, useState } from "react";

interface AudioVisualizerProps {
  userAnalyser?: AnalyserNode | null;
  assistantAnalyser?: AnalyserNode | null;
  whisperAnalyser?: AnalyserNode | null;
  isSessionActive: boolean;
  isWhisperActive?: boolean;
}

export function AudioVisualizer({
  userAnalyser,
  assistantAnalyser,
  whisperAnalyser,
  isSessionActive,
  isWhisperActive,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  // Settings
  const BAR_WIDTH = 6; // Wider bars for background look
  const BAR_GAP = 4;
  const MAX_FREQ = 16000;
  const MIN_FREQ = 40;
  const SMOOTHING = 0.4;
  
  // State for smooth transitions
  // We'll initialize these when we know the bar count
  const assistantBarsRef = useRef<number[]>([]);
  const userBarsRef = useRef<number[]>([]);

  // Handle Resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', updateSize);
    updateSize();

    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0) return;

    // Update canvas size
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    
    // Calculate bar count based on width
    const totalBarWidth = BAR_WIDTH + BAR_GAP;
    const BAR_COUNT = Math.floor(canvas.width / totalBarWidth);
    
    // Resize arrays if needed
    if (assistantBarsRef.current.length !== BAR_COUNT) {
      assistantBarsRef.current = new Array(BAR_COUNT).fill(0);
      userBarsRef.current = new Array(BAR_COUNT).fill(0);
    }

    const assistantDataArray = new Uint8Array(assistantAnalyser ? assistantAnalyser.frequencyBinCount : 1024);
    const userDataArray = new Uint8Array(userAnalyser ? userAnalyser.frequencyBinCount : (whisperAnalyser ? whisperAnalyser.frequencyBinCount : 1024));

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const sampleRate = 44100;
      const binCount = assistantDataArray.length;

      // 1. Get Data
      if (assistantAnalyser && isSessionActive) {
        assistantAnalyser.getByteFrequencyData(assistantDataArray);
      } else {
        assistantDataArray.fill(0);
      }
      
      if (userAnalyser && isSessionActive) {
        userAnalyser.getByteFrequencyData(userDataArray);
      } else if (whisperAnalyser && isWhisperActive) {
        whisperAnalyser.getByteFrequencyData(userDataArray);
      } else {
        userDataArray.fill(0);
      }

      // 2. Process Data
      const processFrequencies = (data: Uint8Array, currentBars: number[]) => {
        return currentBars.map((current, i) => {
          // Logarithmic mapping
          const startFreq = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, i / BAR_COUNT);
          const endFreq = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, (i + 1) / BAR_COUNT);
          
          const maxNyquist = sampleRate / 2;
          const startBin = Math.floor((startFreq / maxNyquist) * binCount);
          const endBin = Math.ceil((endFreq / maxNyquist) * binCount);
          
          let sum = 0;
          let count = 0;
          
          for (let j = startBin; j < endBin && j < binCount; j++) {
            sum += data[j];
            count++;
          }
          
          let val = count > 0 ? sum / count : 0;
          val = val / 255;
          
          // Dynamics
          const noiseFloor = 0.1;
          val = Math.max(0, val - noiseFloor) / (1 - noiseFloor);
          val = Math.pow(val, 1.5);
          
          // Boost highs
          val = val * (1 + (i/BAR_COUNT) * 1.0);

          // Height Scaling - Max is 40% of screen height
          const targetHeight = val * (canvas.height * 0.4);

          // Smoothing
          if (targetHeight > current) {
             return current + (targetHeight - current) * 0.5; // Attack
          } else {
             return current + (targetHeight - current) * SMOOTHING; // Decay
          }
        });
      };

      assistantBarsRef.current = processFrequencies(assistantDataArray, assistantBarsRef.current);
      userBarsRef.current = processFrequencies(userDataArray, userBarsRef.current);

      // 3. Draw Bars
      
      // Assistant: Top Edge Downwards
      ctx.fillStyle = "rgba(251, 191, 36, 0.15)"; // Very transparent amber
      for (let i = 0; i < BAR_COUNT; i++) {
        const height = Math.max(0, assistantBarsRef.current[i]);
        const x = i * totalBarWidth;
        
        ctx.beginPath();
        // From top (y=0) down
        ctx.roundRect(x, 0, BAR_WIDTH, height, [0, 0, 4, 4]);
        ctx.fill();
      }

      // User: Bottom Edge Upwards
      ctx.fillStyle = "rgba(56, 189, 248, 0.15)"; // Very transparent sky blue
      for (let i = 0; i < BAR_COUNT; i++) {
        const height = Math.max(0, userBarsRef.current[i]);
        const x = i * totalBarWidth;
        
        ctx.beginPath();
        // From bottom (y=canvas.height) up
        ctx.roundRect(x, canvas.height - height, BAR_WIDTH, height, [4, 4, 0, 0]);
        ctx.fill();
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [dimensions, userAnalyser, assistantAnalyser, whisperAnalyser, isSessionActive, isWhisperActive]);

  return (
    <div ref={containerRef} className="w-full h-full pointer-events-none">
      <canvas ref={canvasRef} />
    </div>
  );
}
