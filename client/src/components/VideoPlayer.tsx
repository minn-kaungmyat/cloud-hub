import { useState, useEffect } from 'react';
import { 
  MediaPlayer, 
  MediaProvider, 
  PlayButton, 
  TimeSlider, 
  VolumeSlider, 
  MuteButton, 
  FullscreenButton, 
  Time, 
  SeekButton,
  Controls,
  Gesture
} from '@vidstack/react';
import { Play, Pause, RotateCw, RotateCcw, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react';
import '@vidstack/react/player/styles/base.css';
import type { CloudFile } from '../types';

// Animated overlay component for the center of the video player
function PlayerActionOverlay({ actionData }: { actionData: { action: 'play' | 'pause' | 'forward' | 'reverse' | null, id: number } }) {
  const [visible, setVisible] = useState(true);
  
  useEffect(() => {
    if (actionData.action) {
      const timer = setTimeout(() => setVisible(false), 500);
      return () => clearTimeout(timer);
    }
  }, [actionData.id, actionData.action]);

  if (!actionData.action) return null;

  return (
    <div key={actionData.id} className={`absolute inset-0 flex items-center justify-center pointer-events-none z-50 transition-all duration-300 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-110'}`}>
      <div className="bg-black/50 backdrop-blur-md rounded-full w-24 h-24 flex items-center justify-center text-white shadow-2xl">
        {actionData.action === 'play' && <Play size={48} className="fill-white" />}
        {actionData.action === 'pause' && <Pause size={48} className="fill-white" />}
        {actionData.action === 'forward' && <RotateCw size={48} />}
        {actionData.action === 'reverse' && <RotateCcw size={48} />}
      </div>
    </div>
  );
}

export function VideoPlayer({ file, previewUrl }: { file: CloudFile; previewUrl: string }) {
  const [playerAction, setPlayerAction] = useState<{ action: 'play' | 'pause' | 'forward' | 'reverse' | null, id: number }>({ action: null, id: 0 });

  return (
    <div 
      className="rounded-lg overflow-hidden bg-black ring-1 ring-white/10 shadow-2xl flex flex-col items-center justify-center relative z-10 mx-auto"
      style={{
        width: '100%',
        maxWidth: 'min(1024px, calc(75vh * 16 / 9))',
        aspectRatio: '16 / 9'
      }}
    >
      {(file.name.toLowerCase().endsWith('.mkv') || file.mimeType?.includes('matroska')) && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-zinc-900/90 backdrop-blur-md text-zinc-300 text-xs px-4 py-2 rounded-md border border-white/10 shadow-lg flex items-center gap-2 max-w-[90%] text-center font-mono">
          <span className="text-amber-500 text-sm">⚠️</span>
          <span>MKV playback may have limited seeking/audio support.</span>
        </div>
      )}
      <MediaPlayer
        title={file.name}
        src={{ src: previewUrl, type: (file.mimeType || 'video/mp4') as 'video/mp4' }}
        className="w-full h-full text-white ring-0 group/player"
        autoPlay
        crossOrigin
        onPlay={() => setPlayerAction({ action: 'play', id: Date.now() })}
        onPause={() => setPlayerAction({ action: 'pause', id: Date.now() })}
      >
        <MediaProvider />
        
        <PlayerActionOverlay actionData={playerAction} />
        
        {/* Gestures for tapping the video to pause/play/fullscreen */}
        <Gesture className="absolute inset-0 z-0 block w-full h-full" event="pointerup" action="toggle:paused" />
        <Gesture className="absolute inset-0 z-0 block w-full h-full" event="dblpointerup" action="toggle:fullscreen" />

        <Controls.Root className="absolute inset-0 z-10 flex flex-col justify-end opacity-0 transition-opacity duration-300 data-[visible]:opacity-100">
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
          
          <Controls.Group className="w-full flex flex-col gap-2.5 px-6 sm:px-10 pb-4 sm:pb-6 pointer-events-auto relative z-20">
            
            {/* Timeline Scrubber (Above Pills) */}
            <TimeSlider.Root className="group relative flex w-full h-8 items-center cursor-pointer">
              <TimeSlider.Track className="relative w-full h-[4px] bg-white/30 rounded-full overflow-hidden">
                <TimeSlider.TrackFill className="absolute bg-amber-500 w-[var(--slider-fill)] h-full will-change-[width]" />
              </TimeSlider.Track>
              <TimeSlider.Thumb className="absolute w-4 h-4 bg-white rounded-full left-[var(--slider-fill)] -translate-x-1/2 opacity-0 group-hover:opacity-100 shadow-md transition-opacity will-change-[left]" />
            </TimeSlider.Root>

            {/* Bottom Control Pills */}
            <div className="flex items-center justify-between w-full">
              
              <div className="flex items-center gap-4">
                {/* Left Pill: Play/Pause */}
                <div className="bg-white/10 backdrop-blur-md transform-gpu rounded-full px-6 h-12 flex items-center justify-center ring-1 ring-white/10 hover:bg-white/20 transition-colors shadow-lg min-w-[72px]">
                  <PlayButton className="group cursor-pointer flex items-center justify-center w-full h-full text-white">
                    <Play size={24} className="hidden group-data-[paused]:block fill-white" />
                    <Pause size={24} className="block group-data-[paused]:hidden fill-white" />
                  </PlayButton>
                </div>

                {/* Center Pill: Seek & Time */}
                <div className="bg-white/10 backdrop-blur-md transform-gpu rounded-full px-5 sm:px-6 h-12 flex items-center justify-center gap-4 sm:gap-6 ring-1 ring-white/10 hover:bg-white/20 transition-colors shadow-lg">
                  <SeekButton seconds={-10} onClick={() => setPlayerAction({ action: 'reverse', id: Date.now() })} className="cursor-pointer text-white/90 hover:text-white transition-colors">
                    <RotateCcw size={18} />
                  </SeekButton>
                  <SeekButton seconds={10} onClick={() => setPlayerAction({ action: 'forward', id: Date.now() })} className="cursor-pointer text-white/90 hover:text-white transition-colors">
                    <RotateCw size={18} />
                  </SeekButton>
                  <div className="flex items-center gap-1 text-[13px] font-mono tabular-nums text-white/90 font-medium">
                    <Time type="current" /> <span>/</span> <Time type="duration" />
                  </div>
                </div>
              </div>

              {/* Right Pill: Volume & Fullscreen */}
              <div className="bg-white/10 backdrop-blur-md transform-gpu rounded-full px-4 sm:px-5 h-12 flex items-center justify-center gap-4 sm:gap-5 ring-1 ring-white/10 hover:bg-white/20 transition-colors shadow-lg">
                <div className="flex items-center gap-3 group/vol">
                  <MuteButton className="group cursor-pointer text-white/90 hover:text-white flex items-center justify-center">
                    <Volume2 size={20} className="block group-data-[muted]:hidden" />
                    <VolumeX size={20} className="hidden group-data-[muted]:block text-amber-500" />
                  </MuteButton>
                  <VolumeSlider.Root className="group relative h-8 flex items-center cursor-pointer w-0 opacity-0 group-hover/vol:w-20 group-hover/vol:opacity-100 transition-all duration-300 overflow-hidden">
                    <VolumeSlider.Track className="relative w-full h-[4px] bg-white/30 rounded-full overflow-hidden">
                      <VolumeSlider.TrackFill className="absolute bg-white w-[var(--slider-fill)] h-full will-change-[width]" />
                    </VolumeSlider.Track>
                    <VolumeSlider.Thumb className="absolute w-3 h-3 bg-white rounded-full left-[var(--slider-fill)] -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity will-change-[left]" />
                  </VolumeSlider.Root>
                </div>

                <div className="w-[1px] h-5 bg-white/20"></div>

                <FullscreenButton className="group cursor-pointer text-white/90 hover:text-white flex items-center justify-center">
                  <Maximize size={18} className="block group-data-[active]:hidden" />
                  <Minimize size={18} className="hidden group-data-[active]:block" />
                </FullscreenButton>
              </div>

            </div>
          </Controls.Group>
        </Controls.Root>

      </MediaPlayer>
    </div>
  );
}
