import { useState, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import {type MapViewState} from '@deck.gl/core';
import { GridCellLayer } from '@deck.gl/layers';
import { fromUrl } from 'geotiff';
// @ts-expect-error d3 related type error, too lazy to handle
import * as d3color from 'd3-color';
// @ts-expect-error d3 related type error, too lazy to handle
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

  const data = rasterData[0] as Float32Array | Float64Array;
  const noData = image.getGDALNoData();

  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v === noData || !Number.isFinite(v)) continue;
    if (v > max) max = v;
  }

  console.log('GeoTIFF loaded:', { width, height, bbox, max });

  return { width, height, bbox, rasterData, max };
}

function App() {
  const [mapData, setMapData] = useState<MapData[]>([]);
  const [aggMax, setAggMax] = useState(1);
  const [zoom, setZoom] = useState(INITIAL_VIEW_STATE.zoom);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const { width, height, bbox, rasterData } = await loadGeoTIFF(
            'https://sk-population.s3.us-east-1.amazonaws.com/pop-cog/2025/100m/total.tif'
        );
        const [minX, minY] = bbox;
        const data = rasterData[0] as Float32Array | Float64Array;

        const temp: MapData[] = [];
        let computedMax = 0;

        for (let i = 0; i < width; i += scaleUnit) {
          for (let j = 0; j < height; j += scaleUnit) {
            let sum = 0;
            for (let di = 0; di < scaleUnit && i + di < width; di++) {
              for (let dj = 0; dj < scaleUnit && j + dj < height; dj++) {
                const v = data[width * (j + dj) + (i + di)];
                if (v && v !== -99999 && v >= 0) {
                  sum += v;
                }
              }
            }
            if (sum > 0) {
              const gridX = i;
              const gridY = height - j;
              const value = Math.round(sum) + 1;
              if (value > computedMax) computedMax = value;
              temp.push({
                value,
                x: minX + gridX * CELL_SIZE,
                y: minY + gridY * CELL_SIZE,
                color: [0, 0, 0, 255],
              });
            }
          }
        }

        // Assign colors using computed max
        for (const d of temp) {
          const rgbValue = d3color.rgb(interpolateBuGn(d.value / computedMax));
          d.color = [rgbValue.r, rgbValue.g, rgbValue.b, 255];
        }

        console.log(`Map data created: ${temp.length} cells, aggMax: ${computedMax}`);
        setAggMax(computedMax);
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
  const elevationScale = Math.min(15000, 10000 * Math.pow(1 / 75, (zoom - 9) / 3));

  const layers = [
    new GridCellLayer<MapData>({
      id: 'grid-layer',
      data: mapData,
      // pickable: true,
      extruded: true,
      cellSize: roughMeter * scaleUnit,// * Math.sqrt(scaleUnit), // meters
      getPosition: (d) => [d.x, d.y],
      getElevation: (d) => (d.value / aggMax),
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
        onViewStateChange={({ viewState }) => setZoom((viewState as MapViewState).zoom)}
        controller={true}
        layers={layers}
        // mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
      />

    </div>
  );
}

export default App;
