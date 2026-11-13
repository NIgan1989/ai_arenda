// The map of the home screen. On a phone it is MapLibre (LiveMap.native.tsx); in the web preview of the app, which has no
// native map, it is the tile map. Both take the same props, so the screens never know which one they show.
export {TileMap as LiveMap} from './TileMap';
export type {MapPin} from './TileMap';
