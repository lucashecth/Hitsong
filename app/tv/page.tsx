'use client';
import { useEffect, useState, useRef, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession, signOut } from 'next-auth/react';

interface Track { id: string; year: string; name: string; artist: string; imageUrl: string; isInitial?: boolean; }
interface Player { name: string; isReady: boolean; score: number; timeline: Track[]; tokens: number; }

const CompactDisc = ({ large = false }) => (
  <div className={`${large ? 'w-32 h-32 border-[12px]' : 'w-24 h-24 border-[8px]'} rounded-full border-zinc-950 bg-gradient-to-tr from-purple-900 via-fuchsia-700 to-violet-900 shadow-[0_0_30px_rgba(168,85,247,0.3)] animate-[spin_4s_linear_infinite] flex items-center justify-center relative overflow-hidden flex-shrink-0`}>
    <div className="absolute inset-0 bg-[conic-gradient(from_0deg,transparent,rgba(255,255,255,0.3),rgba(236,72,153,0.2),rgba(56,189,248,0.2),rgba(255,255,255,0.3),transparent)] opacity-70 pointer-events-none mix-blend-screen"></div>
    <div className={`${large ? 'w-8 h-8 border-2' : 'w-6 h-6 border-2'} rounded-full bg-zinc-950 border-zinc-800 z-10 shadow-inner`}></div>
  </div>
);

export default function TVPage() {
  const { data: session } = useSession();
  const [players, setPlayers] = useState<Player[]>([]);
  const [roomCode, setRoomCode] = useState<string>('');
  const [gameStarted, setGameStarted] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  const [usedTrackIds, setUsedTrackIds] = useState<Set<string>>(new Set());
  const [brokenTracks, setBrokenTracks] = useState<string[]>([]); 

  // Novos Estados da Árvore de Decisão do Bônus
  const [gameState, setGameState] = useState<'lobby' | 'playing' | 'challenge' | 'bonus_ask' | 'bonus_vote' | 'winner'>('lobby');
  const [winner, setWinner] = useState<Player | null>(null);
  const [challengeTimer, setChallengeTimer] = useState(0); // Usado para todos os timers
  const [pendingMove, setPendingMove] = useState<{ slotIndex: number, playerIndex: number } | null>(null);
  const [votes, setVotes] = useState<{ name: string, vote: boolean }[]>([]);

  const [deck, setDeck] = useState<Track[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [targetCard, setTargetCard] = useState<Track | null>(null);
  
  const [mobileAction, setMobileAction] = useState<number | null>(null); 
  const [actionState, setActionState] = useState<'waiting' | 'slotted' | 'revealed'>('waiting');
  const [revealSuccess, setRevealSuccess] = useState<boolean | null>(null);
  const [statusText, setStatusText] = useState<string>(''); 

  const channelRef = useRef<any>(null);
  const resolvingRef = useRef(false); 
  const spotifyCheckRef = useRef<NodeJS.Timeout | null>(null);
  const stateRef = useRef({ players, currentPlayerIndex, targetCard, gameStarted, gameState, pendingMove, deck, usedTrackIds, votes });
  
  useEffect(() => {
    stateRef.current = { players, currentPlayerIndex, targetCard, gameStarted, gameState, pendingMove, deck, usedTrackIds, votes };
  });
  
  useEffect(() => { setIsMounted(true); }, []);

  const irParaEdicao = () => {
    const senha = prompt("Digite a senha de editor:");
    if (senha === "1234") window.location.href = "/";
    else alert("Senha incorreta!");
  };

  const getCorrectIndex = (timeline: Track[], targetYear: number) => {
    let index = 0;
    while (index < timeline.length && parseInt(timeline[index].year) <= targetYear) index++;
    return index;
  };

  const checkWinCondition = (updatedPlayers: Player[]) => {
    const winnerFound = updatedPlayers.find(p => p.score >= 10);
    if (winnerFound) {
      setWinner(winnerFound);
      setGameState('winner');
    }
  };

  // Gerenciador Universal de Timers (Desafio, Bônus, Votação)
  useEffect(() => {
    if (challengeTimer > 0) {
      const timer = setTimeout(() => setChallengeTimer(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    } else if (challengeTimer === 0) {
      if (gameState === 'challenge') {
        const { pendingMove } = stateRef.current;
        if (pendingMove) resolverJogadaReal(pendingMove.slotIndex, pendingMove.playerIndex, null);
      } else if (gameState === 'bonus_ask') {
        setGameState('playing');
        revelarEPassarVez(stateRef.current.pendingMove!, true, false);
      } else if (gameState === 'bonus_vote') {
        processarVotosBonus();
      }
    }
  }, [challengeTimer, gameState]);

  // Câmera Perfeita
  useEffect(() => {
    if (mobileAction !== null) {
      const focarCamera = () => {
        const slot = document.getElementById(`slot-${mobileAction}`);
        const container = document.getElementById('timeline-container');
        if (slot && container) {
          const scrollLeft = slot.offsetLeft - (container.clientWidth / 2) + (slot.clientWidth / 2);
          container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
        }
      };
      setTimeout(focarCamera, 100); 
      setTimeout(focarCamera, 700); 
    }
  }, [mobileAction]);

  // Antena Realtime Blindada
  useEffect(() => {
    if (!roomCode) return;
    const channel = supabase.channel(`room_${roomCode}`)
      .on('broadcast', { event: 'join' }, ({ payload }) => {
        setPlayers(prev => prev.find(p => p.name === payload.name) ? prev : [...prev, { name: payload.name, isReady: false, score: 0, timeline: [], tokens: 1 }]);
      })
      .on('broadcast', { event: 'player-ready' }, ({ payload }) => {
        setPlayers(prev => prev.map(p => p.name === payload.name ? { ...p, isReady: true } : p));
      })
      .on('broadcast', { event: 'mobile-action' }, ({ payload }) => {
        setMobileAction(payload.slotIndex); 
        setActionState('slotted');
      })
      .on('broadcast', { event: 'confirm-play' }, ({ payload }) => {
        const { currentPlayerIndex, players } = stateRef.current;
        setPendingMove({ slotIndex: payload.slotIndex, playerIndex: currentPlayerIndex });
        setGameState('challenge');
        setChallengeTimer(5);
        channel.send({ type: 'broadcast', event: 'open-challenge', payload: { timer: 5, playersTokens: players.map(p => ({ name: p.name, tokens: p.tokens })) } });
      })
      .on('broadcast', { event: 'challenge-made' }, ({ payload }) => {
        if (stateRef.current.gameState !== 'challenge' || !stateRef.current.pendingMove) return;
        setChallengeTimer(-1);
        resolverJogadaReal(stateRef.current.pendingMove.slotIndex, stateRef.current.pendingMove.playerIndex, payload.challengerName);
      })
      // Novos Eventos de Bônus
      .on('broadcast', { event: 'bonus-response' }, ({ payload }) => {
        if (stateRef.current.gameState !== 'bonus_ask') return;
        setChallengeTimer(-1);
        if (payload.knows) {
          setGameState('bonus_vote');
          setChallengeTimer(7);
          setVotes([]);
          channel.send({ type: 'broadcast', event: 'start-voting', payload: { playerName: stateRef.current.players[stateRef.current.currentPlayerIndex].name } });
        } else {
          setGameState('playing');
          revelarEPassarVez(stateRef.current.pendingMove!, true, false);
        }
      })
      .on('broadcast', { event: 'vote-cast' }, ({ payload }) => {
        if (stateRef.current.gameState !== 'bonus_vote') return;
        setVotes(prev => [...prev.filter(v => v.name !== payload.name), { name: payload.name, vote: payload.vote }]);
      })
      .on('broadcast', { event: 'request-sync' }, ({ payload }) => {
        const { players, currentPlayerIndex, targetCard, gameStarted } = stateRef.current;
        const p = players.find(x => x.name === payload.name);
        if (p && gameStarted) {
            channel.send({ type: 'broadcast', event: 'game-state', payload: { currentPlayer: players[currentPlayerIndex]?.name, playerTimeline: p.timeline, targetCard: targetCard } });
        }
      });

    channel.subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [roomCode]); 

  // Trava Anti-Duplicação e Árvore de Decisão
  const resolverJogadaReal = (slotIndex: number, playerIndex: number, challengerName: string | null) => {
    if (resolvingRef.current) return; 
    resolvingRef.current = true;

    const { players, targetCard } = stateRef.current; 
    const activePlayer = players[playerIndex];
    const targetYear = parseInt(targetCard!.year);
    
    let playerAcertou = true;
    if (slotIndex > 0 && parseInt(activePlayer.timeline[slotIndex - 1].year) > targetYear) playerAcertou = false;
    if (slotIndex < activePlayer.timeline.length && parseInt(activePlayer.timeline[slotIndex].year) < targetYear) playerAcertou = false;

    // Se acertou a posição e ninguém desafiou -> Vai para a Fase Bônus!
    if (playerAcertou && !challengerName) {
      resolvingRef.current = false; // Destrava para poder processar o bônus depois
      setGameState('bonus_ask');
      setChallengeTimer(5);
      channelRef.current?.send({ type: 'broadcast', event: 'ask-bonus', payload: { trackId: targetCard?.id } });
      return;
    }

    revelarEPassarVez({ slotIndex, playerIndex }, playerAcertou, !!challengerName, challengerName);
  };

  const processarVotosBonus = () => {
    const { votes, players } = stateRef.current;
    const sim = votes.filter(v => v.vote).length;
    const nao = votes.filter(v => !v.vote).length;
    const ganhouFicha = sim > nao;

    if (ganhouFicha) {
        setPlayers(prev => prev.map((p, i) => i === stateRef.current.currentPlayerIndex ? { ...p, tokens: p.tokens + 1 } : p));
        setStatusText(`PÚBLICO APROVOU! +1 FICHA PARA ${players[stateRef.current.currentPlayerIndex].name}`);
    } else {
        setStatusText("O PÚBLICO NEGOU SEU BÔNUS!");
    }

    setGameState('playing');
    setTimeout(() => {
        revelarEPassarVez(stateRef.current.pendingMove!, true, false);
    }, 2500);
  };

  const revelarEPassarVez = ({ slotIndex, playerIndex }: {slotIndex: number, playerIndex: number}, playerAcertou: boolean, isChallenge: boolean, challengerName?: string | null) => {
    const { players, targetCard } = stateRef.current;
    let msg = "";
    let finalSuccess = false;

    if (isChallenge) {
        const cIdx = players.findIndex(p => p.name === challengerName);
        setPlayers(prev => prev.map((p, i) => i === cIdx ? { ...p, tokens: p.tokens - 1 } : p)); // Cobra a ficha
        if (!playerAcertou) { msg = `${challengerName} ROUBOU A CARTA!`; finalSuccess = true; }
        else { msg = `DESAFIO DE ${challengerName} FALHOU!`; finalSuccess = false; }
    } else {
        msg = playerAcertou ? "ACERTOU!" : "ERROU!";
        finalSuccess = playerAcertou;
    }

    // Se veio de um bônus, não sobrescreve o texto de quem ganhou a ficha imediatamente
    if (stateRef.current.gameState !== 'bonus_vote') setStatusText(msg);
    
    if (!playerAcertou && !isChallenge) { pausarMusica(); tocarSomErro(); }
    setRevealSuccess(finalSuccess);
    setActionState('revealed');

    channelRef.current?.send({ type: 'broadcast', event: 'play-result', payload: { success: finalSuccess, actualYear: targetCard?.year } });

    setTimeout(() => {
      let novosJogadores = [...stateRef.current.players];
      if (isChallenge && !playerAcertou) {
        const cIdx = novosJogadores.findIndex(p => p.name === challengerName);
        novosJogadores[cIdx] = { ...novosJogadores[cIdx], timeline: [...novosJogadores[cIdx].timeline] };
        const pos = getCorrectIndex(novosJogadores[cIdx].timeline, parseInt(targetCard!.year));
        novosJogadores[cIdx].timeline.splice(pos, 0, targetCard!);
        novosJogadores[cIdx].score += 1;
      } else if (playerAcertou) {
        novosJogadores[playerIndex] = { ...novosJogadores[playerIndex], timeline: [...novosJogadores[playerIndex].timeline] };
        novosJogadores[playerIndex].timeline.splice(slotIndex, 0, targetCard!);
        novosJogadores[playerIndex].score += 1;
      }

      setPlayers(novosJogadores);
      
      if (novosJogadores.some(p => p.score >= 10)) {
        setWinner(novosJogadores.find(p => p.score >= 10)!);
        setGameState('winner');
      } else {
        iniciarTurno((playerIndex + 1) % players.length, novosJogadores);
      }
    }, 6000);
  };

  // Algoritmo Fisher-Yates Original
  const criarSala = async () => {
    const { data } = await supabase.from('tracks').select('*');
    if (!data || data.length < 10) return alert("Acervo insuficiente!");
    
    let shuffled = [...data];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    setDeck(shuffled);
    setRoomCode(Math.random().toString(36).substring(2, 6).toUpperCase());
  };

  const iniciarPartidaGlobal = () => {
    const currentDeck = [...deck];
    const newUsed = new Set<string>(); 
    
    const initialPlayers = players.map(p => {
        const initialTrack = currentDeck.pop()!;
        newUsed.add(initialTrack.id);
        return { ...p, timeline: [{ ...initialTrack, isInitial: true }], tokens: 1 };
    });
    
    setUsedTrackIds(newUsed);
    setPlayers(initialPlayers);
    setDeck(currentDeck);
    setGameStarted(true);
    setGameState('playing');
    
    setTimeout(() => iniciarTurno(0, initialPlayers), 500); 
  };

  const iniciarTurno = (playerIndex: number = stateRef.current.currentPlayerIndex, currentPlayers?: Player[]) => {
    resolvingRef.current = false; 
    setActionState('waiting');
    setRevealSuccess(null);
    setMobileAction(null);
    setStatusText(''); 

    const { deck, usedTrackIds } = stateRef.current; 
    const playersToUse = currentPlayers || stateRef.current.players;

    const availableTracks = deck.filter(t => !usedTrackIds.has(t.id));
    if (availableTracks.length < 1) return alert("Acervo esgotado!");
    
    const target = availableTracks.pop()!;
    setUsedTrackIds(prev => new Set(prev).add(target.id)); 
    setDeck(deck.filter(t => t.id !== target.id));
    setCurrentPlayerIndex(playerIndex);
    setTargetCard(target);
    tocarMusica(target.id);
    
    channelRef.current?.send({
      type: 'broadcast', event: 'game-state',
      payload: { currentPlayer: playersToUse[playerIndex].name, playerTimeline: playersToUse[playerIndex].timeline, targetCard: target }
    });
  };

  const lidarComMusicaQuebrada = async (trackId: string) => {
    setBrokenTracks(prev => [...prev, trackId]);
    setStatusText("ERRO DE CARREGAMENTO NO SPOTIFY. PULANDO...");
    setActionState('revealed'); 
    try { await supabase.from('tracks').update({ is_broken: true }).eq('id', trackId); } catch(e) {}
    setTimeout(() => iniciarTurno(stateRef.current.currentPlayerIndex), 3000);
  };

  // Monitor de Silêncio do Spotify (Liniker Fix)
  const tocarMusica = async (trackId: string, retryCount = 0) => {
    const token = (session as any)?.accessToken;
    if (!token) return;

    if (spotifyCheckRef.current) clearTimeout(spotifyCheckRef.current);

    try {
      const devicesRes = await fetch('https://api.spotify.com/v1/me/player/devices', { headers: { 'Authorization': `Bearer ${token}` } });
      const devicesData = await devicesRes.json();
      const targetDevice = devicesData.devices?.find((d: any) => d.is_active) || devicesData.devices?.[0];
      
      if (!targetDevice) {
         if (retryCount < 2) setTimeout(() => tocarMusica(trackId, retryCount + 1), 1500);
         else lidarComMusicaQuebrada(trackId);
         return;
      }

      const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${targetDevice.id}`, {
        method: 'PUT', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: [`spotify:track:${trackId}`], position_ms: 35000 })
      });

      if (res.status === 401 || res.status === 403) {
          setStatusText("SPOTIFY DESCONECTADO. RECARREGUE A TV!");
          setActionState('revealed');
          return;
      }

      if (!res.ok) {
          if (retryCount < 2) return setTimeout(() => tocarMusica(trackId, retryCount + 1), 1500);
          return lidarComMusicaQuebrada(trackId);
      }

      // Verificação dupla se a música realmente começou a tocar
      spotifyCheckRef.current = setTimeout(async () => {
        try {
            const check = await fetch('https://www.google.com/search?q=https://api.spotify.com/v1/playlists/%24', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await check.json();
            if (!data || !data.is_playing || !data.item || data.item.id !== trackId) {
                lidarComMusicaQuebrada(trackId);
            }
        } catch(e) {}
      }, 3000);

    } catch (e) {
        if (retryCount < 2) setTimeout(() => tocarMusica(trackId, retryCount + 1), 1500);
        else lidarComMusicaQuebrada(trackId);
    }
  };

  const pausarMusica = async () => {
    const token = (session as any)?.accessToken;
    if (!token) return;
    await fetch('https://api.spotify.com/v1/me/player/pause', { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
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

  if (gameState === 'winner' && winner) {
    const ranking = [...players].sort((a, b) => b.score - a.score);
    return (
      <div className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col items-center justify-center overflow-hidden">
        <style jsx>{`
            @keyframes fall { 0% { transform: translateY(-10vh); } 100% { transform: translateY(110vh); } }
            .confetti { position: absolute; width: 10px; height: 10px; animation: fall 4s linear infinite; }
        `}</style>
        {[...Array(40)].map((_, i) => (
          <div key={i} className="confetti" style={{ left: `${Math.random() * 100}%`, animationDelay: `${Math.random() * 5}s`, backgroundColor: i % 2 === 0 ? '#22c55e' : '#a855f7' }} />
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
          {brokenTracks.length > 0 && <span className="text-[10px] text-red-500 font-bold border border-red-500/20 px-2 py-1 rounded">Backlog: {brokenTracks.length}</span>}
          <button onClick={irParaEdicao} className="text-[10px] bg-zinc-800 px-3 py-1 rounded hover:bg-zinc-700">EDITAR ACERVO</button>
          {roomCode && <span className="text-sm font-black text-white bg-zinc-800 px-4 py-1.5 rounded-full border border-zinc-700">SALA: {roomCode}</span>}
          <a href="https://hitsong.vercel.app/api/auth/callback/spotify" className="text-[10px] font-bold text-green-500 border border-green-500/20 px-3 py-1 rounded-md">RECONECTAR SPOTIFY</a>
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
          
          <div className="w-28 bg-zinc-900/30 backdrop-blur-xl border-r border-zinc-800/50 flex flex-col items-center py-10 gap-6 z-40 flex-shrink-0">
            {players.map((p, i) => (
              <div key={i} className={`relative w-16 h-16 rounded-2xl flex flex-col items-center justify-center transition-all duration-500 ${i === currentPlayerIndex ? 'bg-white text-black scale-110' : 'bg-zinc-800/50 text-zinc-500'}`}>
                <span className="text-xs font-bold uppercase mb-[-2px]">{p.name.substring(0,3)}</span>
                <span className="text-2xl font-black">{p.score}</span>
                <div className="absolute -bottom-2 flex gap-1">
                    {[...Array(p.tokens)].map((_, t) => <div key={t} className="w-2 h-2 bg-amber-400 rounded-full shadow-[0_0_5px_rgba(251,191,36,0.8)]" />)}
                </div>
              </div>
            ))}
          </div>

          <div className="flex-1 flex flex-col relative">
            <div className={`w-full py-8 text-center z-20 transition-colors duration-500 ${gameState === 'challenge' ? 'bg-amber-500 text-black' : gameState === 'bonus_ask' || gameState === 'bonus_vote' ? 'bg-blue-600 text-white shadow-lg' : actionState === 'revealed' ? (revealSuccess ? 'bg-green-600' : 'bg-red-600') : 'bg-transparent'}`}>
              <h1 className="text-5xl font-black uppercase tracking-tighter">
                {gameState === 'challenge' ? `DISCORDAR? (${challengeTimer}s)` : gameState === 'bonus_ask' ? `SABE O NOME DA MÚSICA? (${challengeTimer}s)` : gameState === 'bonus_vote' ? `VOTAÇÃO PÚBLICA! (${challengeTimer}s)` : actionState === 'revealed' ? statusText : `Vez de: ${players[currentPlayerIndex]?.name}`}
              </h1>
            </div>

            {actionState === 'waiting' && <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-10"><CompactDisc large /></div>}

            <div id="timeline-container" className="absolute bottom-0 w-full overflow-x-auto no-scrollbar pb-12 pt-40 z-10 scroll-smooth">
              <div className="flex items-end h-[24rem] w-max gap-4 mx-auto">
                
                <div className="w-[40vw] flex-shrink-0 pointer-events-none"></div>

                {players[currentPlayerIndex]?.timeline.map((track, i) => (
                  <Fragment key={track.id}>
                    <div id={`slot-${i}`} className={`flex flex-col items-center justify-end relative h-full transition-all duration-700 ${mobileAction === i ? 'w-64' : 'w-4'}`}>
                      {mobileAction === i && (
                        <div className={`absolute bottom-20 z-30 ${actionState === 'slotted' ? 'anim-drop' : ''} ${actionState === 'revealed' ? 'anim-flip' : ''}`}>
                          {actionState === 'revealed' ? (
                            <div className="flex flex-col items-center scale-110">
                              <div className="bg-white text-black font-black text-3xl px-6 py-1 rounded-full mb-[-1rem] z-20 shadow-2xl">{targetCard?.year}</div>
                              <div className={`rounded-[2rem] border-4 overflow-hidden transition-all shadow-2xl ${revealSuccess ? 'border-green-500 shadow-[0_0_40px_rgba(34,197,94,0.4)]' : 'border-red-600 shadow-[0_0_40px_rgba(220,38,38,0.6)]'}`}>
                                <img src={targetCard?.imageUrl} className={`w-40 h-40 object-cover transition-all ${!revealSuccess ? 'grayscale opacity-60' : ''}`} />
                              </div>
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
                    
                    <div className="flex flex-col items-center flex-shrink-0 z-20">
                      <div className="bg-zinc-100 text-black font-black text-3xl px-6 py-1 rounded-full mb-[-1rem] z-20">{track.year}</div>
                      <img src={track.imageUrl} className={`w-44 h-44 rounded-[2.5rem] border-4 ${track.isInitial ? 'border-amber-400 shadow-[0_0_40px_rgba(251,191,36,0.5)]' : 'border-zinc-800'}`} />
                      <div className="mt-4 text-center w-44"><p className="text-sm italic text-zinc-400">{track.name}</p><p className="text-xs font-bold text-zinc-600">{track.artist}</p></div>
                    </div>
                  </Fragment>
                ))}

                <div id={`slot-${players[currentPlayerIndex]?.timeline.length}`} className={`flex flex-col items-center justify-end relative h-full transition-all duration-700 ${mobileAction === players[currentPlayerIndex]?.timeline.length ? 'w-64' : 'w-4'}`}>
                  {mobileAction === players[currentPlayerIndex]?.timeline.length && (
                    <div className={`absolute bottom-20 z-30 ${actionState === 'slotted' ? 'anim-drop' : ''} ${actionState === 'revealed' ? 'anim-flip' : ''}`}>
                      {actionState === 'revealed' ? (
                        <div className="flex flex-col items-center scale-110">
                          <div className="bg-white text-black font-black text-3xl px-6 py-1 rounded-full mb-[-1rem] z-20 shadow-2xl">{targetCard?.year}</div>
                          <div className={`rounded-[2rem] border-4 overflow-hidden transition-all shadow-2xl ${revealSuccess ? 'border-green-500 shadow-[0_0_40px_rgba(34,197,94,0.4)]' : 'border-red-600 shadow-[0_0_40px_rgba(220,38,38,0.6)]'}`}>
                                <img src={targetCard?.imageUrl} className={`w-40 h-40 object-cover transition-all ${!revealSuccess ? 'grayscale opacity-60' : ''}`} />
                          </div>
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

                <div className="w-[40vw] flex-shrink-0 pointer-events-none"></div>

              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}