
import React, { useState, useCallback } from 'react';
import GameCanvas from './components/GameCanvas';
import { GameState, WeaponType } from './types';

const App: React.FC = () => {
  const [gameId, setGameId] = useState(0);
  const [gameState, setGameState] = useState<Partial<GameState>>({
    score: 0,
    wantedLevel: 0,
    player: { health: 100, stamina: 100, currentWeapon: WeaponType.FIST } as any,
    currentVehicleSpeed: 0
  });

  const handleUpdate = useCallback((state: Partial<GameState>) => {
    setGameState(prev => ({ ...prev, ...state }));
  }, []);

  const handleRespawn = () => {
    // Reset React state
    setGameState({
      score: 0,
      wantedLevel: 0,
      player: { health: 100, stamina: 100, currentWeapon: WeaponType.FIST } as any,
      currentVehicleSpeed: 0
    });
    // Force GameCanvas remount by changing key
    setGameId(prev => prev + 1);
  };

  const weaponList = [WeaponType.FIST, WeaponType.PISTOL, WeaponType.MACHINE_GUN, WeaponType.GRENADE];
  
  const weaponLabels = {
    [WeaponType.FIST]: 'FIST',
    [WeaponType.PISTOL]: 'PISTOL',
    [WeaponType.MACHINE_GUN]: 'UZI',
    [WeaponType.GRENADE]: 'GRENADE'
  };

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden font-mono select-none">
      {/* HUD Left - Money & Health */}
      <div className="absolute top-0 left-0 p-6 flex flex-col gap-4 z-20 pointer-events-none">
        <div className="bg-black/90 border-l-8 border-green-600 px-6 py-2 text-green-400 text-5xl font-black italic tracking-widest shadow-[8px_0_0_0_#166534]">
          $ {(gameState.score || 0).toString().padStart(8, '0')}
        </div>
        
        <div className="w-80 space-y-2">
           <div className="h-6 bg-gray-950 border-2 border-white/20 rounded flex items-center px-1">
              <div 
                className="h-4 bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.5)] transition-all duration-300 rounded-sm" 
                style={{ width: `${Math.max(0, gameState.player?.health || 0)}%` }} 
              />
           </div>
           <div className="h-3 bg-gray-950 border-2 border-white/20 rounded flex items-center px-1">
              <div 
                className="h-1 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-300 rounded-sm" 
                style={{ width: `${gameState.player?.stamina || 0}%` }} 
              />
           </div>
        </div>
      </div>

      {/* HUD Right - Weapon Slots & Wanted */}
      <div className="absolute top-0 right-0 p-6 flex flex-col items-end gap-6 z-20 pointer-events-none">
        {/* Weapon Slots */}
        <div className="flex gap-2 bg-black/60 p-2 border-b-4 border-yellow-600 rounded-lg">
          {weaponList.map((w, i) => (
            <div 
              key={w} 
              className={`flex flex-col items-center justify-center w-20 h-20 border-2 transition-all duration-150 ${gameState.player?.currentWeapon === w ? 'border-yellow-400 bg-yellow-400/20 scale-110' : 'border-white/10 bg-black/40'}`}
            >
              <span className="text-[10px] text-white/50 mb-1">{i + 1}</span>
              <span className={`text-[10px] font-bold text-center leading-tight ${gameState.player?.currentWeapon === w ? 'text-yellow-400' : 'text-white/30'}`}>
                {weaponLabels[w]}
              </span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          {[...Array(5)].map((_, i) => (
            <div 
              key={i} 
              className={`w-8 h-8 rotate-45 border-4 border-yellow-500 shadow-lg ${i < (gameState.wantedLevel || 0) ? 'bg-yellow-500 shadow-[0_0_20px_#fbbf24]' : 'bg-transparent border-white/10'}`}
            />
          ))}
        </div>
      </div>

      {/* Speedometer - Bottom Center */}
      {gameState.player?.currentVehicleId && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center z-20 pointer-events-none">
          <div className="bg-black/80 border-t-4 border-white/40 px-8 py-3 rounded-t-xl">
             <div className="text-white/40 text-[10px] font-bold mb-1">VELOCITY</div>
             <div className="flex items-end gap-2">
                <div className="text-white text-5xl font-black italic tracking-tighter">
                  {Math.floor(Math.abs(gameState.currentVehicleSpeed || 0) * 20)}
                </div>
                <div className="text-white/40 text-xl font-bold italic mb-1">KM/H</div>
             </div>
          </div>
          <div className="w-64 h-2 bg-gray-900 overflow-hidden border-2 border-black">
             <div 
                className="h-full bg-white transition-all duration-100" 
                style={{ width: `${Math.min(100, Math.abs(gameState.currentVehicleSpeed || 0) * 12)}%` }}
             />
          </div>
        </div>
      )}

      {/* Controls Hint */}
      <div className="absolute bottom-6 left-6 z-20 pointer-events-none text-white/40 text-[11px] font-bold bg-black/40 p-2 rounded-sm border-l-2 border-white/20">
        WASD: DRIVE/MOVE | F: EXIT/ENTER | SPACE: ROLL | L-CLICK: FIRE | R-CLICK: ZOOM
      </div>

      {/* Game Canvas with key for reset */}
      <GameCanvas key={gameId} onUpdate={handleUpdate} />

      {/* Game Over */}
      {gameState.player?.health !== undefined && gameState.player.health <= 0 && (
        <div className="absolute inset-0 bg-red-950/95 flex flex-col items-center justify-center z-50 animate-in fade-in duration-1000 backdrop-blur-sm">
          <h1 className="text-9xl font-black text-white mb-12 tracking-tighter shadow-2xl skew-x-[-10deg] drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)]">WASTED</h1>
          <button 
            className="px-16 py-6 bg-white text-red-950 font-black text-3xl hover:bg-red-100 hover:scale-110 active:scale-95 transition-all pointer-events-auto shadow-[0_0_60px_rgba(255,255,255,0.4)]"
            onClick={handleRespawn}
          >
            RESPAWN
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
