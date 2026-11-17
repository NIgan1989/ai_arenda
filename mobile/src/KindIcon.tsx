import React from 'react';
import { Image, type ImageSourcePropType } from 'react-native';
import { C } from './styles';

// One line icon for every type of object and for the categories, drawn from the same library as the menu
// (scripts/export-navigation-icons.mjs). The pictures are black on clear and take the colour given here.
const ICONS: Record<string, ImageSourcePropType> = {
  any: require('../assets/kinds/any.png'),
  stay: require('../assets/kinds/stay.png'),
  bath: require('../assets/kinds/bath.png'),
  apartment: require('../assets/kinds/apartment.png'),
  studio: require('../assets/kinds/studio.png'),
  room: require('../assets/kinds/room.png'),
  house: require('../assets/kinds/house.png'),
  guesthouse: require('../assets/kinds/guesthouse.png'),
  hostel: require('../assets/kinds/hostel.png'),
  hotel: require('../assets/kinds/hotel.png'),
  aparthotel: require('../assets/kinds/aparthotel.png'),
  banya: require('../assets/kinds/banya.png'),
  sauna: require('../assets/kinds/sauna.png'),
  banquet: require('../assets/kinds/banquet.png'),
  cafe: require('../assets/kinds/cafe.png')
};

export function KindIcon({ id, size = 20, color = C.inkSoft }: { id: string; size?: number; color?: string }) {
  return <Image source={ICONS[id] || ICONS.any} style={{ width: size, height: size, tintColor: color }} accessibilityIgnoresInvertColors />;
}
