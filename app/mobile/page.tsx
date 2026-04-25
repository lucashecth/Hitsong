'use client';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export default function MobilePage() {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joined, setJoined] = useState(false);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [tokens, setTokens] = useState(1);
  const [gameState, setGameState] = useState<'waiting' | 'playing' | 'challenge' | 'result'>('waiting');
  const [challengeTimer, setChallengeTimer] = useState(0);
  const [timelineSize, setTimelineSize] = useState(0);
  const channelRef = useRef<any>(null);

  const entrarNaSala = () => {
    if (!name || !roomCode) return;
    const channel = supabase.channel(`room_${roomCode.toUpperCase()}`)
      .on('broadcast', { event: 'game-state' }, ({ payload }) => {
        const myTurn = payload.currentPlayer === name;
        setIsMyTurn(myTurn);
        setTimelineSize(payload.playerTimeline.length);
        setGameState(myTurn ? 'playing' : 'waiting');
      })
      .on('broadcast', { event: 'open-challenge' }, ({ payload }) => {
        // Atualiza fichas a partir da TV e entra em modo desafio
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
        channel.send({ type: 'broadcast', event: 'join', payload: { name } });
        setJoined(true);
      }
    });
    channelRef.current = channel;
  };

  // Cronômetro visual do mobile
  useEffect(() => {
    if (challengeTimer > 0) {
      const timer = setTimeout(() => setChallengeTimer(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [challengeTimer]);

  const confirmarJogada = (index: number) => {
    channelRef.current?.send({ type: 'broadcast', event: 'mobile-action', payload: { slotIndex: index } });
  };

  const enviarConfirmacaoFinal = (index: number) => {
    channelRef.current?.send({ type: 'broadcast', event: 'confirm-play', payload: { slotIndex: index } });
    setGameState('waiting');
  };

  const discordar = () => {
    if (tokens <= 0) return;
    channelRef.current?.send({ type: 'broadcast', event: 'challenge-made', payload: { challengerName: name } });
    setGameState('waiting');
  };

  if (!joined) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-3xl font-black mb-8 uppercase">Entrar no Jogo</h1>
        <input placeholder="SEU NOME" value={name} onChange={e => setName(e.target.value.toUpperCase())} className="w-full bg-zinc-900 p-4 rounded-2xl mb-4 border border-zinc-800 outline-none focus:border-green-500" />
        <input placeholder="CÓDIGO DA SALA" value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} className="w-full bg-zinc-900 p-4 rounded-2xl mb-8 border border-zinc-800 outline-none focus:border-green-500" />
        <button onClick={entrarNaSala} className="w-full bg-white text-black font-black py-4 rounded-full text-xl">ENTRAR</button>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-6 text-center transition-colors duration-500 ${gameState === 'challenge' ? 'bg-amber-600' : 'bg-zinc-950'}`}>
      
      {/* STATUS DE ESPERA */}
      {gameState === 'waiting' && (
        <div>
          <div className="w-20 h-20 border-4 border-zinc-800 border-t-white rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-zinc-500 font-bold uppercase tracking-widest">Aguardando outros jogadores...</p>
        </div>
      )}

      {/* MINHA VEZ DE JOGAR */}
      {gameState === 'playing' && isMyTurn && (
        <div className="w-full">
          <p className="text-zinc-400 font-bold mb-8 uppercase tracking-widest text-sm">Sua vez! Escolha onde a música encaixa:</p>
          <div className="grid grid-cols-1 gap-3">
            {[...Array(timelineSize + 1)].map((_, i) => (
              <button 
                key={i} 
                onClick={() => confirmarJogada(i)}
                onDoubleClick={() => enviarConfirmacaoFinal(i)}
                className="w-full bg-zinc-900 border-2 border-zinc-800 py-6 rounded-2xl text-xl font-black hover:border-green-500 active:bg-green-500 active:text-black transition-all"
              >
                ESPAÇO {i + 1}
              </button>
            ))}
          </div>
          <p className="mt-6 text-[10px] text-zinc-600 uppercase">Dica: Clique uma vez para ver na TV, duas para confirmar.</p>
        </div>
      )}

      {/* TELA DE DESAFIO (DISCORDAR) */}
      {gameState === 'challenge' && (
        <div className="w-full">
          <h2 className="text-6xl font-black text-black mb-2">{challengeTimer}s</h2>
          <p className="text-black font-bold uppercase mb-10">Alguém jogou! Você discorda?</p>
          
          <button 
            onClick={discordar}
            disabled={tokens <= 0 || isMyTurn}
            className={`w-full py-10 rounded-[3rem] text-4xl font-black shadow-2xl transition-all ${tokens > 0 && !isMyTurn ? 'bg-black text-white active:scale-95' : 'bg-zinc-800/50 text-zinc-600 opacity-50'}`}
          >
            DISCORDAR
          </button>
          
          <div className="mt-8 flex flex-col items-center">
            <p className="text-black/60 font-bold text-xs uppercase mb-2">Suas Fichas</p>
            <div className="flex gap-2">
              {[...Array(tokens)].map((_, i) => (
                <div key={i} className="w-4 h-4 bg-black rounded-full" />
              ))}
              {tokens === 0 && <span className="text-black font-black">SEM FICHAS</span>}
            </div>
          </div>
        </div>
      )}

      {gameState === 'result' && (
        <h2 className="text-4xl font-black animate-pulse uppercase">Olhe para a TV!</h2>
      )}

    </div>
  );
}