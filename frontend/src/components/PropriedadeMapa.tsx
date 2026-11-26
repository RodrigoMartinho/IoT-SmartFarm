import React from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Thermometer, Heart, Truck, Activity } from 'lucide-react';
import { obterInfoPosturaAnimal } from '../utils/postura';

const animalNormalIcon = L.divIcon({
  className: 'custom-animal-icon',
  html: `<div style="background-color: #2E7D32; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.3); font-size: 16px;">🐄</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

const animalAlertIcon = L.divIcon({
  className: 'custom-animal-alert-icon',
  html: `<div style="background-color: #D32F2F; width: 36px; height: 36px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(211,47,47,0.6); font-size: 18px; animation: pulse 1.5s infinite;">🚨</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

const equipmentIcon = L.divIcon({
  className: 'custom-equip-icon',
  html: `<div style="background-color: #1976D2; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.3); font-size: 16px;">🚜</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

const envStationIcon = L.divIcon({
  className: 'custom-env-icon',
  html: `<div style="background-color: #F9A825; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.3); font-size: 16px;">🌤️</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

const temGpsValido = (lat: any, lng: any): boolean => {
  if (lat === undefined || lat === null || lng === undefined || lng === null || lat === '' || lng === '') {
    return false;
  }
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (Number.isNaN(nLat) || Number.isNaN(nLng)) return false;
  if (nLat === 0 && nLng === 0) return false;
  return nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180;
};

interface PropriedadeMapaProps {
  overviewData: any;
  searchTerm?: string;
}

export const PropriedadeMapa: React.FC<PropriedadeMapaProps> = ({ overviewData, searchTerm = '' }) => {
  const property = overviewData?.propriedade || overviewData?.property;
  if (!overviewData || !property) {
    return (
      <div className="h-full flex items-center justify-center bg-offWhite rounded-xl text-graphiteText/60 font-semibold border border-gray-200">
        Nenhuma propriedade cadastrada ou selecionada.
      </div>
    );
  }

  const animals = overviewData.animais || overviewData.animals || [];
  const equipments = overviewData.equipamentos || overviewData.equipments || [];
  const environment_stations = overviewData.estacoes_ambientais || overviewData.environment_stations || [];

  // Filtragem dinâmica baseada no campo de busca do usuário
  const term = searchTerm.toLowerCase().trim();

  const filteredAnimals = animals.filter((a: any) => {
    if (!term) return true;
    const brinco = a.numero_brinco || a.tag_number || '';
    const esp = a.especie || a.species || '';
    const rac = a.raca || a.breed || '';
    const dev = a.dispositivo_id || a.device_id || '';
    return brinco.toLowerCase().includes(term) ||
      esp.toLowerCase().includes(term) ||
      rac.toLowerCase().includes(term) ||
      dev.toLowerCase().includes(term);
  });

  const filteredEquipments = equipments.filter((eq: any) => {
    if (!term) return true;
    const nome = eq.nome || eq.name || '';
    const tipo = eq.tipo || eq.type || '';
    const mod = eq.modelo || eq.model || '';
    const dev = eq.dispositivo_id || eq.device_id || '';
    return nome.toLowerCase().includes(term) ||
      tipo.toLowerCase().includes(term) ||
      mod.toLowerCase().includes(term) ||
      dev.toLowerCase().includes(term);
  });

  const filteredStations = environment_stations.filter((st: any) => {
    if (!term) return true;
    const nome = st.nome || st.name || '';
    const dev = st.dispositivo_id || st.device_id || '';
    return nome.toLowerCase().includes(term) || dev.toLowerCase().includes(term);
  });

  // Extrai coordenadas do GeoJSON
  const geojson = property.poligono_geojson || property.polygon_geojson;
  let polygonCoords: [number, number][] = [];
  if (geojson && geojson.coordinates) {
    const rawRing = geojson.coordinates[0] || [];
    polygonCoords = rawRing.map((pt: any) => [pt[0], pt[1]]);
  }

  const centerPosition: [number, number] = polygonCoords.length > 0 
    ? polygonCoords[0] 
    : [-21.1370, -48.9730];

  return (
    <div className="h-full w-full rounded-2xl overflow-hidden shadow-lg border border-gray-200 relative">
      <MapContainer
        key={property.id}
        center={centerPosition}
        zoom={15}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Desenho da Área da Propriedade */}
        {polygonCoords.length >= 3 && (
          <Polygon
            positions={polygonCoords}
            pathOptions={{ color: '#2E7D32', fillColor: '#66BB6A', fillOpacity: 0.35, weight: 3 }}
          />
        )}

        {/* Marcadores dos ANIMAIS filtrados */}
        {filteredAnimals.map((anim: any) => {
          const telem = anim.ultima_telemetria?.dados || anim.latest_telemetry?.data || anim.ultima_telemetria || anim.latest_telemetry;
          if (!telem || !temGpsValido(telem.latitude, telem.longitude)) return null;

          const tempCorp = telem.temperatura_corporal ?? telem.body_temperature;
          const tempSensorFalhou = telem.sensor_temp_ok === false;
          const isFever = !tempSensorFalhou && tempCorp > 39.5;
          const isAlert = isFever || anim.has_alarm || anim.tem_alarme;
          const brinco = anim.numero_brinco || anim.tag_number;
          const especie = anim.especie || anim.species;
          const devId = anim.dispositivo_id || anim.device_id;
          const bpm = telem.frequencia_cardiaca ?? telem.heart_rate;
          const infoPostura = obterInfoPosturaAnimal(telem);

          return (
            <Marker
              key={`anim-${anim.id}`}
              position={[Number(telem.latitude), Number(telem.longitude)]}
              icon={isAlert ? animalAlertIcon : animalNormalIcon}
            >
              <Popup>
                <div className="p-1 min-w-[220px]">
                  <div className="flex items-center justify-between border-b pb-2 mb-2">
                    <span className="font-bold text-graphiteText text-sm">🐄 {brinco}</span>
                    <span className="text-[11px] bg-green-100 text-natureGreen px-2 py-0.5 rounded-full font-bold">
                      {especie}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-graphiteText">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center space-x-1">
                        <Thermometer className="h-3.5 w-3.5 text-criticalRed" />
                        <span>Temperatura:</span>
                      </span>
                      <span className={`font-bold ${isFever ? 'text-criticalRed' : 'text-graphiteText'}`}>
                        {!tempSensorFalhou && tempCorp != null ? `${tempCorp} °C` : '-'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center space-x-1">
                        <Heart className="h-3.5 w-3.5 text-pink-500" />
                        <span>Freq. Cardíaca:</span>
                      </span>
                      <span className="font-bold text-graphiteText">{bpm} bpm</span>
                    </div>

                    {infoPostura && (
                      <div className="flex items-center justify-between pt-1">
                        <span className="flex items-center space-x-1">
                          <Activity className="h-3.5 w-3.5 text-natureGreen" />
                          <span>Postura:</span>
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${infoPostura.classes}`}>
                          {infoPostura.icone} {infoPostura.texto}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between border-t pt-1 text-[10px] text-gray-500">
                      <span>ID Dispositivo:</span>
                      <span className="font-mono">{devId}</span>
                    </div>
                    {(telem.satelites ?? telem.satellites) !== undefined && (telem.satelites ?? telem.satellites) !== null && (
                      <div className="flex items-center justify-between text-[10px] text-gray-500">
                        <span>Satélites GPS:</span>
                        <span className="font-mono font-bold text-graphiteText">🛰️ {telem.satelites ?? telem.satellites}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Marcadores dos EQUIPAMENTOS filtrados */}
        {filteredEquipments.map((eq: any) => {
          const telem = eq.ultima_telemetria?.dados || eq.latest_telemetry?.data || eq.ultima_telemetria || eq.latest_telemetry;
          if (!telem || !temGpsValido(telem.latitude, telem.longitude)) return null;

          const nome = eq.nome || eq.name;
          const tipo = eq.tipo || eq.type;
          const vel = telem.velocidade ?? telem.speed ?? 0;
          const statusMotor = telem.status || telem.status_motor || telem.engine_status || 'LIGADO';
          const satEquip = telem.satelites ?? telem.satellites;

          return (
            <Marker
              key={`eq-${eq.id}`}
              position={[Number(telem.latitude), Number(telem.longitude)]}
              icon={equipmentIcon}
            >
              <Popup>
                <div className="p-1 min-w-[200px]">
                  <div className="flex items-center justify-between border-b pb-2 mb-2">
                    <span className="font-bold text-graphiteText text-sm">🚜 {nome}</span>
                    <span className="text-[11px] bg-blue-100 text-iotBlue px-2 py-0.5 rounded-full font-bold">
                      {tipo}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-graphiteText">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center space-x-1">
                        <Truck className="h-3.5 w-3.5 text-iotBlue" />
                        <span>Velocidade:</span>
                      </span>
                      <span className="font-bold text-graphiteText">{vel} km/h</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span>Status Motor:</span>
                      <span className="font-bold text-natureGreen">{String(statusMotor).toUpperCase()}</span>
                    </div>

                    {satEquip !== undefined && satEquip !== null && (
                      <div className="flex items-center justify-between border-t pt-1 text-[10px] text-gray-500">
                        <span>Satélites GPS:</span>
                        <span className="font-mono font-bold text-graphiteText">🛰️ {satEquip}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Marcadores das ESTAÇÕES AMBIENTAIS filtradas */}
        {filteredStations.map((st: any) => {
          const telem = st.ultima_telemetria?.dados || st.latest_telemetry?.data || st.ultima_telemetria || st.latest_telemetry;
          const nome = st.nome || st.name;
          const modo = telem?.modo;
          const batPercentual = telem?.bateria_percentual_simulado ?? telem?.bateria ?? telem?.battery_level;
          const batStatus = telem?.bateria_status || (batPercentual !== undefined && batPercentual !== null ? (batPercentual >= 20 ? 'NORMAL' : 'BAIXA') : null);
          const tempSolo = telem?.temperatura_solo_C ?? telem?.temperatura_solo;
          const chuva = telem?.chuva;
          const isChovendo = chuva === true || String(chuva).toUpperCase() === 'SIM' || String(chuva).toUpperCase() === 'TRUE';
          const tempAr = telem?.temperatura_ar_C ?? telem?.temperatura ?? telem?.temperature;
          const umidAr = telem?.umidade_ar_percentual ?? telem?.umidade ?? telem?.humidity;
          const pressao = telem?.pressao_hPa ?? telem?.pressao_atmosferica ?? telem?.atmospheric_pressure;
          const lumAdc = telem?.luminosidade_adc;
          const umidSolo = telem?.umidade_solo ?? telem?.soil_moisture;
          const umidSoloAdc = telem?.umidade_solo_adc;
          const mq2Adc = telem?.mq2_adc;
          const lat = telem?.latitude ?? st.latitude;
          const lng = telem?.longitude ?? st.longitude;
          if (!temGpsValido(lat, lng)) return null;
          const satelites = telem?.satelites;
          const altitude = telem?.altitude_m ?? telem?.altitude;

          return (
            <Marker
              key={`st-${st.id}`}
              position={[Number(lat), Number(lng)]}
              icon={envStationIcon}
            >
              <Popup>
                <div className="p-1 min-w-[240px] max-w-[270px]">
                  <div className="flex items-center justify-between border-b pb-1.5 mb-2">
                    <span className="font-bold text-graphiteText text-sm">🌤️ {nome}</span>
                    {modo && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700">
                        {modo}
                      </span>
                    )}
                  </div>

                  {telem ? (
                    <div className="space-y-1 text-xs text-graphiteText">
                      {modo && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Modo:</span>
                          <span className="font-bold font-mono text-gray-800">{modo}</span>
                        </div>
                      )}

                      {batPercentual !== undefined && batPercentual !== null && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Bateria simulada:</span>
                          <span className="font-bold font-mono">
                            {Number(batPercentual).toFixed(1)}% {batStatus && `(${batStatus})`}
                          </span>
                        </div>
                      )}

                      {tempAr !== undefined && tempAr !== null && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Temperatura do ar:</span>
                          <span className="font-bold font-mono text-gray-800">{Number(tempAr).toFixed(2)} °C</span>
                        </div>
                      )}

                      {umidAr !== undefined && umidAr !== null && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Umidade do ar:</span>
                          <span className="font-bold font-mono text-gray-800">{Number(umidAr).toFixed(2)} %</span>
                        </div>
                      )}

                      {pressao !== undefined && pressao !== null && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Pressão:</span>
                          <span className="font-bold font-mono text-gray-800">{Number(pressao).toFixed(2)} hPa</span>
                        </div>
                      )}

                      {chuva !== undefined && chuva !== null && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Chuva:</span>
                          <span className={`font-bold text-[11px] px-1.5 py-0.5 rounded ${isChovendo ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                            {isChovendo ? 'SIM' : 'NÃO'}
                          </span>
                        </div>
                      )}

                      {tempSolo !== undefined && tempSolo !== null && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Temperatura do solo:</span>
                          <span className="font-bold font-mono text-gray-800">
                            {tempSolo === -127 || tempSolo < -100 ? `${Number(tempSolo).toFixed(1)} °C (Desc.)` : `${Number(tempSolo).toFixed(2)} °C`}
                          </span>
                        </div>
                      )}

                      {umidSolo !== undefined && umidSolo !== null && (
                        <div className="flex items-center justify-between border-t pt-1">
                          <span className="text-gray-500">Umidade do solo:</span>
                          <span className={`font-bold font-mono ${umidSolo < 20 ? 'text-alertAmber' : 'text-natureGreen'}`}>
                            {Number(umidSolo).toFixed(1)} % {umidSolo < 20 && '(SECO)'}
                          </span>
                        </div>
                      )}

                      {umidSoloAdc !== undefined && umidSoloAdc !== null && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Umidade solo ADC:</span>
                          <span className="font-mono text-gray-700">{umidSoloAdc}</span>
                        </div>
                      )}

                      {lumAdc !== undefined && lumAdc !== null && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Luminosidade ADC:</span>
                          <span className="font-mono text-gray-700">{lumAdc}</span>
                        </div>
                      )}

                      {mq2Adc !== undefined && mq2Adc !== null && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">MQ-2 ADC:</span>
                          <span className="font-mono text-gray-700">{mq2Adc}</span>
                        </div>
                      )}

                      {lat !== undefined && lng !== undefined && lat !== null && lng !== null && (
                        <div className="border-t pt-1 space-y-0.5 text-[11px]">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500">Latitude:</span>
                            <span className="font-mono text-gray-700">{Number(lat).toFixed(6)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500">Longitude:</span>
                            <span className="font-mono text-gray-700">{Number(lng).toFixed(6)}</span>
                          </div>
                        </div>
                      )}

                      {(satelites !== undefined || altitude !== undefined) && (
                        <div className="flex items-center justify-between text-[11px] text-gray-500 font-mono">
                          {satelites !== undefined && <span>Satélites: {satelites}</span>}
                          {altitude !== undefined && <span>Altitude: {Number(altitude).toFixed(1)} m</span>}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">Aguardando telemetria...</p>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};
