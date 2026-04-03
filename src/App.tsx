import { useState, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { GridCellLayer } from '@deck.gl/layers';
import { fromUrl } from 'geotiff';
import * as d3color from 'd3-color';
import { interpolateBuGn } from 'd3-scale-chromatic';
import './App.css';

const CELL_SIZE = 0.000833; // rough degrees
const scaleUnit = 5;
const roughMeter = 70;

interface MapData {
  value: number;
  x: number;
  y: number;
  color: [number, number, number, number];
}

const minMax = [0.000, 553.115];
const max = minMax[1];

const INITIAL_VIEW_STATE = {
  longitude: 127.5,
  latitude: 36,
  zoom: 9,
  pitch: 55,
  bearing: -20,
};

async function loadGeoTIFF(url: string) {
  const tiff = await fromUrl(url);
  const image = await tiff.getImage();
  const rasterData = await image.readRasters();

  const width = image.getWidth();
  const height = image.getHeight();
  const bbox = image.getBoundingBox(); // [minX, minY, maxX, maxY] in degrees

  console.log('GeoTIFF loaded:', { width, height, bbox });

  return { width, height, bbox, rasterData };
}

function App() {
  const [mapData, setMapData] = useState<MapData[]>([]);
  const [zoom, setZoom] = useState(INITIAL_VIEW_STATE.zoom);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const { width, height, bbox, rasterData } = await loadGeoTIFF(
          'https://odd-tiles.s3.us-east-1.amazonaws.com/pop-cog/2025/100m/total.tif'
        );
        const [minX, minY] = bbox;
        const data = rasterData[0] as Float32Array | Float64Array;

        const temp: MapData[] = [];

        for (let i = 0; i < width; i +=scaleUnit) {
          for (let j = 0; j < height; j+=scaleUnit) {
            const value = data[(width * j) + i];
          if (value && value !== -99999 && value >= 0) {
            const gridX = i ;
            const gridY = height - j;
            const rounded = Math.round(value) + 1;
            const rgbValue = d3color.rgb(interpolateBuGn(rounded / max));
            temp.push({
              // extracting with 0 value gives glitch
              value: rounded,
              x: minX + gridX * CELL_SIZE,
              y: minY + gridY * CELL_SIZE,
              color: [rgbValue.r, rgbValue.g, rgbValue.b, 255],
            });
           }
          }
        }

        console.log(`Map data created: ${temp.length} cells`);
        setMapData(temp);

        setLoading(false);
      } catch (error) {
        console.error('Error loading GeoTIFF:', error);
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // const onHover = useCallback((info: { x: number; y: number; object?: MapData }) => {
  //   if (info.object) {
  //     setTooltip({ x: info.x, y: info.y, object: info.object });
  //   } else {
  //     setTooltip(null);
  //   }
  // }, []);

  // dynamic extrusion value
  const elevationScale = Math.min(50, 25 * Math.pow(1 / 75, (zoom - 9) / 3));

  const layers = [
    new GridCellLayer<MapData>({
      id: 'grid-layer',
      data: mapData,
      // pickable: true,
      extruded: true,
      cellSize: roughMeter * scaleUnit,// * Math.sqrt(scaleUnit), // meters
      getPosition: (d) => [d.x, d.y],
      getElevation: (d) => {
        return d.value *1.2
      },
      getFillColor: (d) => d.color,
      elevationScale,
      // onHover,
    })
  ];

  return (
    <div className="map-container">
      {loading && (
        <div className="loader">
          <div className="spinner" />
          <div>Loading Data...</div>
        </div>
      )}
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        onViewStateChange={({ viewState }) => setZoom(viewState.zoom)}
        controller={true}
        layers={layers}
        // mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
      />

    </div>
  );
}

export default App;
