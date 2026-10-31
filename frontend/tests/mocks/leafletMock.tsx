import React from "react";

export function MapContainer(props: any) {
  return (
    <div
      data-testid="map-container"
      className={`leaflet-container ${props.className ?? ""}`}
      style={props.style}
    >
      {props.children}
    </div>
  );
}

export function GeoJSON(props: any) {
  return (
    <div
      data-testid="geojson-layer"
      data-has-data={props.data ? "true" : "false"}
    />
  );
}

export function TileLayer(props: any) {
  return <div data-testid="tile-layer" data-url={props.url} />;
}

export function LayersControl(props: any) {
  return <div data-testid="layers-control">{props.children}</div>;
}

LayersControl.BaseLayer = function BaseLayer(props: any) {
  return (
    <div data-testid="base-layer" data-name={props.name} data-checked={props.checked ? "true" : "false"}>
      {props.children}
    </div>
  );
};

LayersControl.Overlay = function Overlay(props: any) {
  return (
    <div data-testid="overlay-layer" data-name={props.name} data-checked={props.checked ? "true" : "false"}>
      {props.children}
    </div>
  );
};

export function ZoomControl(props: any) {
  return <div data-testid="zoom-control" data-position={props.position} />;
}

export function AttributionControl(props: any) {
  return <div data-testid="attribution-control" />;
}

export function Marker(props: any) {
  return (
    <div data-testid="marker" data-position={JSON.stringify(props.position)}>
      {props.children}
    </div>
  );
}

export function Popup(props: any) {
  return (
    <div data-testid="popup" className="leaflet-popup">
      {props.children}
    </div>
  );
}

export function FeatureGroup(props: any) {
  return <div data-testid="feature-group">{props.children}</div>;
}

export function Circle(props: any) {
  return <div data-testid="circle">{props.children}</div>;
}

export function CircleMarker(props: any) {
  return <div data-testid="circle-marker">{props.children}</div>;
}

export function Tooltip(props: any) {
  return <div data-testid="tooltip">{props.children}</div>;
}

export function useMap() {
  return {
    flyTo: () => {},
    setView: () => {},
    getZoom: () => 5,
    on: () => {},
    off: () => {},
  };
}

const L = {
  divIcon: (opts: any) => ({
    options: opts,
    _isMockDivIcon: true,
  }),
  latLng: (lat: number, lng: number) => ({ lat, lng }),
  geoJSON: () => ({
    setStyle: () => {},
    resetStyle: () => {},
  }),
};

export default L;
