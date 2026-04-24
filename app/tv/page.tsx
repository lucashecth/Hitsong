'use client';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession, signIn, signOut } from 'next-auth/react';

interface Track { id: string; year: string; name: string; artist: string; imageUrl: string; }
// Agora o jogador guarda sua própria linha do tempo
interface Player { name: string; isReady: boolean; score: number; timeline: Track[] } 

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
  const [mobileAction, setMobileAction] = useState<number | null>(null); // Agora é um número (índice do slot)

  const [isRevealing, setIsRevealing] = useState(false);
  const [revealSuccess, setRevealSuccess] = useState<boolean | null>(null);

  const channelRef = useRef<any>(null);

  useEffect(() => { setIsMounted(true); }, []);

  const criarSala = () => {
    const savedDeck = JSON.parse(localStorage.getItem('hitster_deck') || '[]');
    if (savedDeck.length < 10) {
      alert("Para a Linha do Tempo funcionar bem, tenha pelo menos 10 músicas no Acervo!");
      return;
    }
    setDeck(savedDeck.sort(() => Math.random() - 0.5));
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
        setMobileAction(payload.slotIndex); // Recebe o índice de onde o jogador quer colocar
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
    if (countdown === 0) { 
      iniciarPartidaGlobal(); // Chama a função que distribui as cartas iniciais
      return; 
    }
    const timer = setTimeout(() => setCountdown(prev => (prev !== null ? prev - 1 : null)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // CONTROLE DO SPOTIFY
  const tocarMusica = async (trackId: string) => {
    const token = (session as any)?.accessToken;
    if (!token) return;
    try {
      const devicesRes = await fetch('https://api.spotify.com/v1/me/player/devices', { headers: { 'Authorization': `Bearer ${token}` } });
      const devicesData = await devicesRes.json();
      if (!devicesData.devices || devicesData.devices.length === 0) return;
      const targetDevice = devicesData.devices.find((d: any) => d.is_active) || devicesData.devices[0];
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${targetDevice.id}`, {
        method: 'PUT', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: [`spotify:track:${trackId}`] })
      });
    } catch (e) {}
  };

  const pausarMusica = async () => {
    const token = (session as any)?.accessToken;
    if (!token) return;
    try { await fetch('https://api.spotify.com/v1/me/player/play?device_id=...', { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } }); } catch (e) {}
  };

  // DISTRIBUI A PRIMEIRA CARTA PARA CADA UM E COMEÇA O JOGO
  const iniciarPartidaGlobal = () => {
    const currentDeck = [...deck];
    const initialPlayers = players.map(p => ({
      ...p,
      timeline: [currentDeck.pop()!] // Dá 1 carta para a linha do tempo de cada um
    }));
    
    setPlayers(initialPlayers);
    setDeck(currentDeck);
    setGameStarted(true);
    setCountdown(null);
    
    iniciarTurno(0, initialPlayers, currentDeck);
  };

  const iniciarTurno = (playerIndex: number, currentPlayers: Player[], currentDeck: Track[]) => {
    setIsRevealing(false);
    setRevealSuccess(null);
    setMobileAction(null);
    
    if (currentDeck.length < 1) { alert("O acervo acabou!"); return; }
    
    const target = currentDeck.pop()!;
    setDeck(currentDeck);
    setCurrentPlayerIndex(playerIndex);
    setTargetCard(target);

    tocarMusica(target.id);

    setTimeout(() => {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'game-state',
        payload: { 
          currentPlayer: currentPlayers[playerIndex].name, 
          playerTimeline: currentPlayers[playerIndex].timeline, // Manda a timeline inteira pro celular!
          targetCard: { id: target.id } 
        }
      });
    }, 1000);
  };

  // NOVA LÓGICA DE VALIDAÇÃO (Checa o ano anterior e o posterior ao slot escolhido)
  const resolverJogada = (slotIndex: number) => {
    if (!targetCard) return;
    pausarMusica();
    setIsRevealing(true);

    const currentPlayer = players[currentPlayerIndex];
    const pTimeline = currentPlayer.timeline;
    const targetYear = parseInt(targetCard.year);

    let acertou = true;
    
    // Verifica se é maior ou igual a carta à esquerda (se existir)
    if (slotIndex > 0) {
      if (parseInt(pTimeline[slotIndex - 1].year) > targetYear) acertou = false;
    }
    // Verifica se é menor ou igual a carta à direita (se existir)
    if (slotIndex < pTimeline.length) {
      if (parseInt(pTimeline[slotIndex].year) < targetYear) acertou = false;
    }

    setRevealSuccess(acertou);

    let novosJogadores = [...players];
    if (acertou) {
      // Insere a carta na posição correta da linha do tempo do jogador
      const novaTimeline = [...pTimeline];
      novaTimeline.splice(slotIndex, 0, targetCard);
      
      novosJogadores[currentPlayerIndex] = {
        ...currentPlayer,
        score: currentPlayer.score + 1,
        timeline: novaTimeline
      };
      setPlayers(novosJogadores);
    }

    channelRef.current?.send({ type: 'broadcast', event: 'play-result', payload: { success: acertou, actualYear: targetCard.year } });

    setTimeout(() => {
      const nextPlayer = (currentPlayerIndex + 1) % players.length;
      iniciarTurno(nextPlayer, novosJogadores, deck);
    }, 7000); // 7 segundos para apreciarem a resposta
  };

  if (!isMounted) return <div className="min-h-screen bg-zinc-950" />;
  if (status === 'unauthenticated' || !session) return <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white"><h1 className="text-7xl font-black mb-12 tracking-tighter">Hitster <span className="text-green-500">Digital</span></h1><button onClick={() => signIn('spotify', { callbackUrl: 'http://127.0.0.1:3000/tv' })} className="bg-green-500 text-black font-black text-2xl py-6 px-12 rounded-full hover:scale-105 transition-all shadow-[0_0_50px_rgba(34,197,94,0.3)]">Conectar Spotify Premium</button></div>;

  // CORREÇÃO DO BUG DO ZERO PISCANDO
  if (countdown !== null) return <div className="flex flex-col min-h-screen items-center justify-center bg-green-500 text-zinc-950"><h2 className="text-4xl font-black mb-8 uppercase tracking-widest">A preparar a mesa...</h2><span className="text-9xl font-black animate-ping">{countdown || 'VAI!'}</span></div>;

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-white font-sans overflow-hidden">
      <div className="w-full bg-zinc-900 px-8 py-4 flex justify-between items-center border-b border-zinc-800 z-50">
        <div className="flex items-center gap-4"><div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div><span className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Spotify Ativo: {session.user?.name}</span></div>
        <div className="flex items-center gap-6">{roomCode && <span className="text-xl font-black text-green-500">SALA: {roomCode}</span>}<button onClick={() => signOut({ callbackUrl: 'http://127.0.0.1:3000/tv' })} className="bg-zinc-800 hover:bg-red-600 text-zinc-400 hover:text-white text-xs font-bold py-2 px-4 rounded-lg transition-all">DESCONECTAR</button></div>
      </div>

      {!gameStarted ? (
        <div className="flex-1 flex flex-col items-center justify-center p-10">
          {!roomCode ? (
            <button onClick={criarSala} className="bg-white text-black font-black text-4xl py-8 px-20 rounded-full hover:scale-105 transition-all shadow-2xl">ABRIR NOVA SALA</button>
          ) : (
            <div className="w-full max-w-4xl animate-fade-in">
              <div className="text-center mb-16"><p className="text-zinc-500 uppercase tracking-[0.3em] font-bold mb-4">Código da Sala</p><h1 className="text-[12rem] leading-none font-black text-white tracking-tighter">{roomCode}</h1></div>
              <div className="grid grid-cols-2 gap-6">
                {players.map((p) => (<div key={p.name} className={`p-6 rounded-3xl border-4 transition-all ${p.isReady ? 'border-green-500 bg-green-500/10' : 'border-zinc-800 bg-zinc-900'}`}><div className="flex justify-between items-center"><span className="text-4xl font-black uppercase">{p.name}</span>{p.isReady ? <span className="text-green-500 font-black text-xl animate-pulse">PRONTO</span> : <span className="text-zinc-600 font-bold">AGUARDANDO...</span>}</div></div>))}
                {players.length === 0 && <div className="col-span-2 text-center text-zinc-600 text-2xl italic">Aguardando jogadores entrarem com o código...</div>}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 relative">
          <div className="w-28 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center py-10 gap-8 shadow-2xl">
            {players.map((p, i) => (
              <div key={i} className={`relative w-20 h-20 rounded-3xl flex items-center justify-center font-black text-3xl border-4 transition-all ${i === currentPlayerIndex ? 'border-green-500 bg-green-500/20 text-white scale-110 shadow-[0_0_30px_rgba(34,197,94,0.3)]' : 'border-zinc-800 bg-zinc-950 text-zinc-700'}`}>
                {p.score}<div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-zinc-800 text-[10px] px-2 py-0.5 rounded text-white truncate max-w-full">{p.name}</div>
              </div>
            ))}
          </div>

          <div className="flex-1 flex flex-col items-center">
            <div className={`w-full py-10 text-center transition-colors duration-500 ${isRevealing ? (revealSuccess ? 'bg-green-600' : 'bg-red-600') : 'bg-zinc-900/50'}`}>
              {isRevealing ? (
                <h1 className="text-7xl font-black uppercase tracking-tighter">{revealSuccess ? 'ACERTOU EM CHEIO!' : 'ERROU O TEMPO!'}</h1>
              ) : (
                <><p className="text-zinc-500 text-2xl uppercase tracking-widest font-bold mb-2">Vez de jogar:</p><h1 className="text-8xl font-black text-green-500 tracking-tight">{players[currentPlayerIndex]?.name}</h1></>
              )}
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-10 w-full">
              {isRevealing && targetCard ? (
                <div className="flex flex-col items-center animate-fade-in">
                   <div className="bg-white text-black font-black text-8xl px-16 py-4 rounded-full shadow-[0_0_60px_rgba(255,255,255,0.4)] mb-10 transform -rotate-2">{targetCard.year}</div>
                   <img src={targetCard.imageUrl} className="w-96 h-96 rounded-[3rem] shadow-2xl object-cover border-8 border-zinc-800" />
                   <h2 className="text-5xl font-black mt-8 text-white">{targetCard.name}</h2>
                   <p className="text-2xl text-zinc-400 font-bold mt-2 uppercase tracking-widest">{targetCard.artist}</p>
                </div>
              ) : (
                <div className="relative group w-[30rem] h-[30rem]">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-600 via-blue-600 to-purple-600 rounded-[4rem] shadow-[0_0_100px_rgba(34,197,94,0.2)] animate-pulse"></div>
                  <div className="absolute inset-4 bg-zinc-950 rounded-[3rem] flex flex-col items-center justify-center border-4 border-zinc-800">
                    <div className="text-9xl mb-6">?</div><p className="text-4xl font-black text-zinc-700 tracking-[0.2em] uppercase">Escute a TV</p>
                  </div>
                </div>
              )}

              {!isRevealing && players[currentPlayerIndex]?.timeline && (
                <div className="mt-16 h-32 w-full max-w-4xl flex items-center justify-center border-4 border-dashed border-zinc-800 rounded-[2rem] bg-zinc-900/30">
                  {mobileAction !== null ? (
                    <p className="text-4xl font-black uppercase tracking-tight text-blue-400 animate-pulse">
                      Jogada Selecionada. Aguardando Confirmação...
                    </p>
                  ) : (
                    <p className="text-2xl text-zinc-700 font-bold italic uppercase tracking-widest animate-pulse">Aguardando decisão no celular...</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}