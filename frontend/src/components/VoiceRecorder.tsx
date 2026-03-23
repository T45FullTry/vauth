import React, { useEffect, useRef, useState } from 'react';
import useVoiceRecorder from '../hooks/useVoiceRecorder';

interface VoiceRecorderProps {
  onComplete: (features: number[]) => void;
  onError?: (error: string) => void;
  duration?: number;
  disabled?: boolean;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onComplete,
  onError,
  duration = 5,
  disabled = false,
}) => {
  const [countdown, setCountdown] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const {
    isRecording,
    isProcessing,
    error,
    startRecording,
    voiceFeatures,
    analyser,
  } = useVoiceRecorder({ duration });

  useEffect(() => {
    if (voiceFeatures) {
      onComplete(voiceFeatures);
    }
  }, [voiceFeatures, onComplete]);

  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  useEffect(() => {
    if (!isRecording || !analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      analyser.getByteFrequencyData(dataArray);
      
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;
        ctx.fillStyle = '#4f46e5';
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRecording, analyser]);

  const handleStartRecording = () => {
    setCountdown(3);
    let count = 3;
    const interval = setInterval(() => {
      count--;
      setCountdown(count);
      if (count === 0) {
        clearInterval(interval);
        setCountdown(null);
        startRecording();
      }
    }, 1000);
  };

  return (
    <div className="card">
      <h2 className="text-center mb-4">Voice Recording</h2>
      
      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {isRecording && (
        <div className="recording-indicator">
          <div className="recording-dot"></div>
          <span>Recording... {duration}s remaining</span>
        </div>
      )}

      {countdown !== null && (
        <div className="text-center mb-4">
          <h1 style={{ fontSize: '4rem', color: '#4f46e5' }}>{countdown}</h1>
          <p>Get ready to speak</p>
        </div>
      )}

      <canvas
        ref={canvasRef}
        width={600}
        height={120}
        style={{ width: '100%', height: '120px', borderRadius: '0.5rem' }}
      />

      <div className="mt-4 text-center">
        {!isRecording && !isProcessing && !voiceFeatures && (
          <button
            className="btn btn-primary"
            onClick={handleStartRecording}
            disabled={disabled}
          >
            🎤 Start Recording
          </button>
        )}

        {isProcessing && (
          <div className="flex items-center justify-center gap-2">
            <span className="loading"></span>
            <span>Processing voice...</span>
          </div>
        )}

        {voiceFeatures && (
          <div className="alert alert-success">
            ✓ Voice features extracted successfully!
          </div>
        )}
      </div>

      <p className="text-center mt-4" style={{ color: '#6b7280', fontSize: '0.875rem' }}>
        Please speak clearly when recording starts. You'll have {duration} seconds.
      </p>
    </div>
  );
};

export default VoiceRecorder;
