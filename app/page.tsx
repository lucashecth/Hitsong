'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { supabase } from '@/lib/supabase';

interface Track {
  id: string;
  year: string;
  name: string;
  artist: string;
  imageUrl: string;
  cadastrado_por?: string;
}

export default function Home() {
  const router = useRouter();
  const { data: session } = useSession();
  
  const [inputUrl, setInputUrl] = useState('');
  const [parsedTracks, setParsedTracks] = useState<Track[]>([]);
  const [savedTracks, setSavedTracks] = useState<Track[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [filterReported, setFilterReported] = useState(false);

  useEffect(() => {
    const carregarAcervoGlobal = async () => {
      const { data, error } = await supabase
        .from('tracks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Erro ao carregar banco:", error.message);
      } else if (data) {
        setSavedTracks(data);
      }
    };
    carregarAcervoGlobal();
  }, []);

  const buscarDoSpotify = async () => {
    if (!inputUrl.trim()) return;
    setErrorMsg('');
    setIsFetching(true);
    
    const token = (session as any)?.accessToken;
    if (!token) {
      setErrorMsg('Conecte o Spotify na TV primeiro ou faça login.');
      setIsFetching(false);
      return;
    }

    const links = inputUrl.split(/\s+/).filter(link => link.includes('spotify.com'));
    if (links.length === 0) {
      setErrorMsg('Nenhum link válido do Spotify encontrado.');
      setIsFetching(false);
      return;
    }

    try {
      const novasCartasEncontradas: Track[] = [];

      for (const link of links) {
        if (link.includes('/playlist/')) {
          const playlistId = link.split('/playlist/')[1].split('?')[0];
          let nextUrl: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
          
          while (nextUrl) {
            // Tipagem explícita para matar o erro ts(7022)
            const res: Response = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) break;
            const playlistData: any = await res.json();

            playlistData.items.forEach((item: any) => {
              if (item.track?.id) {
                novasCartasEncontradas.push({
                  id: item.track.id,
                  year: item.track.album.release_date.substring(0, 4),
                  name: item.track.name,
                  artist: item.track.artists[0].name,
                  imageUrl: item.track.album.images[0]?.url || '',
                  cadastrado_por: session?.user?.name || 'Anônimo'
                });
              }
            });
            nextUrl = playlistData.next; 
          }
        } 
        else if (link.includes('/album/')) {
          const albumId = link.split('/album/')[1].split('?')[0];
          const res: Response = await fetch(`https://api.spotify.com/v1/albums/${albumId}`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            const albumData: any = await res.json();
            const albumYear = albumData.release_date.substring(0, 4);
            const albumImage = albumData.images[0]?.url || '';
            albumData.tracks.items.forEach((track: any) => {
              novasCartasEncontradas.push({ 
                id: track.id, year: albumYear, name: track.name, artist: track.artists[0].name, imageUrl: albumImage,
                cadastrado_por: session?.user?.name || 'Anônimo'
              });
            });
          }
        } 
        else if (link.includes('/track/')) {
          const trackId = link.split('/track/')[1].split('?')[0];
          const res: Response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            const trackData: any = await res.json();
            novasCartasEncontradas.push({
              id: trackData.id, year: trackData.album.release_date.substring(0, 4),
              name: trackData.name, artist: trackData.artists[0].name, imageUrl: trackData.album.images[0]?.url || '',
              cadastrado_por: session?.user?.name || 'Anônimo'
            });
          }
        }
      }

      setParsedTracks(prev => {
        const combined = [...prev, ...novasCartasEncontradas];
        return Array.from(new Map(combined.map(item => [item.id, item])).values());
      });
      setInputUrl('');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsFetching(false);
    }
  };

  const saveDeck = async () => {
    if (parsedTracks.length === 0) return;
    const { error } = await supabase.from('tracks').upsert(parsedTracks, { onConflict: 'id' });
    if (error) {
      alert("Erro ao gravar: " + error.message);
    } else {
      alert(`${parsedTracks.length} músicas gravadas no acervo global!`);
      // Atualiza a lista local com as novas músicas
      setSavedTracks(prev => [...parsedTracks, ...prev]);
      setParsedTracks([]);
    }
  };

  const removerDoPreview = (id: string) => setParsedTracks(prev => prev.filter(t => t.id !== id));

  const removerDoAcervo = async (id: string) => {
    if (!confirm('Remover do acervo GLOBAL?')) return;
    const { error } = await supabase.from('tracks').delete().eq('id', id);
    if (!error) setSavedTracks(prev => prev.filter(t => t.id !== id));
  };

  const filteredSavedTracks = savedTracks.filter(track => {
    const matchesSearch = track.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          track.artist.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          track.year.includes(searchTerm);
    if (filterReported) {
      return matchesSearch && (track as any).reported === true;
    }
    return matchesSearch;
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans p-8">
      <header className="max-w-7xl mx-auto flex justify-between items-center mb-10 border-b border-zinc-800 pb-6">
        <div>
            <h1 className="text-4xl font-black tracking-tighter">Hitster <span className="text-green-500">Digital</span></h1>
            <p className="text-zinc-500 text-xs font-bold uppercase mt-1">Acervo Comunitário</p>
        </div>
        <button onClick={() => router.push('/tv')} className="bg-white text-black font-bold px-6 py-2 rounded-full hover:scale-105 transition-all">Hospedar Jogo</button>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="flex flex-col gap-6">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl">
            <h2 className="text-xl font-bold mb-4">Alimentar Banco</h2>
            <textarea 
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Cole os links do Spotify..."
              className="w-full h-32 bg-zinc-950 border border-zinc-700 rounded-2xl p-4 text-sm focus:border-green-500 outline-none resize-none"
            />
            <button onClick={buscarDoSpotify} disabled={isFetching} className="w-full mt-4 bg-blue-600 font-bold py-3 rounded-xl hover:bg-blue-500 transition-all disabled:opacity-50">
              {isFetching ? 'Buscando playlist inteira...' : 'Verificar Links'}
            </button>
            {errorMsg && <p className="text-red-500 text-xs mt-2">{errorMsg}</p>}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl flex justify-between items-center">
            <div>
              <p className="text-zinc-500 text-xs uppercase font-bold">Total Global</p>
              <p className="text-4xl font-black text-green-500">{savedTracks.length}</p>
            </div>
            <div className="text-right">
                <p className="text-[10px] text-zinc-600 font-bold mb-1 italic">Logado como: {session?.user?.name || 'Visitante'}</p>
            </div>
          </div>
        </div>

        {/* COLUNA 2: PREVIEW */}
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl flex flex-col max-h-[70vh]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Novas ({parsedTracks.length})</h2>
            <button onClick={saveDeck} disabled={parsedTracks.length === 0} className="bg-green-500 text-black px-4 py-1 rounded-full font-black text-xs hover:scale-105 disabled:opacity-30 transition-all">GRAVAR NO BANCO</button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {parsedTracks.map((track) => {
              const isDupe = savedTracks.some(t => t.id === track.id);
              return (
                <div key={track.id} className={`bg-zinc-950 p-3 rounded-xl flex items-center justify-between border transition-all ${isDupe ? 'border-red-900/50 opacity-40 grayscale' : 'border-zinc-800'}`}>
                  <div className="flex items-center gap-3 truncate">
                    <img src={track.imageUrl} className="w-10 h-10 rounded shadow-lg object-cover" alt="" />
                    <div className="truncate">
                      <p className="text-xs font-bold truncate">{track.name}</p>
                      <p className="text-[10px] text-zinc-500">{track.artist} • {track.year}</p>
                    </div>
                  </div>
                  <button onClick={() => removerDoPreview(track.id)} className="text-zinc-700 hover:text-red-500 p-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUNA 3: ACERVO GLOBAL */}
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl flex flex-col max-h-[70vh]">
          <div className="flex justify-between items-center mb-4 gap-2">
            <h2 className="text-xl font-bold">Acervo ({filteredSavedTracks.length})</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilterReported(!filterReported)}
                className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border cursor-pointer ${
                  filterReported
                    ? 'bg-red-500/10 text-red-500 border-red-500/30'
                    : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:text-white'
                }`}
                title="Mostrar apenas músicas reportadas com erro"
              >
                ⚠️ Reportadas
              </button>
              <input 
                type="text" 
                placeholder="Filtro..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-20 bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-[9px] outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {filteredSavedTracks.map(track => (
              <div key={track.id} className="bg-zinc-800/30 p-3 rounded-xl flex flex-col gap-2 border border-zinc-700/50 group">
                <div className="flex items-center gap-3">
                    <img src={track.imageUrl} className="w-10 h-10 rounded opacity-70 object-cover" alt="" />
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate text-zinc-300">{track.name}</p>
                        <p className="text-[10px] text-zinc-600 truncate">{track.artist} • {track.year}</p>
                    </div>
                    <button onClick={() => removerDoAcervo(track.id)} className="opacity-0 group-hover:opacity-100 text-zinc-700 hover:text-red-500 transition-all p-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="flex justify-end gap-1.5">
                  {(track as any).reported && (
                      <span className="text-[8px] bg-red-950 text-red-400 px-2 py-0.5 rounded-full border border-red-900/30 font-bold uppercase tracking-wider">
                          ⚠️ Ano Errado
                      </span>
                  )}
                  <span className="text-[8px] bg-zinc-900 text-zinc-500 px-2 py-0.5 rounded-full border border-zinc-800">
                      Curador: <span className="text-blue-400">{track.cadastrado_por || 'Antigo'}</span>
                  </span>
              </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}