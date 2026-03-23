import { useState, useCallback, useRef } from 'react';
import type { VoiceRecordingState } from '../types';

interface UseVoiceRecorderOptions {
  duration?: number; // Recording duration in seconds
  sampleRate?: number;
}

export function useVoiceRecorder(options: UseVoiceRecorderOptions = {}) {
  const { duration = 5, sampleRate = 44100 } = options;
  
  const [state, setState] = useState<VoiceRecordingState>({
    isRecording: false,
    isProcessing: false,
    audioBlob: null,
    voiceFeatures: null,
    confidence: null,
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>( null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number>();

  const startRecording = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isRecording: true, error: null }));
      chunksRef.current = [];

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Create audio context for analysis
      audioContextRef.current = new AudioContext({ sampleRate });
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      // Create media recorder
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        processAudio(audioBlob);
      };

      mediaRecorderRef.current.start();

      // Auto-stop after duration
      setTimeout(() => {
        stopRecording();
      }, duration * 1000);

    } catch (error) {
      setState(prev => ({
        ...prev,
        isRecording: false,
        error: error instanceof Error ? error.message : 'Failed to access microphone',
      }));
    }
  }, [duration, sampleRate]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setState(prev => ({ ...prev, isRecording: false }));
    }
  }, [state.isRecording]);

  const processAudio = useCallback(async (audioBlob: Blob) => {
    setState(prev => ({ ...prev, isProcessing: true, audioBlob }));

    try {
      // Convert blob to ArrayBuffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      // Decode audio data
      if (audioContextRef.current) {
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        
        // Extract audio features (simplified - in production, send to backend for ML processing)
        const features = extractVoiceFeatures(audioBuffer);
        
        setState(prev => ({
          ...prev,
          voiceFeatures: features,
          isProcessing: false,
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: error instanceof Error ? error.message : 'Failed to process audio',
      }));
    }
  }, []);

  const extractVoiceFeatures = (audioBuffer: AudioBuffer): number[] => {
    // Simplified feature extraction
    // In production, this should use proper MFCC/pitch/formant analysis
    // or send raw audio to backend for processing
    const channelData = audioBuffer.getChannelData(0);
    const features: number[] = [];
    
    // Calculate RMS energy
    const rms = Math.sqrt(
      channelData.reduce((sum, sample) => sum + sample * sample, 0) / channelData.length
    );
    features.push(rms);
    
    // Calculate zero-crossing rate
    let zeroCrossings = 0;
    for (let i = 1; i < channelData.length; i++) {
      if ((channelData[i] >= 0 && channelData[i - 1] < 0) ||
          (channelData[i] < 0 && channelData[i - 1] >= 0)) {
        zeroCrossings++;
      }
    }
    features.push(zeroCrossings / channelData.length);
    
    // Add spectral centroid approximation
    const spectralCentroid = channelData.reduce((sum, sample) => sum + Math.abs(sample), 0) / channelData.length;
    features.push(spectralCentroid);
    
    // Generate additional features (placeholder for real MFCC analysis)
    for (let i = 0; i < 13; i++) {
      features.push(Math.random() * 0.5); // Replace with actual MFCC calculation
    }
    
    return features;
  };

  const reset = useCallback(() => {
    setState({
      isRecording: false,
      isProcessing: false,
      audioBlob: null,
      voiceFeatures: null,
      confidence: null,
      error: null,
    });
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    processAudio,
    reset,
    analyser: analyserRef.current,
  };
}

export default useVoiceRecorder;
