'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Track { id: string; year: string; name: string; artist: string; imageUrl: string; }

export default function MobilePlayer() {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joined, setJoined] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [channel, setChannel] = useState<any>(null);

  const [gameState, setGameState] = useState<any>(null);
  const [minhaVez, setMinhaVez] = useState(false);
  
  const [playerTimeline, setPlayerTimeline] = useState<Track[]>([]);
  const [acaoEscolhida, setAcaoEscolhida] = useState<number | null>(null); // Salva o ÍNDICE do slot
  
  const [roundFeedback, setRoundFeedback] = useState<'success' | 'error' | null>(null);
  const [realYear, setRealYear] = useState<string>('');

  const entrarNaSala = () => {
    if (!name || roomCode.length !== 4) return;
    const newChannel = supabase.channel(`room_${roomCode.toUpperCase()}`);

    newChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setJoined(true);
        setChannel(newChannel);
        newChannel.send({ type: 'broadcast', event: 'join', payload: { name } });
      }
    });

    newChannel.on('broadcast', { event: 'game-state' }, ({ payload }) => {
      setGameState(payload);
      setRoundFeedback(null); 
      
      if (payload.currentPlayer === name) {
        setMinhaVez(true);
        setPlayerTimeline(payload.playerTimeline); // Recebe a array inteira de cartas dele
        setAcaoEscolhida(null); 
      } else {
        setMinhaVez(false);
      }
    });

    newChannel.on('broadcast', { event: 'play-result' }, ({ payload }) => {
      if (payload.success) setRoundFeedback('success');
      else setRoundFeedback('error');
      setRealYear(payload.actualYear);
    });
  };

  const confirmarPronto = () => {
    if (!channel) return;
    channel.send({ type: 'broadcast', event: 'player-ready', payload: { name } });
    setIsReady(true);
  };

  const escolherSlot = (index: number) => {
    setAcaoEscolhida(index);
    channel.send({ type: 'broadcast', event: 'mobile-action', payload: { slotIndex: index } });
  };

  const confirmarJogada = () => {
    if (acaoEscolhida === null) return;
    channel.send({ type: 'broadcast', event: 'confirm-play', payload: { slotIndex: acaoEscolhida } });
  };

  if (roundFeedback) {
    const isWin = roundFeedback === 'success';
    return (
      <div className={`flex flex-col min-h-screen items-center justify-center p-6 text-white font-sans transition-colors duration-500 ${isWin ? 'bg-green-500' : 'bg-red-500'}`}>
        <h1 className="text-6xl font-black uppercase mb-4 text-center">{isWin ? 'ACERTOU!' : 'ERROU!'}</h1>
        <p className="text-xl font-medium mb-8">O ano correto era</p>
        <div className="bg-white text-black font-black text-8xl px-10 py-4 rounded-3xl shadow-2xl">{realYear}</div>
      </div>
    );
  }

  if (minhaVez && playerTimeline.length > 0) {
    return (
      <div className="flex flex-col h-screen bg-zinc-950 text-white font-sans pt-6">
        <h1 className="text-2xl font-black text-center text-green-500 mb-2 tracking-widest uppercase flex-shrink-0">É a sua vez!</h1>
        <p className="text-center text-zinc-400 mb-6 text-sm flex-shrink-0">Posicione a música na sua linha do tempo</p>
        
        {/* ÁREA COM SCROLL HORIZONTAL PARA A LINHA DO TEMPO CRESCER */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden flex items-center px-10 custom-scrollbar pb-6">
          <div className="flex items-end h-full">
            
            {/* RENDERIZAÇÃO ALTERNADA: SLOT -> CARTA -> SLOT -> CARTA -> SLOT */}
            {playerTimeline.map((track, index) => (
              <div key={track.id} className="flex items-end h-full">
                
                {/* SLOT ANTES DESTA CARTA */}
                <div 
                  onClick={() => escolherSlot(index)}
                  className={`w-28 h-28 rounded-xl border-2 border-dashed flex-shrink-0 flex flex-col items-center justify-center cursor-pointer transition-all z-10 self-center mx-2 ${acaoEscolhida === index ? 'border-blue-500 bg-blue-500/20 scale-110 shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'border-zinc-700 bg-zinc-900/50'}`}
                >
                  {acaoEscolhida === index && <span className="text-blue-400 font-bold text-xs text-center leading-tight">INSERIR<br/>AQUI</span>}
                </div>

                {/* A CARTA EM SI */}
                <div className="flex flex-col items-center flex-shrink-0 z-20 mx-2">
                  <div className="text-center mb-3 flex flex-col items-center">
                    <div className="bg-white text-black font-black text-3xl px-6 py-1 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.3)] mb-2">{track.year}</div>
                    <h2 className="text-sm font-bold w-32 truncate">{track.name}</h2>
                    <p className="text-[10px] text-zinc-400 truncate w-32">{track.artist}</p>
                  </div>
                  <img src={track.imageUrl} className="w-32 h-32 rounded-xl shadow-2xl object-cover border-2 border-zinc-700" />
                </div>
              </div>
            ))}

            {/* O ÚLTIMO SLOT (DEPOIS DA ÚLTIMA CARTA) */}
            <div 
              onClick={() => escolherSlot(playerTimeline.length)}
              className={`w-28 h-28 rounded-xl border-2 border-dashed flex-shrink-0 flex flex-col items-center justify-center cursor-pointer transition-all z-10 self-center mx-2 ${acaoEscolhida === playerTimeline.length ? 'border-blue-500 bg-blue-500/20 scale-110 shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'border-zinc-700 bg-zinc-900/50'}`}
            >
              {acaoEscolhida === playerTimeline.length && <span className="text-blue-400 font-bold text-xs text-center leading-tight">INSERIR<br/>AQUI</span>}
            </div>

          </div>
        </div>

        {/* BOTÃO CONFIRMAR FIXO NO RODAPÉ */}
        <div className="p-6 bg-gradient-to-t from-zinc-950 flex-shrink-0">
          <button 
            onClick={confirmarJogada}
            disabled={acaoEscolhida === null}
            className="w-full bg-green-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-black text-xl py-5 rounded-2xl shadow-[0_0_30px_rgba(34,197,94,0.4)] transition-all"
          >
            {acaoEscolhida !== null ? 'CONFIRMAR JOGADA' : 'SELECIONE UM ESPAÇO'}
          </button>
        </div>
      </div>
    );
  }

  if (gameState && !minhaVez) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-950 items-center justify-center text-white p-6">
        <div className="w-16 h-16 border-4 border-zinc-700 border-t-green-500 rounded-full animate-spin mb-8"></div>
        <h2 className="text-2xl font-bold text-center">Olhe para a TV!</h2>
        <p className="text-zinc-500 mt-2 text-center text-lg">É a vez de <strong className="text-green-500">{gameState.currentPlayer}</strong> jogar.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-900 text-white p-6 justify-center items-center font-sans">
      {!joined ? (
        <div className="w-full max-w-sm bg-zinc-800 p-8 rounded-3xl shadow-xl border border-zinc-700">
          <h1 className="text-3xl font-black text-center mb-8">Entrar no Jogo</h1>
          <div className="mb-6"><label className="block text-zinc-400 text-sm mb-2">Seu Nome</label><input type="text" maxLength={12} className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-white text-xl text-center focus:border-green-500 focus:outline-none" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Hecth" /></div>
          <div className="mb-8"><label className="block text-zinc-400 text-sm mb-2">Código da TV</label><input type="text" maxLength={4} className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-green-500 font-black text-3xl tracking-widest text-center uppercase focus:border-green-500 focus:outline-none" value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} placeholder="XXXX" /></div>
          <button onClick={entrarNaSala} disabled={!name || roomCode.length !== 4} className="w-full bg-green-500 disabled:bg-zinc-700 text-black disabled:text-zinc-500 font-black text-xl py-4 rounded-xl transition-all">ENTRAR</button>
        </div>
      ) : (
        <div className="w-full max-w-sm flex flex-col items-center text-center">
          <h2 className="text-2xl text-zinc-400 mb-2">Jogador</h2>
          <h1 className="text-5xl font-black text-white mb-12">{name}</h1>
          {!isReady ? (
            <button onClick={confirmarPronto} className="w-full bg-blue-500 text-white font-black text-2xl py-6 rounded-2xl shadow-[0_0_30px_rgba(59,130,246,0.4)]">ESTOU PRONTO!</button>
          ) : (
             <div className="bg-green-500/20 border-2 border-green-500 text-green-400 rounded-2xl p-8 w-full animate-pulse"><h2 className="text-3xl font-black">PRONTO!</h2><p className="mt-2 text-green-200">Olhe para a TV</p></div>
          )}
        </div>
      )}
    </div>
  );
}