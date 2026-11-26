from typing import Dict, Any, List
from shapely.geometry import Polygon, Point

def create_polygon_from_geojson(geojson_dict: Dict[str, Any]) -> Polygon:
    """
    Converte um dicionário GeoJSON Polygon em um objeto Polygon do Shapely.
    Suporta formato GeoJSON Padrão (coordinates: [[[lng, lat], [lng, lat], ...]])
    ou lista de pontos [lat, lng].
    """
    coordinates = []
    if "coordinates" in geojson_dict:
        coords_raw = geojson_dict["coordinates"]
        if isinstance(coords_raw, list) and len(coords_raw) > 0:
            # Se for array 3D: [[[lat, lng], ...]]
            ring = coords_raw[0] if isinstance(coords_raw[0], list) else coords_raw
            for pt in ring:
                if len(pt) >= 2:
                    # Garantir tupla (lat, lng)
                    coordinates.append((pt[0], pt[1]))
    
    if len(coordinates) < 3:
        raise ValueError("Um polígono precisa ter pelo menos 3 pontos.")
        
    return Polygon(coordinates)

def is_point_inside_polygon(lat: float, lng: float, geojson_polygon: Dict[str, Any]) -> bool:
    """
    Verifica se a coordenada (lat, lng) está contida dentro do polígono da propriedade.
    """
    try:
        poly = create_polygon_from_geojson(geojson_polygon)
        
        # Testamos ambas as convenções (lat, lng) e (lng, lat) no ponto caso a ordem seja invertida no polígono
        point_1 = Point(lat, lng)
        point_2 = Point(lng, lat)
        
        return poly.contains(point_1) or poly.contains(point_2)
    except Exception as e:
        print(f"Erro ao verificar Geofence: {e}")
        return True  # Fallback seguro para não gerar falso alarme em erro de parse

