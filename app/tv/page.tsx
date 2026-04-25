'use client';
import { useEffect, useState, useRef, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession, signIn, signOut } from 'next-auth/react';

interface Track { id: string; year: string; name: string; artist: string; imageUrl: string; isInitial?: boolean; }
interface Player { name: string; isReady: boolean; score: number; timeline: Track[]; tokens: number; }

// Componente do CD
const CompactDisc = ({ large = false }) => (
  <div className={`${large ? 'w-32 h-32 border-[12px]' : 'w-24 h-24 border-[8px]'} rounded-full border-zinc-950 bg-gradient-to-tr from-purple-900 via-fuchsia-700 to-violet-900 shadow-[0_0_30px_rgba(168,85,247,0.3)] animate-[spin_4s_linear_infinite] flex items-center justify-center relative overflow-hidden flex-shrink-0`}>
    <div className="absolute inset-0 bg-[conic-gradient(from_0deg,transparent,rgba(255,255,255,0.3),rgba(236,72,153,0.2),rgba(56,189,248,0.2),rgba(255,255,255,0.3),transparent)] opacity-70 pointer-events-none mix-blend-screen"></div>
    <div className={`${large ? 'w-8 h-8 border-2' : 'w-6 h-6 border-2'} rounded-full bg-zinc-950 border-zinc-800 z-10 shadow-inner`}></div>
  </div>
);

export default function TVPage() {
  const { data: session, status } = useSession();
  const [players, setPlayers] = useState<Player[]>([]);
  const [roomCode, setRoomCode] = useState<string>('');
  const [gameStarted, setGameStarted] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [usedTrackIds, setUsedTrackIds] = useState<Set<string>>(new Set());

  // Estados de Jogo
  const [gameState, setGameState] = useState<'lobby' | 'playing' | 'challenge' | 'winner'>('lobby');
  const [winner, setWinner] = useState<Player | null>(null);
  const [challengeTimer, setChallengeTimer] = useState(0);
  const [pendingMove, setPendingMove] = useState<{ slotIndex: number, playerIndex: number } | null>(null);

  const [deck, setDeck] = useState<Track[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [targetCard, setTargetCard] = useState<Track | null>(null);
  
  const [mobileAction, setMobileAction] = useState<number | null>(null); 
  const [actionState, setActionState] = useState<'waiting' | 'slotted' | 'revealed'>('waiting');
  const [revealSuccess, setRevealSuccess] = useState<boolean | null>(null);

  const channelRef = useRef<any>(null);

  useEffect(() => { setIsMounted(true); }, []);

  // --- LÓGICA DE SENHA PARA EDIÇÃO ---
  const irParaEdicao = () => {
    const senha = prompt("Digite a senha de editor:");
    if (senha === "1234") { // Mude sua senha aqui
        window.location.href = "/";
    } else {
        alert("Senha incorreta!");
    }
  };

  const getCorrectIndex = (timeline: Track[], targetYear: number) => {
    let index = 0;
    while (index < timeline.length && parseInt(timeline[index].year) <= targetYear) {
      index++;
    }
    return index;
  };

  const checkWinCondition = (updatedPlayers: Player[]) => {
    const winnerFound = updatedPlayers.find(p => p.score >= 10);
    if (winnerFound) {
      setWinner(winnerFound);
      setGameState('winner');
    }
  };

  // --- TIMER DO DESAFIO ---
  useEffect(() => {
    if (challengeTimer > 0) {
      const timer = setTimeout(() => setChallengeTimer(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    } else if (challengeTimer === 0 && gameState === 'challenge') {
      finalizarTurnoSemDesafio();
    }
  }, [challengeTimer, gameState]);

  // --- REALTIME ---
  useEffect(() => {
    if (!roomCode) return;
    const channel = supabase.channel(`room_${roomCode}`)
      .on('broadcast', { event: 'join' }, ({ payload }) => {
        setPlayers(prev => {
          if (prev.find(p => p.name === payload.name)) return prev;
          return [...prev, { name: payload.name, isReady: false, score: 0, timeline: [], tokens: 1 }];
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
        iniciarJanelaDesafio(payload.slotIndex, currentPlayerIndex);
      })
      .on('broadcast', { event: 'challenge-made' }, ({ payload }) => {
        processarDesafio(payload.challengerName);
      })
      .on('broadcast', { event: 'request-sync' }, ({ payload }) => {
        // Quando o mobile cai e clica em Reconectar, a TV devolve o estado atual
        const p = players.find(x => x.name === payload.name);
        if (p && gameStarted) {
            channel.send({
                type: 'broadcast', event: 'game-state',
                payload: { currentPlayer: players[currentPlayerIndex]?.name, playerTimeline: p.timeline, targetCard: targetCard }
            });
        }
      })

    channel.subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [roomCode, targetCard, players, currentPlayerIndex, gameState]);

  const iniciarJanelaDesafio = (slotIndex: number, playerIndex: number) => {
    setPendingMove({ slotIndex, playerIndex });
    setGameState('challenge');
    setChallengeTimer(5);
    pausarMusica();

    channelRef.current?.send({
      type: 'broadcast',
      event: 'open-challenge',
      payload: { 
        timer: 5,
        playersTokens: players.map(p => ({ name: p.name, tokens: p.tokens }))
      }
    });
  };

  const finalizarTurnoSemDesafio = () => {
    if (!pendingMove) return;
    resolverJogadaReal(pendingMove.slotIndex, pendingMove.playerIndex, null);
  };

  const processarDesafio = (challengerName: string) => {
    if (gameState !== 'challenge') return;
    setChallengeTimer(-1);
    resolverJogadaReal(pendingMove!.slotIndex, pendingMove!.playerIndex, challengerName);
  };

const resolverJogadaReal = (slotIndex: number, playerIndex: number, challengerName: string | null) => {
    const activePlayer = players[playerIndex];
    const targetYear = parseInt(targetCard!.year);
    
    let playerAcertou = true;
    if (slotIndex > 0 && parseInt(activePlayer.timeline[slotIndex - 1].year) > targetYear) playerAcertou = false;
    if (slotIndex < activePlayer.timeline.length && parseInt(activePlayer.timeline[slotIndex].year) < targetYear) playerAcertou = false;

    let novosJogadores = [...players];
    let acertouDeFato = false;

    if (challengerName) {
      const challengerIndex = novosJogadores.findIndex(p => p.name === challengerName);
      novosJogadores[challengerIndex].tokens -= 1;

        if (!playerAcertou && !challengerName) {
        pausarMusica(); // Para a música IMEDIATAMENTE no erro
        tocarSomErro();
    }
     else {
        // Desafiante perdeu a ficha, jogador ativo ganha
        acertouDeFato = true;
      }
    } else {
      if (playerAcertou) acertouDeFato = true;
    }
    setRevealSuccess(playerAcertou || !!challengerName);
    setRevealSuccess(acertouDeFato);
    setActionState('revealed');
    setGameState('playing'); // Sai do modo desafio

    if (!acertouDeFato) tocarSomErro();

    // MANDAR RESULTADO PROS MÓVEIS
    channelRef.current?.send({ 
      type: 'broadcast', 
      event: 'play-result', 
      payload: { success: acertouDeFato, actualYear: targetCard?.year } 
    });

    // AGUARDA A ANIMAÇÃO ANTES DE ATUALIZAR A TIMELINE (EVITA DUPLICAÇÃO)
    setTimeout(() => {
      let jogadoresAtualizados = [...novosJogadores];
      
      if (challengerName && !playerAcertou) {
        const cIdx = jogadoresAtualizados.findIndex(p => p.name === challengerName);
        const correctPos = getCorrectIndex(jogadoresAtualizados[cIdx].timeline, targetYear);
        jogadoresAtualizados[cIdx].timeline.splice(correctPos, 0, targetCard!);
        jogadoresAtualizados[cIdx].score += 1;
      } else if (playerAcertou) {
        jogadoresAtualizados[playerIndex].timeline.splice(slotIndex, 0, targetCard!);
        jogadoresAtualizados[playerIndex].score += 1;
      }

      setPlayers(jogadoresAtualizados);
      checkWinCondition(jogadoresAtualizados);

      if (gameState !== 'winner') {
        const next = (playerIndex + 1) % players.length;
        iniciarTurno(next, jogadoresAtualizados, deck);
      }
    }, 6000);
};

  // --- FUNÇÕES DE APOIO ---
  const criarSala = async () => {
    const { data } = await supabase.from('tracks').select('*');
    if (!data || data.length < 10) return alert("Acervo insuficiente!");
    setDeck(data.sort(() => Math.random() - 0.5));
    setRoomCode(Math.random().toString(36).substring(2, 6).toUpperCase());
  };

  const iniciarPartidaGlobal = () => {
    const currentDeck = [...deck];
    const initialPlayers = players.map(p => ({ ...p, timeline: [{ ...currentDeck.pop()!, isInitial: true }], tokens: 1 }));
    setPlayers(initialPlayers);
    setDeck(currentDeck);
    setGameStarted(true);
    setGameState('playing');
    iniciarTurno(0, initialPlayers, currentDeck);
  };

  const iniciarTurno = (playerIndex: number, currentPlayers: Player[], currentDeck: Track[]) => {
    setActionState('waiting');
    setRevealSuccess(null);
    setMobileAction(null);
const availableTracks = currentDeck.filter(t => !usedTrackIds.has(t.id));
  if (availableTracks.length < 1) return alert("Acervo esgotado!");
  
  const target = availableTracks.pop()!;
  setUsedTrackIds(prev => new Set(prev).add(target.id)); // Marca como usada
  
  setDeck(currentDeck.filter(t => t.id !== target.id));
  setCurrentPlayerIndex(playerIndex);
  setTargetCard(target);
  tocarMusica(target.id);
  
  // Garante que os dados (name, artist, imageUrl) vão no broadcast
  channelRef.current?.send({
    type: 'broadcast', event: 'game-state',
    payload: { 
      currentPlayer: currentPlayers[playerIndex].name, 
      playerTimeline: currentPlayers[playerIndex].timeline, 
      targetCard: target // Agora envia o objeto completo
    }
  });
};

  const tocarMusica = async (trackId: string, retryCount = 0) => {
    const token = (session as any)?.accessToken;
    if (!token) return;
    try {
      const devicesRes = await fetch('https://api.spotify.com/v1/me/player/devices', { headers: { 'Authorization': `Bearer ${token}` } });
      const devicesData = await devicesRes.json();
      const targetDevice = devicesData.devices?.find((d: any) => d.is_active) || devicesData.devices?.[0];
      
      if (!targetDevice) return;

      const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${targetDevice.id}`, {
        method: 'PUT', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: [`spotify:track:${trackId}`], position_ms: 40000 })
      });

      // Se o Spotify ignorar o play (erro 404/403), tenta de novo 1 segundo depois
      if (!res.ok && retryCount < 2) {
         setTimeout(() => tocarMusica(trackId, retryCount + 1), 1000);
      }
    } catch (e) {}
  };

  const pausarMusica = async () => {
    const token = (session as any)?.accessToken;
    if (!token) return;
    await fetch('https://api.spotify.com/v1/me/player/play?device_id=...', { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
  };

  const tocarSomErro = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc1 = audioCtx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(150, audioCtx.currentTime);
      const gainNode = audioCtx.createGain();
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      osc1.connect(gainNode); gainNode.connect(audioCtx.destination);
      osc1.start(); osc1.stop(audioCtx.currentTime + 1);
    } catch (e) {}
  };

  if (!isMounted) return null;

  // --- TELA DE VITORIA ---
  if (gameState === 'winner' && winner) {
    const ranking = [...players].sort((a, b) => b.score - a.score);
    return (
      <div className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col items-center justify-center overflow-hidden">
        <style jsx>{`
            @keyframes fall { 0% { transform: translateY(-10vh); } 100% { transform: translateY(110vh); } }
            .confetti { position: absolute; width: 10px; height: 10px; animation: fall 4s linear infinite; }
        `}</style>
        {[...Array(40)].map((_, i) => (
          <div key={i} className="confetti" style={{ 
            left: `${Math.random() * 100}%`, 
            animationDelay: `${Math.random() * 5}s`,
            backgroundColor: i % 2 === 0 ? '#22c55e' : '#a855f7'
          }} />
        ))}
        <div className="text-center mb-10">
          <h1 className="text-xl font-black text-zinc-500 uppercase tracking-widest">Campeão</h1>
          <h2 className="text-8xl font-black text-white">{winner.name}</h2>
        </div>
        <div className="flex items-end gap-4 h-64 mb-10">
          {ranking[1] && <div className="flex flex-col items-center"><span className="font-bold text-zinc-400">{ranking[1].name}</span><div className="w-24 bg-zinc-800 h-32 rounded-t-2xl flex items-center justify-center text-2xl font-black">2</div></div>}
          <div className="flex flex-col items-center"><span className="font-black text-green-500">{ranking[0].name}</span><div className="w-32 bg-white text-black h-48 rounded-t-2xl flex items-center justify-center text-5xl font-black">1</div></div>
          {ranking[2] && <div className="flex flex-col items-center"><span className="font-bold text-zinc-600">{ranking[2].name}</span><div className="w-24 bg-zinc-900 h-24 rounded-t-2xl flex items-center justify-center text-xl font-black">3</div></div>}
        </div>
        <div className="w-full max-w-sm space-y-2">
            {ranking.slice(3).map((p, i) => (
                <div key={i} className="flex justify-between p-3 bg-zinc-900 rounded-xl border border-zinc-800">
                    <span className="text-zinc-400">{i + 4}º {p.name}</span>
                    <span className="font-bold">{p.score} pts</span>
                </div>
            ))}
        </div>
        <button onClick={() => window.location.reload()} className="mt-10 bg-zinc-800 px-6 py-2 rounded-full font-bold">Novo Jogo</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-white font-sans overflow-hidden relative">
      {/* Background Mesh */}
      <div className="absolute inset-0 opacity-20 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-600 blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <style jsx>{`
        @keyframes dropIn { 0% { transform: translateY(-70vh) scale(0.5); opacity: 0; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
        .anim-drop { animation: dropIn 0.8s cubic-bezier(0.2, 0.8, 0.2, 1.05) forwards; }
        @keyframes flipIn { 0% { transform: rotateY(90deg) scale(0.9); opacity: 0; } 100% { transform: rotateY(0deg) scale(1); opacity: 1; } }
        .anim-flip { animation: flipIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* HEADER */}
      <div className="w-full bg-zinc-900/40 backdrop-blur-md px-8 py-4 flex justify-between items-center border-b border-zinc-800/50 z-50 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{session?.user?.name || 'Spotify'}</span>
        </div>
        <div className="flex items-center gap-6">
          <button onClick={irParaEdicao} className="text-[10px] bg-zinc-800 px-3 py-1 rounded hover:bg-zinc-700">EDITAR ACERVO</button>
          {roomCode && <span className="text-sm font-black text-white bg-zinc-800 px-4 py-1.5 rounded-full border border-zinc-700">SALA: {roomCode}</span>}
          <a href="https://hitsong.vercel.app/api/auth/callback/spotify" className="text-[10px] font-bold text-green-500 border border-green-500/20 px-3 py-1 rounded-md">RECONECTAR</a>
          <button onClick={() => signOut({ callbackUrl: '/tv' })} className="text-[10px] font-bold text-zinc-500">SAIR</button>
        </div>
      </div>

      {!gameStarted ? (
        <div className="flex-1 flex flex-col items-center justify-center p-10 z-10 text-center">
          {!roomCode ? (
            <button onClick={criarSala} className="bg-white text-black font-black text-3xl py-6 px-16 rounded-full shadow-2xl hover:scale-105 transition-transform">ABRIR NOVA SALA</button>
          ) : (
            <div className="w-full max-w-4xl">
              <h1 className="text-[10rem] leading-none font-black text-white mb-16 animate-pulse">{roomCode}</h1>
              <div className="grid grid-cols-2 gap-4">
                {players.map((p) => (
                  <div key={p.name} className={`p-4 rounded-2xl border-2 ${p.isReady ? 'border-green-500 bg-green-500/5' : 'border-zinc-800 bg-zinc-900/50'}`}>
                    <span className="text-2xl font-bold uppercase">{p.name}</span>
                  </div>
                ))}
              </div>
              {players.length > 0 && players.every(p => p.isReady) && (
                  <button onClick={iniciarPartidaGlobal} className="mt-10 bg-green-500 text-black font-black px-10 py-4 rounded-full text-xl">COMEÇAR</button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 relative overflow-hidden z-10">
          {/* PLACAR LATERAL */}
          <div className="w-28 bg-zinc-900/30 backdrop-blur-xl border-r border-zinc-800/50 flex flex-col items-center py-10 gap-6 z-40 flex-shrink-0">
            {players.map((p, i) => (
              <div key={i} className={`relative w-16 h-16 rounded-2xl flex flex-col items-center justify-center transition-all duration-500 ${i === currentPlayerIndex ? 'bg-white text-black scale-110' : 'bg-zinc-800/50 text-zinc-500'}`}>
                <span className="text-xs font-bold uppercase mb-[-2px]">{p.name.substring(0,3)}</span>
                <span className="text-2xl font-black">{p.score}</span>
                {/* Visual das Fichas */}
                <div className="absolute -bottom-2 flex gap-1">
                    {[...Array(p.tokens)].map((_, t) => <div key={t} className="w-2 h-2 bg-amber-400 rounded-full shadow-[0_0_5px_rgba(251,191,36,0.8)]" />)}
                </div>
              </div>
            ))}
          </div>

          <div className="flex-1 flex flex-col relative">
            {/* STATUS DO TURNO / DESAFIO */}
            <div className={`w-full py-8 text-center z-20 ${gameState === 'challenge' ? 'bg-amber-500 text-black' : actionState === 'revealed' ? (revealSuccess ? 'bg-green-600' : 'bg-red-600') : 'bg-transparent'}`}>
              <h1 className="text-5xl font-black uppercase tracking-tighter">
                {gameState === 'challenge' ? `DISCORDAR? (${challengeTimer}s)` : actionState === 'revealed' ? (revealSuccess ? 'ACERTOU!' : 'ERROU!') : `Vez de: ${players[currentPlayerIndex]?.name}`}
              </h1>
            </div>

            {actionState === 'waiting' && <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-10"><CompactDisc large /></div>}

            <div id="timeline-container" className="absolute bottom-0 w-full overflow-x-auto no-scrollbar pb-12 pt-40 z-10 scroll-smooth">
              <div className="flex items-end h-[24rem] w-max px-[40vw] gap-4 mx-auto">
                {players[currentPlayerIndex]?.timeline.map((track, i) => (
                  <Fragment key={track.id}>
                   <div id={`slot-${i}`} className={`flex flex-col items-center justify-end relative h-full transition-all duration-700 ${mobileAction === i ? 'w-64' : 'w-8'}`}>
                      {mobileAction === i && (
                        <div className={`absolute bottom-20 z-30 ${actionState === 'slotted' ? 'anim-drop' : ''} ${actionState === 'revealed' ? 'anim-flip' : ''}`}>
                          {actionState === 'revealed' ? (
                            <div className="flex flex-col items-center scale-110">
                              <div className="bg-white text-black font-black text-3xl px-6 py-1 rounded-full mb-[-1rem] z-20 shadow-2xl">{targetCard?.year}</div>
                              <img src={targetCard?.imageUrl} className="w-40 h-40 rounded-[2rem] border-4 border-zinc-500 object-cover" />
                              <div className="mt-4 text-center w-40"><p className="text-sm italic text-zinc-300">{targetCard?.name}</p><p className="text-xs font-bold text-zinc-500">{targetCard?.artist}</p></div>
                            </div>
                          ) : <CompactDisc />}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-center flex-shrink-0 z-20">
                      <div className="bg-zinc-100 text-black font-black text-3xl px-6 py-1 rounded-full mb-[-1rem] z-20">{track.year}</div>
                      <img src={track.imageUrl} className={`w-44 h-44 rounded-[2.5rem] border-4 ${track.isInitial ? 'border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.4)]' : 'border-zinc-800'}`} />
                      <div className="mt-4 text-center w-44"><p className="text-sm italic text-zinc-400">{track.name}</p><p className="text-xs font-bold text-zinc-600">{track.artist}</p></div>
                    </div>
                  </Fragment>
                ))}
                <div id={`slot-${players[currentPlayerIndex]?.timeline.length}`} className={`flex flex-col items-center justify-end relative h-full transition-all duration-700 ${mobileAction === players[currentPlayerIndex]?.timeline.length ? 'w-48' : 'w-4'}`}>
                  {mobileAction === players[currentPlayerIndex]?.timeline.length && (
                    <div className={`absolute bottom-20 z-30 ${actionState === 'slotted' ? 'anim-drop' : ''} ${actionState === 'revealed' ? 'anim-flip' : ''}`}>
                      {actionState === 'revealed' && revealSuccess ? (
                        <div className="flex flex-col items-center scale-110">
                          <div className="bg-white text-black font-black text-3xl px-6 py-1 rounded-full mb-[-1rem] z-20 shadow-2xl">{targetCard?.year}</div>
                          <img src={targetCard?.imageUrl} className="w-40 h-40 rounded-[2rem] border-4 border-green-500 shadow-2xl object-cover" />
                          {/* ESTA DIV ESTAVA FALTANDO NA ÚLTIMA CARTA! */}
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