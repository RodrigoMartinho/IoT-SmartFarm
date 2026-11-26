from app.services.geofence import is_point_inside_polygon

def test_point_inside_polygon(poligono_fazenda):
    """Ponto situado no centro do polígono da fazenda deve retornar True."""
    lat_centro = -21.137500
    lng_centro = -48.970000
    dentro = is_point_inside_polygon(lat_centro, lng_centro, poligono_fazenda)
    assert dentro is True

def test_point_outside_polygon(poligono_fazenda):
    """Ponto situado longe do polígono da fazenda deve retornar False (fuga)."""
    lat_fora = -21.160000
    lng_fora = -49.010000
    dentro = is_point_inside_polygon(lat_fora, lng_fora, poligono_fazenda)
    assert dentro is False

def test_invalid_geojson_safe_fallback():
    """GeoJSON vazio ou malformado não deve quebrar a aplicação e deve retornar True por segurança."""
    geojson_vazio = {}
    resultado = is_point_inside_polygon(-21.137500, -48.970000, geojson_vazio)
    assert resultado is True

def test_insufficient_coordinates_safe_fallback():
    """Polígono com menos de 3 vértices deve acionar o fallback seguro."""
    geojson_invalido = {
        "type": "Polygon",
        "coordinates": [
            [
                [-21.135000, -48.975000],
                [-21.135000, -48.965000]
            ]
        ]
    }
    resultado = is_point_inside_polygon(-21.137500, -48.970000, geojson_invalido)
    assert resultado is True

