'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

interface Track {
  id: string;
  year: string;
  name: string;
  artist: string;
  imageUrl: string; 
}

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();
  
  const [inputUrl, setInputUrl] = useState('');
  const [parsedTracks, setParsedTracks] = useState<Track[]>([]);
  const [savedTracks, setSavedTracks] = useState<Track[]>([]);
  const [searchTerm, setSearchTerm] = useState(''); // Estado da barra de busca
  const [isFetching, setIsFetching] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('hitster_deck');
    if (saved) {
      setSavedTracks(JSON.parse(saved));
    }
  }, []);

  const buscarDoSpotify = async () => {
    if (!inputUrl.trim()) return;
    setErrorMsg('');
    setIsFetching(true);
    
    const token = (session as any)?.accessToken;
    if (!token) {
      setErrorMsg('Conecte o Spotify na TV primeiro.');
      setIsFetching(false);
      return;
    }

    const links = inputUrl.split(/\s+/).filter(link => link.includes('open.spotify.com'));
    if (links.length === 0) {
      setErrorMsg('Nenhum link válido do Spotify encontrado.');
      setIsFetching(false);
      return;
    }

    try {
      let novasCartasEncontradas: Track[] = [];

      for (const link of links) {
        let endpoint = '';
        let type: 'playlist' | 'album' | 'track' | null = null;

        if (link.includes('/playlist/')) {
          const playlistId = link.split('/playlist/')[1].split('?')[0];
          endpoint = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
          type = 'playlist';
        } else if (link.includes('/album/')) {
          const albumId = link.split('/album/')[1].split('?')[0];
          endpoint = `https://api.spotify.com/v1/albums/${albumId}`;
          type = 'album';
        } else if (link.includes('/track/')) {
          const trackId = link.split('/track/')[1].split('?')[0];
          endpoint = `https://api.spotify.com/v1/tracks/${trackId}`;
          type = 'track';
        } else continue;

        const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) continue; 
        const data = await response.json();

        if (type === 'playlist') {
          data.items.forEach((item: any) => {
            if (item.track?.id) {
              novasCartasEncontradas.push({
                id: item.track.id,
                year: item.track.album.release_date.substring(0, 4),
                name: item.track.name,
                artist: item.track.artists[0].name,
                imageUrl: item.track.album.images[0]?.url || ''
              });
            }
          });
        } else if (type === 'album') {
          const albumYear = data.release_date.substring(0, 4);
          const albumImage = data.images[0]?.url || '';
          data.tracks.items.forEach((track: any) => {
            novasCartasEncontradas.push({ id: track.id, year: albumYear, name: track.name, artist: track.artists[0].name, imageUrl: albumImage });
          });
        } else if (type === 'track') {
          novasCartasEncontradas.push({
            id: data.id, year: data.album.release_date.substring(0, 4),
            name: data.name, artist: data.artists[0].name, imageUrl: data.album.images[0]?.url || ''
          });
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

  const saveDeck = () => {
    const combined = [...savedTracks, ...parsedTracks];
    const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
    localStorage.setItem('hitster_deck', JSON.stringify(unique));
    setSavedTracks(unique);
    setParsedTracks([]);
  };

  const removerDoPreview = (id: string) => {
    setParsedTracks(prev => prev.filter(t => t.id !== id));
  };

  const removerDoAcervo = (id: string) => {
    const novoAcervo = savedTracks.filter(t => t.id !== id);
    localStorage.setItem('hitster_deck', JSON.stringify(novoAcervo));
    setSavedTracks(novoAcervo);
  };

  // Lógica de filtro: verifica se o termo digitado está no nome, artista ou ano
  const filteredSavedTracks = savedTracks.filter(track => 
    track.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    track.artist.toLowerCase().includes(searchTerm.toLowerCase()) ||
    track.year.includes(searchTerm)
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans p-8">
      <header className="max-w-7xl mx-auto flex justify-between items-center mb-10 border-b border-zinc-800 pb-6">
        <h1 className="text-4xl font-black tracking-tighter">Hitster <span className="text-green-500">Digital</span></h1>
        <button onClick={() => router.push('/tv')} className="bg-white text-black font-bold px-6 py-2 rounded-full hover:scale-105 transition-all">Hospedar Jogo</button>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* COLUNA 1: INPUT */}
        <div className="flex flex-col gap-6">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl">
            <h2 className="text-xl font-bold mb-4">Adicionar Links</h2>
            <textarea 
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Cole os links de Músicas, Playlists ou Álbuns aqui..."
              className="w-full h-32 bg-zinc-950 border border-zinc-700 rounded-2xl p-4 text-sm focus:border-green-500 focus:outline-none resize-none"
            />
            <button onClick={buscarDoSpotify} disabled={isFetching} className="w-full mt-4 bg-blue-600 font-bold py-3 rounded-xl hover:bg-blue-500 transition-all disabled:opacity-50">
              {isFetching ? 'Buscando...' : 'Buscar Músicas'}
            </button>
            {errorMsg && <p className="text-red-500 text-xs mt-2">{errorMsg}</p>}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl flex justify-between items-center">
            <div>
              <p className="text-zinc-500 text-xs uppercase font-bold">Total no Acervo</p>
              <p className="text-4xl font-black">{savedTracks.length}</p>
            </div>
            <button onClick={() => { if(confirm('Zerar acervo?')) { localStorage.removeItem('hitster_deck'); setSavedTracks([]); } }} className="text-red-500 text-sm font-bold">LIMPAR TUDO</button>
          </div>
        </div>

        {/* COLUNA 2: PREVIEW (SALA DE ESPERA) */}
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl flex flex-col max-h-[70vh]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Na fila ({parsedTracks.length})</h2>
            <button onClick={saveDeck} disabled={parsedTracks.length === 0} className="text-green-500 font-bold text-sm hover:underline disabled:opacity-30">GRAVAR TUDO</button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {parsedTracks.map(track => (
              <div key={track.id} className="bg-zinc-950 p-3 rounded-xl flex items-center gap-3 border border-zinc-800 group hover:border-zinc-600 transition-colors">
                {track.imageUrl ? (
                  <img src={track.imageUrl} className="w-10 h-10 rounded shadow-lg object-cover" alt="" />
                ) : (
                  <div className="w-10 h-10 bg-zinc-800 rounded flex items-center justify-center"><span className="text-[10px] text-zinc-500">Sem foto</span></div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{track.name}</p>
                  <p className="text-[10px] text-zinc-500 truncate">{track.artist} • {track.year}</p>
                </div>
                <button onClick={() => removerDoPreview(track.id)} className="text-zinc-700 hover:text-red-500 transition-colors p-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* COLUNA 3: ACERVO SALVO */}
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl flex flex-col max-h-[70vh]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Acervo Gravado</h2>
            <span className="text-xs font-bold text-zinc-500 bg-zinc-800 px-2 py-1 rounded">{filteredSavedTracks.length} cartas</span>
          </div>

          {/* BARRA DE PESQUISA AQUI */}
          <div className="mb-4">
            <input 
              type="text" 
              placeholder="Buscar música, artista ou ano..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm focus:border-green-500 focus:outline-none text-zinc-300 placeholder-zinc-600"
            />
          </div>

          {savedTracks.length === 0 ? (
            <div className="flex-1 flex items-center justify-center border-2 border-dashed border-zinc-800 rounded-xl">
              <p className="text-zinc-600 text-sm text-center px-4">Suas cartas aparecerão aqui após gravar.</p>
            </div>
          ) : filteredSavedTracks.length === 0 ? (
            <div className="flex-1 flex items-center justify-center border-2 border-dashed border-zinc-800 rounded-xl">
              <p className="text-zinc-600 text-sm text-center px-4">Nenhuma música encontrada para "{searchTerm}".</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {filteredSavedTracks.map(track => (
                <div key={track.id} className="bg-zinc-800/30 p-3 rounded-xl flex items-center gap-3 border border-zinc-700/50 group hover:border-zinc-600 transition-colors">
                  {track.imageUrl ? (
                    <img src={track.imageUrl} className="w-10 h-10 rounded opacity-70 object-cover" alt="" />
                  ) : (
                    <div className="w-10 h-10 bg-zinc-800 rounded flex items-center justify-center opacity-70"><span className="text-[10px] text-zinc-500">Sem foto</span></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate text-zinc-300">{track.name}</p>
                    <p className="text-[10px] text-zinc-600 truncate">{track.artist} • {track.year}</p>
                  </div>
                  <button onClick={() => removerDoAcervo(track.id)} className="text-zinc-700 hover:text-red-500 p-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}