import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Trash2, MapPin, Search, Navigation, RefreshCw, Maximize2, Minimize2 } from 'lucide-react';
import axios from 'axios';

const pointIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #2E7D32; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

interface PropriedadeDemarcacaoProps {
  onPolygonChange: (geojson: any) => void;
  initialGeoJson?: any;
}

const CATANDUVA_LAT = -21.1370;
const CATANDUVA_LNG = -48.9730;

const MapCenterController: React.FC<{ center: [number, number] }> = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 15, { animate: true });
  }, [center, map]);
  return null;
};

const RedimensionarMapa: React.FC<{ maximizado: boolean }> = ({ maximizado }) => {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 60);
    return () => clearTimeout(timer);
  }, [map, maximizado]);
  return null;
};

export const PropriedadeDemarcacao: React.FC<PropriedadeDemarcacaoProps> = ({ onPolygonChange, initialGeoJson }) => {
  const [mapCenter, setMapCenter] = useState<[number, number]>([CATANDUVA_LAT, CATANDUVA_LNG]);
  const [searchCity, setSearchCity] = useState('');
  const [searching, setSearching] = useState(false);
  const [mapaMaximizado, setMapaMaximizado] = useState(false);

  // Permite sair do modo tela cheia pressionando ESC sem fechar o cadastro
  useEffect(() => {
    if (!mapaMaximizado) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMapaMaximizado(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mapaMaximizado]);
  
  // Lista de pontos NATIVA ZERADA para novas propriedades
  const [points, setPoints] = useState<[number, number][]>([]);
  const hasInitializedRef = useRef(false);

  // Inicializa os pontos apenas UMA vez ao abrir edição de propriedade existente
  useEffect(() => {
    if (!hasInitializedRef.current) {
      if (initialGeoJson && initialGeoJson.coordinates && initialGeoJson.coordinates[0]) {
        const coordsRaw = initialGeoJson.coordinates[0];
        // Remove o último ponto de fechamento caso seja idêntico ao primeiro
        let parsedPoints: [number, number][] = coordsRaw.map((pt: any) => [pt[0], pt[1]]);
        if (
          parsedPoints.length > 3 &&
          parsedPoints[0][0] === parsedPoints[parsedPoints.length - 1][0] &&
          parsedPoints[0][1] === parsedPoints[parsedPoints.length - 1][1]
        ) {
          parsedPoints = parsedPoints.slice(0, parsedPoints.length - 1);
        }
        
        if (parsedPoints.length >= 3) {
          setPoints(parsedPoints);
          setMapCenter(parsedPoints[0]);
        }
      } else {
        // Nova propriedade -> Pontos obrigatoriamente ZERADOS
        setPoints([]);
      }
      hasInitializedRef.current = true;
    }
  }, [initialGeoJson]);

  // Notifica o componente pai sobre a alteração do polígono
  useEffect(() => {
    if (points.length >= 3) {
      const closedPoints = [...points, points[0]];
      const geojson = {
        type: 'Polygon',
        coordinates: [closedPoints]
      };
      onPolygonChange(geojson);
    } else {
      onPolygonChange(null);
    }
  }, [points]);

  const handleSearchLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchCity.trim()) return;

    setSearching(true);
    try {
      const res = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchCity)}`
      );
      if (res.data && res.data.length > 0) {
        const lat = parseFloat(res.data[0].lat);
        const lon = parseFloat(res.data[0].lon);
        setMapCenter([lat, lon]);
      } else {
        alert('Localização não encontrada. Tente digitar a cidade e estado (ex: Catanduva, SP).');
      }
    } catch (err) {
      console.error('Erro na busca de localização:', err);
      alert('Erro ao buscar a localização no mapa.');
    } finally {
      setSearching(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          setMapCenter([lat, lon]);
        },
        (err) => {
          alert('Permissão de GPS negada pelo navegador ou indisponível.');
        }
      );
    } else {
      alert('Geolocalização não é suportada pelo seu navegador.');
    }
  };

  const MapClickHandler = () => {
    useMapEvents({
      click(e) {
        const newPt: [number, number] = [Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))];
        setPoints(prev => [...prev, newPt]);
      },
    });
    return null;
  };

  const handleRemovePoint = (index: number) => {
    setPoints(prev => prev.filter((_, i) => i !== index));
  };

  const handleClear = () => {
    setPoints([]);
  };

  const handleUpdatePoint = (index: number, lat: number, lng: number) => {
    const updated = [...points];
    updated[index] = [lat, lng];
    setPoints(updated);
  };

  return (
    <div
      className={
        mapaMaximizado
          ? 'fixed inset-0 z-[10005] bg-white flex flex-col overflow-hidden'
          : 'space-y-3'
      }
    >
      {/* Cabeçalho do modo tela cheia (mesmo padrão visual do histórico) */}
      {mapaMaximizado && (
        <div className="bg-trustBlue text-white px-5 py-3 flex items-center justify-between border-b border-gray-700 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="bg-natureGreen/20 p-2 rounded-xl">
              <MapPin className="h-5 w-5 text-fieldGreen" />
            </div>
            <div>
              <h4 className="font-extrabold text-sm sm:text-base text-white">
                Demarcação do Perímetro em Tela Cheia
              </h4>
              <p className="text-[11px] text-gray-300">
                Clique no mapa para marcar os vértices • Pressione ESC ou clique em Restaurar ao concluir
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMapaMaximizado(false)}
            className="text-gray-100 hover:text-white px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 transition cursor-pointer flex items-center space-x-1.5 text-xs font-semibold"
            title="Restaurar tamanho do mapa"
          >
            <Minimize2 className="h-4 w-4" />
            <span>Restaurar</span>
          </button>
        </div>
      )}

      <div className={mapaMaximizado ? 'flex-1 min-h-0 flex flex-col gap-3 p-3 sm:p-4 bg-offWhite/30' : 'space-y-3'}>
        {/* Barra Superior de Navegação do Mapa */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 bg-offWhite p-3 rounded-xl border border-gray-200 shrink-0">
          <form onSubmit={handleSearchLocation} className="flex items-center space-x-2 w-full sm:w-auto flex-1">
            <div className="relative w-full">
              <Search className="h-4 w-4 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                value={searchCity}
                onChange={(e) => setSearchCity(e.target.value)}
                placeholder="Ir para cidade/região (ex: Catanduva, SP)..."
                className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs text-graphiteText bg-white focus:ring-2 focus:ring-natureGreen"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="bg-natureGreen hover:bg-natureGreen/90 text-white font-bold px-3 py-1.5 rounded-lg text-xs shrink-0 flex items-center space-x-1 shadow-xs disabled:opacity-50"
            >
              {searching ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              <span>Ir para cidade</span>
            </button>
          </form>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              className="bg-trustBlue hover:bg-trustBlue/90 text-white font-bold px-3 py-1.5 rounded-lg text-xs shrink-0 flex items-center space-x-1 shadow-xs flex-1 sm:flex-initial justify-center"
            >
              <Navigation className="h-3.5 w-3.5 text-fieldGreen" />
              <span>Usar meu GPS atual</span>
            </button>

            {!mapaMaximizado && (
              <button
                type="button"
                onClick={() => setMapaMaximizado(true)}
                className="bg-slate-700 hover:bg-slate-800 text-white font-bold px-3 py-1.5 rounded-lg text-xs shrink-0 flex items-center space-x-1.5 shadow-xs justify-center transition cursor-pointer"
                title="Maximizar mapa em tela cheia"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Maximizar mapa</span>
              </button>
            )}
          </div>
        </div>

        <div
          className={
            mapaMaximizado
              ? 'flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-4 gap-3'
              : 'grid grid-cols-1 lg:grid-cols-3 gap-4'
          }
        >
          {/* Coluna 1 e 2: Mapa Interativo */}
          <div
            className={
              mapaMaximizado
                ? 'flex-1 min-h-[300px] lg:col-span-3 lg:h-full rounded-xl overflow-hidden border border-gray-300 relative shadow-inner'
                : 'lg:col-span-2 h-[450px] rounded-xl overflow-hidden border border-gray-300 relative shadow-inner'
            }
          >
            <MapContainer
              center={mapCenter}
              zoom={15}
              scrollWheelZoom={true}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapCenterController center={mapCenter} />
              <RedimensionarMapa maximizado={mapaMaximizado} />
              <MapClickHandler />

              {/* Marcadores dos Vértices */}
              {points.map((pt, idx) => (
                <Marker key={idx} position={pt} icon={pointIcon} />
              ))}

              {/* Renderização do Polígono Desenhado */}
              {points.length >= 3 && (
                <Polygon
                  positions={points}
                  pathOptions={{ color: '#2E7D32', fillColor: '#66BB6A', fillOpacity: 0.35, weight: 3 }}
                />
              )}
            </MapContainer>

            <div className="absolute top-3 right-3 z-[1000] bg-white px-3 py-2 rounded-lg shadow-md text-xs font-semibold text-graphiteText flex items-center space-x-1 border border-gray-200">
              <MapPin className="h-4 w-4 text-natureGreen" />
              <span>
                {points.length === 0 
                  ? 'Clique no mapa para marcar o 1º ponto do perímetro' 
                  : `${points.length} ponto(s) marcado(s) - Clique para adicionar mais`}
              </span>
            </div>
          </div>

          {/* Coluna 3: Lista Editable de Vértices */}
          <div
            className={
              mapaMaximizado
                ? 'bg-offWhite border border-gray-200 p-3.5 rounded-xl flex flex-col justify-between max-h-48 lg:max-h-none lg:h-full lg:col-span-1 min-h-0'
                : 'bg-offWhite border border-gray-200 p-4 rounded-xl flex flex-col justify-between h-[450px]'
            }
          >
            <div className={mapaMaximizado ? 'flex flex-col flex-1 min-h-0' : ''}>
              <div className="flex justify-between items-center mb-3 shrink-0">
                <h4 className="font-bold text-graphiteText text-sm">Vértices do perímetro ({points.length})</h4>
                {points.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-xs text-criticalRed hover:text-red-800 font-bold flex items-center space-x-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Limpar vértices</span>
                  </button>
                )}
              </div>

              <div className={mapaMaximizado ? 'space-y-2 flex-1 min-h-0 overflow-y-auto pr-1' : 'space-y-2 max-h-[340px] overflow-y-auto pr-1'}>
                {points.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">
                    <MapPin className="h-8 w-8 mx-auto text-natureGreen mb-2 opacity-50" />
                    <p className="text-xs font-bold text-graphiteText">Nenhum ponto marcado.</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Clique no mapa para marcar a área do perímetro da fazenda.
                    </p>
                  </div>
                ) : (
                  points.map((pt, idx) => (
                    <div key={idx} className="flex items-center space-x-2 bg-white p-2 rounded-lg border text-xs shadow-xs">
                      <span className="font-bold text-gray-500 w-5">#{idx + 1}</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={pt[0]}
                        onChange={(e) => handleUpdatePoint(idx, parseFloat(e.target.value) || 0, pt[1])}
                        className="w-1/2 p-1 border rounded text-graphiteText text-xs"
                        placeholder="Lat"
                      />
                      <input
                        type="number"
                        step="0.0001"
                        value={pt[1]}
                        onChange={(e) => handleUpdatePoint(idx, pt[0], parseFloat(e.target.value) || 0)}
                        className="w-1/2 p-1 border rounded text-graphiteText text-xs"
                        placeholder="Lng"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePoint(idx)}
                        className="text-criticalRed hover:text-red-700 p-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}

                {points.length > 0 && points.length < 3 && (
                  <p className="text-xs text-alertAmber bg-amber-50 p-2.5 rounded-lg border border-alertAmber/30 font-medium mt-2">
                    ⚠️ Adicione pelo menos 3 pontos no mapa para fechar a área da propriedade.
                  </p>
                )}
              </div>
            </div>

            <p className="text-[11px] text-gray-500 mt-2 shrink-0">
              Localização padrão: Catanduva/SP. Clique no mapa para criar o polígono.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
