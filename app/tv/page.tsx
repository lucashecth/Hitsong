'use client';
import { useEffect, useState, useRef, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession, signIn, signOut } from 'next-auth/react';

interface Track { id: string; year: string; name: string; artist: string; imageUrl: string; isInitial?: boolean; }
interface Player { name: string; isReady: boolean; score: number; timeline: Track[] } 

// CD Pequeno e Holográfico (Sem textos embaixo)
const CompactDisc = ({ large = false }) => (
  <div className={`${large ? 'w-32 h-32 border-[12px]' : 'w-24 h-24 border-[8px]'} rounded-full border-zinc-950 bg-gradient-to-tr from-purple-900 via-fuchsia-700 to-violet-900 shadow-[0_0_30px_rgba(168,85,247,0.3)] animate-[spin_4s_linear_infinite] flex items-center justify-center relative overflow-hidden flex-shrink-0`}>
    <div className="absolute inset-0 bg-[conic-gradient(from_0deg,transparent,rgba(255,255,255,0.3),rgba(236,72,153,0.2),rgba(56,189,248,0.2),rgba(255,255,255,0.3),transparent)] opacity-70 pointer-events-none mix-blend-screen"></div>
    <div className={`${large ? 'w-8 h-8 border-2' : 'w-6 h-6 border-2'} rounded-full bg-zinc-950 border-zinc-800 z-10 shadow-inner`}></div>
  </div>
);

const tocarSomErro = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc1 = audioCtx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 1.5);
    const osc2 = audioCtx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(155, audioCtx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(42, audioCtx.currentTime + 1.5);
    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.5);
    osc1.connect(gainNode); osc2.connect(gainNode); gainNode.connect(audioCtx.destination);
    osc1.start(); osc2.start();
    osc1.stop(audioCtx.currentTime + 1.5); osc2.stop(audioCtx.currentTime + 1.5);
  } catch (e) { console.error(e); }
};

export default function TVPage() {
  const { data: session, status } = useSession();
  const [players, setPlayers] = useState<Player[]>([]);
  const [roomCode, setRoomCode] = useState<string>('');
  const [gameStarted, setGameStarted] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const [deck, setDeck] = useState<Track[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [targetCard, setTargetCard] = useState<Track | null>(null);
  
  const [mobileAction, setMobileAction] = useState<number | null>(null); 
  const [actionState, setActionState] = useState<'waiting' | 'slotted' | 'revealed'>('waiting');
  const [revealSuccess, setRevealSuccess] = useState<boolean | null>(null);

  const channelRef = useRef<any>(null);

  useEffect(() => { setIsMounted(true); }, []);

const criarSala = async () => {
  // 1. Busca todas as músicas cadastradas por qualquer pessoa
  const { data: bancoDeMusicas, error } = await supabase
    .from('tracks')
    .select('*');

  if (error || !bancoDeMusicas || bancoDeMusicas.length < 10) {
    alert("O acervo global ainda está pequeno! Cadastre pelo menos 10 músicas.");
    return;
  }

  // 2. Embaralha o deck global
  const deckEmbaralhado = bancoDeMusicas.sort(() => Math.random() - 0.5);
  
  setDeck(deckEmbaralhado);
  setRoomCode(Math.random().toString(36).substring(2, 6).toUpperCase());
};

  useEffect(() => {
    if (!roomCode) return;
    const channel = supabase.channel(`room_${roomCode}`)
      .on('broadcast', { event: 'join' }, ({ payload }) => {
        setPlayers(prev => {
          if (prev.find(p => p.name === payload.name)) return prev;
          return [...prev, { name: payload.name, isReady: false, score: 0, timeline: [] }];
        });
      })
      .on('broadcast', { event: 'player-ready' }, ({ payload }) => {
        setPlayers(prev => prev.map(p => p.name === payload.name ? { ...p, isReady: true } : p));
      })
      .on('broadcast', { event: 'mobile-action' }, ({ payload }) => {
        setMobileAction(payload.slotIndex); 
        setActionState('slotted');
      })
      .on('broadcast', { event: 'confirm-play' }, ({ payload }) => {
        resolverJogada(payload.slotIndex);
      });

    channel.subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [roomCode, targetCard, players, currentPlayerIndex]);

  useEffect(() => {
    const allReady = players.length > 0 && players.every(p => p.isReady);
    if (allReady && !gameStarted && countdown === null) setCountdown(3);
  }, [players, gameStarted, countdown]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) { iniciarPartidaGlobal(); return; }
    const timer = setTimeout(() => setCountdown(prev => (prev !== null ? prev - 1 : null)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (mobileAction !== null) {
      setTimeout(() => {
        const slot = document.getElementById(`slot-${mobileAction}`);
        const container = document.getElementById('timeline-container');
        if (slot && container) {
          const scrollLeft = slot.offsetLeft - (container.clientWidth / 2) + (slot.clientWidth / 2);
          container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
        }
      }, 150);
    }
  }, [mobileAction]);

  const tocarMusica = async (trackId: string) => {
    const token = (session as any)?.accessToken;
    if (!token) return;
    try {
      const devicesRes = await fetch('https://api.spotify.com/v1/me/player/devices', { headers: { 'Authorization': `Bearer ${token}` } });
      const devicesData = await devicesRes.json();
      if (!devicesData.devices?.length) return;
      const targetDevice = devicesData.devices.find((d: any) => d.is_active) || devicesData.devices[0];
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${targetDevice.id}`, {
        method: 'PUT', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: [`spotify:track:${trackId}`], position_ms: 40000 })
      });
    } catch (e) {}
  };

  const pausarMusica = async () => {
    const token = (session as any)?.accessToken;
    if (!token) return;
    try { await fetch('https://api.spotify.com/v1/me/player/play?device_id=...', { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } }); } catch (e) {}
  };

  const iniciarPartidaGlobal = () => {
    const currentDeck = [...deck];
    const initialPlayers = players.map(p => {
      const firstCard = { ...currentDeck.pop()!, isInitial: true };
      return { ...p, timeline: [firstCard] };
    });
    setPlayers(initialPlayers);
    setDeck(currentDeck);
    setGameStarted(true);
    setCountdown(null);
    iniciarTurno(0, initialPlayers, currentDeck);
  };

  const iniciarTurno = (playerIndex: number, currentPlayers: Player[], currentDeck: Track[]) => {
    setActionState('waiting');
    setRevealSuccess(null);
    setMobileAction(null);
    if (currentDeck.length < 1) return;
    const target = currentDeck.pop()!;
    setDeck(currentDeck);
    setCurrentPlayerIndex(playerIndex);
    setTargetCard(target);
    tocarMusica(target.id);
    channelRef.current?.send({
      type: 'broadcast', event: 'game-state',
      payload: { currentPlayer: currentPlayers[playerIndex].name, playerTimeline: currentPlayers[playerIndex].timeline, targetCard: { id: target.id } }
    });
  };

  const resolverJogada = (slotIndex: number) => {
    if (!targetCard) return;
    const currentPlayer = players[currentPlayerIndex];
    const pTimeline = currentPlayer.timeline;
    const targetYear = parseInt(targetCard.year);
    let acertou = true;
    
    if (slotIndex > 0 && parseInt(pTimeline[slotIndex - 1].year) > targetYear) acertou = false;
    if (slotIndex < pTimeline.length && parseInt(pTimeline[slotIndex].year) < targetYear) acertou = false;

    setActionState('revealed');
    setRevealSuccess(acertou);
    
    if (!acertou) {
      pausarMusica();
      tocarSomErro();
    }

    channelRef.current?.send({ type: 'broadcast', event: 'play-result', payload: { success: acertou, actualYear: targetCard.year } });

    setTimeout(() => {
      let novosJogadores = [...players];
      if (acertou) {
        const novaTimeline = [...pTimeline];
        novaTimeline.splice(slotIndex, 0, targetCard);
        novosJogadores[currentPlayerIndex] = { ...currentPlayer, score: currentPlayer.score + 1, timeline: novaTimeline };
        setPlayers(novosJogadores);
      }
      const nextPlayer = (currentPlayerIndex + 1) % players.length;
      iniciarTurno(nextPlayer, novosJogadores, deck);
    }, 6000); 
  };

  if (!isMounted) return null;

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-white font-sans overflow-hidden relative">
      
      {/* Background Mesh (Apple Style) */}
      <div className="absolute inset-0 opacity-20 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-600 blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <style jsx>{`
        @keyframes dropIn { 0% { transform: translateY(-70vh) scale(0.5); opacity: 0; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
        .anim-drop { animation: dropIn 0.8s cubic-bezier(0.2, 0.8, 0.2, 1.05) forwards; }
        @keyframes fallOut { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(15deg); opacity: 0; } }
        .anim-fall { animation: fallOut 0.7s cubic-bezier(0.4, 0, 1, 1) forwards; }
        @keyframes flipIn { 0% { transform: rotateY(90deg) scale(0.9); opacity: 0; } 100% { transform: rotateY(0deg) scale(1); opacity: 1; } }
        .anim-flip { animation: flipIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* HEADER FIXO */}
      <div className="w-full bg-zinc-900/40 backdrop-blur-md px-8 py-4 flex justify-between items-center border-b border-zinc-800/50 z-50 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{session?.user?.name || 'Spotify'}</span>
        </div>
        <div className="flex items-center gap-6">
          {roomCode && <span className="text-sm font-black text-white bg-zinc-800 px-4 py-1.5 rounded-full border border-zinc-700">SALA: {roomCode}</span>}
          
          {/* BOTÃO DE RECONEXÃO (URL SOLICITADA) */}
          <a href="https://hitsong.vercel.app/api/auth/callback/spotify" className="text-[10px] font-bold bg-green-500/10 text-green-500 border border-green-500/20 px-3 py-1 rounded-md hover:bg-green-500 hover:text-black transition-all">RECONECTAR</a>
          
          <button onClick={() => signOut({ callbackUrl: '/tv' })} className="text-[10px] font-bold text-zinc-500 hover:text-white transition-colors">SAIR</button>
        </div>
      </div>

      {!gameStarted ? (
        <div className="flex-1 flex flex-col items-center justify-center p-10 z-10 text-center">
          {!roomCode ? (
            <button onClick={criarSala} className="bg-white text-black font-black text-3xl py-6 px-16 rounded-full shadow-2xl hover:scale-105 transition-transform">ABRIR NOVA SALA</button>
          ) : (
            <div className="w-full max-w-4xl">
              <h1 className="text-[10rem] leading-none font-black text-white mb-16 tracking-tighter animate-pulse">{roomCode}</h1>
              <div className="grid grid-cols-2 gap-4">
                {players.map((p) => (
                  <div key={p.name} className={`p-4 rounded-2xl border-2 ${p.isReady ? 'border-green-500 bg-green-500/5' : 'border-zinc-800 bg-zinc-900/50'}`}>
                    <span className="text-2xl font-bold uppercase">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 relative overflow-hidden z-10">
          
          <div className="w-28 bg-zinc-900/30 backdrop-blur-xl border-r border-zinc-800/50 flex flex-col items-center py-10 gap-6 z-40 flex-shrink-0">
            {players.map((p, i) => (
              <div key={i} className={`relative w-16 h-16 rounded-2xl flex flex-col items-center justify-center transition-all duration-500 ${i === currentPlayerIndex ? 'bg-white text-black scale-110 shadow-2xl' : 'bg-zinc-800/50 text-zinc-500'}`}>
                <span className="text-xs font-bold opacity-60 uppercase mb-[-2px]">{p.name.substring(0,3)}</span>
                <span className="text-2xl font-black">{p.score}</span>
              </div>
            ))}
          </div>

          <div className="flex-1 flex flex-col relative overflow-hidden">
            <div className={`w-full py-8 text-center transition-all duration-700 z-20 flex-shrink-0 ${actionState === 'revealed' ? (revealSuccess ? 'bg-green-600 shadow-[0_20px_50px_rgba(22,163,74,0.3)]' : 'bg-red-600 shadow-[0_20px_50px_rgba(220,38,38,0.3)]') : 'bg-transparent'}`}>
              <h1 className="text-5xl font-black uppercase tracking-tighter">
                {actionState === 'revealed' ? (revealSuccess ? `ACERTOU, ${players[currentPlayerIndex]?.name}!` : `ERROU, ${players[currentPlayerIndex]?.name}!`) : `Vez de: ${players[currentPlayerIndex]?.name}`}
              </h1>
            </div>

            {actionState === 'waiting' && (
              <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10">
                <CompactDisc large />
              </div>
            )}

            <div id="timeline-container" className="absolute bottom-0 w-full overflow-x-auto no-scrollbar pb-12 pt-40 z-10 scroll-smooth">
              <div className="flex items-end h-[24rem] w-max px-[40vw] gap-4 mx-auto">
                
                {players[currentPlayerIndex]?.timeline.map((track, i) => (
                  <Fragment key={track.id}>
                    <div id={`slot-${i}`} className={`flex flex-col items-center justify-end relative h-full transition-all duration-700 ${mobileAction === i ? 'w-48' : 'w-4'}`}>
                      {mobileAction === i && (
                        <div className={`absolute bottom-20 z-30 ${actionState === 'slotted' ? 'anim-drop' : ''} ${actionState === 'revealed' && revealSuccess ? 'anim-flip' : ''} ${actionState === 'revealed' && !revealSuccess ? 'anim-fall' : ''}`}>
                          {actionState === 'revealed' && revealSuccess ? (
                            <div className="flex flex-col items-center scale-110">
                              <div className="bg-white text-black font-black text-3xl px-6 py-1 rounded-full mb-[-1rem] z-20 shadow-2xl">{targetCard?.year}</div>
                              <img src={targetCard?.imageUrl} className="w-40 h-40 rounded-[2rem] border-4 border-green-500 shadow-2xl object-cover" />
                              <div className="mt-4 text-center w-40">
                                 <p className="text-base italic text-zinc-300 truncate px-2">{targetCard?.name}</p>
                                 <p className="text-xs font-bold text-zinc-600 truncate uppercase tracking-tighter">{targetCard?.artist}</p>
                              </div>
                            </div>
                          ) : (
                            <CompactDisc />
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-center flex-shrink-0 z-20 group">
                      <div className="bg-zinc-100 text-black font-black text-3xl px-6 py-1 rounded-full mb-[-1rem] z-20 shadow-xl">{track.year}</div>
                      <img src={track.imageUrl} className={`w-44 h-44 rounded-[2.5rem] border-4 shadow-2xl object-cover transition-all ${track.isInitial ? 'border-amber-400 shadow-[0_0_40px_rgba(251,191,36,0.3)]' : 'border-zinc-800'}`} />
                      <div className="mt-4 text-center w-44">
                         <p className="text-base italic text-zinc-400 truncate px-2">{track.name}</p>
                         <p className="text-xs font-bold text-zinc-600 truncate uppercase tracking-tighter">{track.artist}</p>
                      </div>
                    </div>
                  </Fragment>
                ))}

                <div id={`slot-${players[currentPlayerIndex]?.timeline.length}`} className={`flex flex-col items-center justify-end relative h-full transition-all duration-700 ${mobileAction === players[currentPlayerIndex]?.timeline.length ? 'w-48' : 'w-4'}`}>
                  {mobileAction === players[currentPlayerIndex]?.timeline.length && (
                    <div className={`absolute bottom-20 z-30 ${actionState === 'slotted' ? 'anim-drop' : ''} ${actionState === 'revealed' && revealSuccess ? 'anim-flip' : ''} ${actionState === 'revealed' && !revealSuccess ? 'anim-fall' : ''}`}>
                      {actionState === 'revealed' && revealSuccess ? (
                        <div className="flex flex-col items-center scale-110">
                          <div className="bg-white text-black font-black text-3xl px-6 py-1 rounded-full mb-[-1rem] z-20 shadow-2xl">{targetCard?.year}</div>
                          <img src={targetCard?.imageUrl} className="w-40 h-40 rounded-[2rem] border-4 border-green-500 shadow-2xl object-cover" />
                          <div className="mt-4 text-center w-40">
                             <p className="text-base italic text-zinc-300 truncate px-2">{targetCard?.name}</p>
                             <p className="text-xs font-bold text-zinc-600 truncate uppercase tracking-tighter">{targetCard?.artist}</p>
                          </div>
                        </div>
                      ) : (
                        <CompactDisc />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}