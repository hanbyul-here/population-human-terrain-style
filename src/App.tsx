import { useState, useEffect, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import {GridCellLayer} from '@deck.gl/layers';
import { fromUrl } from 'geotiff';

import * as d3color from 'd3-color';

import { interpolateBuPu } from 'd3-scale-chromatic';
import 'maplibre-gl/dist/maplibre-gl.css';
import './App.css';
const CELL_SIZE = 0.000833; // degrees
const scaleUnit = 1;
const roughMeter = 70;

interface MapData {
  value: number;
  x: number;
  y: number;
}

interface TooltipInfo {
  x: number;
  y: number;
  object: MapData | null;
}
const minMax = [0.000, 553.115];
const max = minMax[1];

const INITIAL_VIEW_STATE = {
  longitude: 127.5,
  latitude: 36,
  zoom: 7,
  pitch: 60,
  bearing: -30,
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
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  // const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const { width, height, bbox, rasterData } = await loadGeoTIFF(
          'https://odd-tiles.s3.us-east-1.amazonaws.com/pop-cog/2025/100m/total.tif'
          //'https://odd-tiles.s3.us-east-1.amazonaws.com/pop-cog/2025/pop_t_cog.tif' : 1km
          
        );

        const [minX, minY, maxX, maxY] = bbox;
        const data = rasterData[0] as Float32Array | Float64Array;

        const temp: MapData[] = [];
        for (let i = 0; i < data.length; i+=scaleUnit) {
          const value = data[i];
          if (value && value !== -99999) {
            const gridX = i % width;
            const gridY = height - Math.floor(i / width);
            temp.push({
              value: value,
              x: minX + gridX * CELL_SIZE,
              y: minY + gridY * CELL_SIZE,
            });
          }
        }

        console.log(`Map data created: ${temp.length} cells`);
        setMapData(temp);

        // Update view to center on data
        setViewState((prev) => ({
          ...prev,
          longitude: (minX + maxX) / 2,
          latitude: (minY + maxY) / 2,
        }));

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

  // Calculate elevationScale based on zoom level

  const layers = [
    new GridCellLayer<MapData>({
      id: 'grid-layer',
      data: mapData,
      // pickable: true,
      extruded: true,
      cellSize: roughMeter * scaleUnit, // meters
      getPosition: (d) => [d.x, d.y],
      getElevation: (d) => d.value,
      getFillColor: (d) => {
        const rgbValue = d3color.rgb(interpolateBuPu(d.value / max));
        return [rgbValue.r, rgbValue.g, rgbValue.b, 255];
      },
      elevationScale: 35,
      // transitions: {
      //   elevationScale: {
      //     duration: 300,
      //     // easing: (t: number) => t, // linear easing
      //   },
      // },
      // onHover,
    }),
  ];

  return (
    <div className="map-container">
      {loading && (
        <div className="loader">
          <div className="spinner" />
          <div>Loading GeoTIFF...</div>
        </div>
      )}
      <DeckGL
        // viewState={viewState}
        initialViewState={INITIAL_VIEW_STATE}
        // onViewStateChange={({ viewState }) => setViewState(viewState)}
        controller={true}
        layers={layers}
        // mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
      />

    </div>
  );
}

export default App;
