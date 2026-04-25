'use client';
import { useEffect, useState, useRef, Fragment } from 'react';
import { supabase } from '@/lib/supabase';

interface Track { id: string; year: string; name: string; artist: string; imageUrl: string; }

export default function MobilePage() {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joined, setJoined] = useState(false);
  const [ready, setReady] = useState(false);
  
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [tokens, setTokens] = useState(1);
  const [gameState, setGameState] = useState<'lobby' | 'waiting' | 'playing' | 'challenge' | 'result'>('lobby');
  const [challengeTimer, setChallengeTimer] = useState(0);
  
  const [timeline, setTimeline] = useState<Track[]>([]);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    const savedName = localStorage.getItem('h_name');
    const savedRoom = localStorage.getItem('h_room');
    if (savedName && savedRoom && !joined) {
        setName(savedName);
        setRoomCode(savedRoom);
    }
  }, []);

  const entrarNaSala = (isReconnect = false) => {
    if (!name || !roomCode) return;
    
    const channel = supabase.channel(`room_${roomCode.toUpperCase()}`)
      .on('broadcast', { event: 'game-state' }, ({ payload }) => {
        const myTurn = payload.currentPlayer === name;
        setIsMyTurn(myTurn);
        setTimeline(payload.playerTimeline);
        setGameState(myTurn ? 'playing' : 'waiting');
      })
      .on('broadcast', { event: 'open-challenge' }, ({ payload }) => {
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
        
        if (isReconnect) {
            // Se for reconexão, avisa a TV pra mandar a timeline e o turno atual imediatamente
            channel.send({ type: 'broadcast', event: 'request-sync', payload: { name: name.toUpperCase() } });
            setReady(true);
        }
        setJoined(true);
      }
    });

    localStorage.setItem('h_name', name.toUpperCase());
    localStorage.setItem('h_room', roomCode.toUpperCase());
    channelRef.current = channel;
  };

  const sinalizarPronto = () => {
    channelRef.current?.send({ type: 'broadcast', event: 'player-ready', payload: { name: name.toUpperCase() } });
    setReady(true);
  };

  useEffect(() => {
    if (challengeTimer > 0) {
      const timer = setTimeout(() => setChallengeTimer(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [challengeTimer]);

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
              <input placeholder="NOME OU APELIDO" value={name} onChange={e => setName(e.target.value.toUpperCase())} className="w-full bg-zinc-900 border-2 border-zinc-800 p-5 rounded-3xl text-xl font-bold focus:border-green-500 outline-none transition-all placeholder:text-zinc-700" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase ml-4">Código na TV</label>
              <input placeholder="SALA" value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} className="w-full bg-zinc-900 border-2 border-zinc-800 p-5 rounded-3xl text-3xl font-black text-center tracking-widest focus:border-green-500 outline-none transition-all placeholder:text-zinc-700" />
            </div>
          </div>
          
          <div className="space-y-3">
              <button onClick={() => entrarNaSala(false)} className="w-full bg-white text-black font-black py-6 rounded-full text-2xl shadow-[0_20px_40px_rgba(255,255,255,0.1)] active:scale-95 transition-all">ENTRAR NA SALA</button>
              
              {/* BOTÃO DE RECONNECT */}
              {name && roomCode && (
                  <button onClick={() => entrarNaSala(true)} className="w-full bg-green-500/10 text-green-500 border border-green-500/20 font-bold py-4 rounded-full text-sm active:scale-95 transition-all">RECONECTAR COMO {name}</button>
              )}
          </div>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-8">
        <h2 className="text-zinc-500 font-bold uppercase tracking-widest mb-4">Sala: {roomCode}</h2>
        <h1 className="text-4xl font-black mb-12">Olá, {name}!</h1>
        <button onClick={sinalizarPronto} className="w-full max-w-xs bg-green-500 text-black font-black py-6 rounded-full text-2xl animate-pulse shadow-[0_0_50px_rgba(34,197,94,0.3)]">ESTOU PRONTO</button>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col p-6 transition-all duration-700 ${gameState === 'challenge' ? 'bg-amber-500 justify-center text-center' : 'bg-zinc-950 justify-start'}`}>
      
      {gameState === 'waiting' && (
        <div className="flex-1 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
          <div className="w-16 h-16 border-4 border-zinc-800 border-t-green-500 rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-zinc-400 font-bold uppercase tracking-widest text-sm">Aguarde sua vez...</p>
          <div className="mt-8 flex justify-center gap-1">
             {[...Array(tokens)].map((_, i) => <div key={i} className="w-3 h-3 bg-amber-400 rounded-full" />)}
          </div>
        </div>
      )}

      {gameState === 'playing' && isMyTurn && (
        <div className="w-full max-w-md mx-auto animate-in slide-in-from-bottom duration-500 pb-20 mt-4">
          <p className="text-zinc-500 font-black text-xs uppercase tracking-widest mb-6 text-center">Encaixe a Música</p>
          <div className="flex flex-col gap-2">
            {timeline.map((track, i) => (
              <Fragment key={track.id}>
                {/* BOTÃO DO DUPLO CLIQUE ORIGINAL */}
                <button 
                  onClick={() => confirmarPosicao(i)}
                  onDoubleClick={() => enviarConfirmacaoFinal(i)}
                  className="w-full bg-zinc-900 border-2 border-dashed border-zinc-700 py-5 rounded-2xl text-zinc-500 font-black hover:border-green-500 hover:text-green-500 active:bg-green-500 active:text-black transition-all flex items-center justify-center gap-3 shadow-lg"
                >
                  <div className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center text-lg leading-none">+</div>
                </button>

                <div className="bg-zinc-800 rounded-2xl p-3 flex items-center gap-4 shadow-xl border border-zinc-700">
                  <div className="bg-white text-black font-black px-3 py-1.5 rounded-xl text-xl shadow-inner">{track.year}</div>
                  <img src={track.imageUrl} alt={track.name} className="w-16 h-16 rounded-xl object-cover shadow-md" />
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{track.name}</p>
                    <p className="text-[10px] text-zinc-400 truncate uppercase font-bold mt-1">{track.artist}</p>
                  </div>
                </div>
              </Fragment>
            ))}
            
            {/* ÚLTIMO BOTÃO DO DUPLO CLIQUE ORIGINAL */}
            <button 
              onClick={() => confirmarPosicao(timeline.length)}
              onDoubleClick={() => enviarConfirmacaoFinal(timeline.length)}
              className="w-full bg-zinc-900 border-2 border-dashed border-zinc-700 py-5 rounded-2xl text-zinc-500 font-black hover:border-green-500 hover:text-green-500 active:bg-green-500 active:text-black transition-all flex items-center justify-center gap-3 shadow-lg"
            >
              <div className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center text-lg leading-none">+</div>
            </button>
          </div>

          <div className="fixed bottom-0 left-0 w-full bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent p-6 pointer-events-none">
            <p className="text-[10px] text-zinc-400 font-bold uppercase text-center bg-zinc-900/90 backdrop-blur px-4 py-3 rounded-full border border-zinc-800 shadow-2xl mx-auto w-max pointer-events-auto">
              1 Toque = Testar na TV &nbsp;•&nbsp; 2 Toques = Confirmar
            </p>
          </div>
        </div>
      )}

      {gameState === 'challenge' && (
        <div className="w-full max-w-sm mx-auto flex flex-col items-center">
          <div className="mb-12">
            <h2 className="text-9xl font-black text-black leading-none">{challengeTimer}</h2>
            <p className="text-black font-black uppercase tracking-tighter text-xl mt-2">VOCÊ DISCORDA?</p>
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
        <div className="flex-1 flex items-center justify-center animate-bounce">
            <h2 className="text-5xl font-black text-white uppercase tracking-tighter italic">Olhe para a TV!</h2>
        </div>
      )}
    </div>
  );
}