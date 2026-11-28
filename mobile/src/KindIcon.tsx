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
  // «База отдыха»: houses among the trees, the same line drawing as the guest house.
  resort: require('../assets/kinds/guesthouse.png'),
  banya: require('../assets/kinds/banya.png'),
  sauna: require('../assets/kinds/sauna.png'),
  banquet: require('../assets/kinds/banquet.png'),
  cafe: require('../assets/kinds/cafe.png'),
  cleaning: require('../assets/kinds/cleaning.png'),
  // «Досуг», «Спорт», «Авто» and their kinds (2026-11-28).
  leisure: require('../assets/kinds/leisure.png'),
  sport: require('../assets/kinds/sport.png'),
  auto: require('../assets/kinds/auto.png'),
  loft: require('../assets/kinds/loft.png'),
  photostudio: require('../assets/kinds/photostudio.png'),
  meeting: require('../assets/kinds/meeting.png'),
  karaoke_room: require('../assets/kinds/karaoke_room.png'),
  playroom: require('../assets/kinds/playroom.png'),
  gazebo: require('../assets/kinds/gazebo.png'),
  quest: require('../assets/kinds/quest.png'),
  field: require('../assets/kinds/field.png'),
  court: require('../assets/kinds/court.png'),
  sporthall: require('../assets/kinds/sporthall.png'),
  billiard: require('../assets/kinds/billiard.png'),
  gameclub: require('../assets/kinds/gameclub.png'),
  carwash: require('../assets/kinds/carwash.png'),
  tires: require('../assets/kinds/tires.png'),
  carservice: require('../assets/kinds/carservice.png'),
  detailing: require('../assets/kinds/detailing.png')
};

export function KindIcon({ id, size = 20, color = C.inkSoft }: { id: string; size?: number; color?: string }) {
  return <Image source={ICONS[id] || ICONS.any} style={{ width: size, height: size, tintColor: color }} accessibilityIgnoresInvertColors />;
}
