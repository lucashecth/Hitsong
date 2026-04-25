'use client';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export default function MobilePage() {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joined, setJoined] = useState(false);
  const [ready, setReady] = useState(false);
  
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [tokens, setTokens] = useState(1);
  const [gameState, setGameState] = useState<'lobby' | 'waiting' | 'playing' | 'challenge' | 'result'>('lobby');
  const [challengeTimer, setChallengeTimer] = useState(0);
  const [timelineSize, setTimelineSize] = useState(0);
  
  const channelRef = useRef<any>(null);

  // --- ENTRAR NA SALA ---
  const entrarNaSala = () => {
    if (!name || !roomCode) return;
    
    const channel = supabase.channel(`room_${roomCode.toUpperCase()}`)
      .on('broadcast', { event: 'game-state' }, ({ payload }) => {
        // Quando a TV manda o estado do jogo, a partida começou!
        const myTurn = payload.currentPlayer === name;
        setIsMyTurn(myTurn);
        setTimelineSize(payload.playerTimeline.length);
        setGameState(myTurn ? 'playing' : 'waiting');
      })
      .on('broadcast', { event: 'open-challenge' }, ({ payload }) => {
        // Alguém jogou, abre a tela de Discordar
        const myData = payload.playersTokens.find((p: any) => p.name === name);
        if (myData) setTokens(myData.tokens);
        setChallengeTimer(payload.timer);
        setGameState('challenge');
      })
      .on('broadcast', { event: 'play-result' }, () => {
        setGameState('result');
      });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.send({ type: 'broadcast', event: 'join', payload: { name: name.toUpperCase() } });
        setJoined(true);
      }
    });

    channelRef.current = channel;
  };

  const sinalizarPronto = () => {
    channelRef.current?.send({ type: 'broadcast', event: 'player-ready', payload: { name: name.toUpperCase() } });
    setReady(true);
  };

  // Cronômetro do desafio
  useEffect(() => {
    if (challengeTimer > 0) {
      const timer = setTimeout(() => setChallengeTimer(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [challengeTimer]);

  // Funções de Ação
  const confirmarPosicao = (index: number) => {
    channelRef.current?.send({ type: 'broadcast', event: 'mobile-action', payload: { slotIndex: index } });
  };

  const enviarConfirmacaoFinal = (index: number) => {
    channelRef.current?.send({ type: 'broadcast', event: 'confirm-play', payload: { slotIndex: index } });
    setGameState('waiting');
  };

  const discordar = () => {
    if (tokens <= 0 || isMyTurn) return;
    channelRef.current?.send({ type: 'broadcast', event: 'challenge-made', payload: { challengerName: name } });
    setGameState('waiting');
  };

  // --- INTERFACE DE LOGIN (A BONITONA) ---
  if (!joined) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center">
            <h1 className="text-5xl font-black tracking-tighter mb-2">HITSTER</h1>
            <p className="text-green-500 font-bold tracking-[0.3em] uppercase text-xs">Controle Remoto</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase ml-4">Quem está jogando?</label>
              <input 
                placeholder="NOME OU APELIDO" 
                value={name} 
                onChange={e => setName(e.target.value.toUpperCase())} 
                className="w-full bg-zinc-900 border-2 border-zinc-800 p-5 rounded-3xl text-xl font-bold focus:border-green-500 outline-none transition-all placeholder:text-zinc-700" 
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase ml-4">Código na TV</label>
              <input 
                placeholder="SALA" 
                value={roomCode} 
                onChange={e => setRoomCode(e.target.value.toUpperCase())} 
                className="w-full bg-zinc-900 border-2 border-zinc-800 p-5 rounded-3xl text-3xl font-black text-center tracking-widest focus:border-green-500 outline-none transition-all placeholder:text-zinc-700" 
              />
            </div>
          </div>

          <button 
            onClick={entrarNaSala} 
            className="w-full bg-white text-black font-black py-6 rounded-full text-2xl shadow-[0_20px_40px_rgba(255,255,255,0.1)] active:scale-95 transition-all"
          >
            ENTRAR NA SALA
          </button>
        </div>
      </div>
    );
  }

  // --- LOBBY (ESPERANDO TODOS FICAREM PRONTOS) ---
  if (!ready) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-8">
        <h2 className="text-zinc-500 font-bold uppercase tracking-widest mb-4">Sala: {roomCode}</h2>
        <h1 className="text-4xl font-black mb-12">Olá, {name}!</h1>
        <button 
          onClick={sinalizarPronto} 
          className="w-full max-w-xs bg-green-500 text-black font-black py-6 rounded-full text-2xl animate-pulse shadow-[0_0_50px_rgba(34,197,94,0.3)]"
        >
          ESTOU PRONTO
        </button>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-6 text-center transition-all duration-700 ${gameState === 'challenge' ? 'bg-amber-500' : 'bg-zinc-950'}`}>
      
      {/* ESPERANDO TURNO */}
      {gameState === 'waiting' && (
        <div className="animate-in fade-in zoom-in duration-500">
          <div className="w-16 h-16 border-4 border-zinc-800 border-t-green-500 rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-zinc-400 font-bold uppercase tracking-widest text-sm">Aguarde sua vez...</p>
          <div className="mt-8 flex justify-center gap-1">
             {[...Array(tokens)].map((_, i) => <div key={i} className="w-3 h-3 bg-amber-400 rounded-full" />)}
          </div>
        </div>
      )}

      {/* MINHA VEZ */}
      {gameState === 'playing' && isMyTurn && (
        <div className="w-full max-w-sm animate-in slide-in-from-bottom duration-500">
          <p className="text-zinc-500 font-black text-[10px] uppercase tracking-widest mb-6">Sua timeline tem {timelineSize} cartas</p>
          <div className="grid grid-cols-1 gap-4">
            {[...Array(timelineSize + 1)].map((_, i) => (
              <button 
                key={i} 
                onClick={() => confirmarPosicao(i)}
                onDoubleClick={() => enviarConfirmacaoFinal(i)}
                className="w-full bg-zinc-900 border-2 border-zinc-800 p-6 rounded-3xl text-2xl font-black active:bg-green-500 active:text-black active:border-white transition-all shadow-xl"
              >
                ESPAÇO {i + 1}
              </button>
            ))}
          </div>
          <p className="mt-8 text-[10px] text-zinc-600 font-bold uppercase leading-relaxed">
            Toque 1x para ver na TV<br/>Toque 2x para confirmar
          </p>
        </div>
      )}

      {/* DISCORDAR (FICHAS) */}
      {gameState === 'challenge' && (
        <div className="w-full max-w-sm">
          <div className="mb-12">
            <h2 className="text-8xl font-black text-black leading-none">{challengeTimer}s</h2>
            <p className="text-black font-black uppercase tracking-tighter text-xl">VOCÊ DISCORDA?</p>
          </div>
          
          <button 
            onClick={discordar}
            disabled={tokens <= 0 || isMyTurn}
            className={`w-full py-12 rounded-[3rem] text-4xl font-black shadow-2xl transition-all ${tokens > 0 && !isMyTurn ? 'bg-black text-white active:scale-90 scale-105' : 'bg-black/10 text-black/20'}`}
          >
            DISCORDAR
          </button>
          
          <div className="mt-12">
            <p className="text-black/40 font-bold text-xs uppercase mb-3 tracking-widest">Suas Fichas</p>
            <div className="flex justify-center gap-3">
              {[...Array(tokens)].map((_, i) => (
                <div key={i} className="w-6 h-6 bg-black rounded-full shadow-lg" />
              ))}
              {tokens === 0 && <span className="text-black font-black">ACABOU!</span>}
            </div>
          </div>
        </div>
      )}

      {gameState === 'result' && (
        <div className="animate-bounce">
            <h2 className="text-5xl font-black text-white uppercase tracking-tighter italic">Olhe para a TV!</h2>
        </div>
      )}

    </div>
  );
}