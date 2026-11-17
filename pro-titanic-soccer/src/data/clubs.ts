import { AvatarConfig, ClubConfig, PlayerProfile } from '../types/game';

export const CLUBS: ClubConfig[] = [
  {
    id: 'barcelona',
    name: 'FC Barcelona',
    shortName: 'FCB',
    primaryColor: '#004D98',
    secondaryColor: '#A50044',
    shortsColor: '#002F6C',
    socksColor: '#004D98',
    accentColor: '#EDBB00',
    pattern: 'stripes',
    awayPrimary: '#F4F6F9',
    awaySecondary: '#004D98',
    gkColor: '#22C55E',
  },
  {
    id: 'realmadrid',
    name: 'Real Madrid',
    shortName: 'RMA',
    primaryColor: '#F5F7FA',
    secondaryColor: '#D4AF37',
    shortsColor: '#FFFFFF',
    socksColor: '#F1F5F9',
    accentColor: '#1E3A8A',
    pattern: 'solid',
    awayPrimary: '#1E1B4B',
    awaySecondary: '#F59E0B',
    gkColor: '#F97316',
  },
  {
    id: 'psg',
    name: 'Paris Saint-Germain',
    shortName: 'PSG',
    primaryColor: '#0F2547',
    secondaryColor: '#DA291C',
    shortsColor: '#0F2547',
    socksColor: '#0F2547',
    accentColor: '#FFFFFF',
    pattern: 'sash',
    awayPrimary: '#F8FAFC',
    awaySecondary: '#DA291C',
    gkColor: '#EAB308',
  },
  {
    id: 'arsenal',
    name: 'Arsenal FC',
    shortName: 'ARS',
    primaryColor: '#EF0107',
    secondaryColor: '#FFFFFF',
    shortsColor: '#FFFFFF',
    socksColor: '#EF0107',
    accentColor: '#063672',
    pattern: 'halves',
    awayPrimary: '#111827',
    awaySecondary: '#FACC15',
    gkColor: '#06B6D4',
  },
  {
    id: 'chelsea',
    name: 'Chelsea FC',
    shortName: 'CHE',
    primaryColor: '#034694',
    secondaryColor: '#FFFFFF',
    shortsColor: '#034694',
    socksColor: '#FFFFFF',
    accentColor: '#DBA111',
    pattern: 'solid',
    awayPrimary: '#E2E8F0',
    awaySecondary: '#034694',
    gkColor: '#EC4899',
  },
  {
    id: 'mancity',
    name: 'Manchester City',
    shortName: 'MCI',
    primaryColor: '#6CABDD',
    secondaryColor: '#1C2C5B',
    shortsColor: '#FFFFFF',
    socksColor: '#6CABDD',
    accentColor: '#FFC659',
    pattern: 'solid',
    awayPrimary: '#2D1A2B',
    awaySecondary: '#6CABDD',
    gkColor: '#84CC16',
  },
  {
    id: 'manutd',
    name: 'Manchester United',
    shortName: 'MUN',
    primaryColor: '#DA291C',
    secondaryColor: '#111827',
    shortsColor: '#FFFFFF',
    socksColor: '#111827',
    accentColor: '#FBE122',
    pattern: 'solid',
    awayPrimary: '#064E3B',
    awaySecondary: '#F8FAFC',
    gkColor: '#A855F7',
  },
  {
    id: 'bayern',
    name: 'Bayern Munich',
    shortName: 'BAY',
    primaryColor: '#DC052D',
    secondaryColor: '#FFFFFF',
    shortsColor: '#DC052D',
    socksColor: '#DC052D',
    accentColor: '#0066B2',
    pattern: 'hoops',
    awayPrimary: '#18181B',
    awaySecondary: '#DC052D',
    gkColor: '#14B8A6',
  },
  {
    id: 'liverpool',
    name: 'Liverpool FC',
    shortName: 'LIV',
    primaryColor: '#C8102E',
    secondaryColor: '#F6EB61',
    shortsColor: '#C8102E',
    socksColor: '#C8102E',
    accentColor: '#00B2A9',
    pattern: 'solid',
    awayPrimary: '#F1F5F9',
    awaySecondary: '#065F46',
    gkColor: '#F59E0B',
  },
  {
    id: 'inter',
    name: 'Inter Milan',
    shortName: 'INT',
    primaryColor: '#010E80',
    secondaryColor: '#0B0F17',
    shortsColor: '#0B0F17',
    socksColor: '#010E80',
    accentColor: '#D4AF37',
    pattern: 'stripes',
    awayPrimary: '#F8FAFC',
    awaySecondary: '#010E80',
    gkColor: '#F43F5E',
  },
];

export const SKIN_TONES = [
  { id: 'light', label: 'Ivory', hex: '#F3C6A5' },
  { id: 'warm', label: 'Warm Tan', hex: '#D99B72' },
  { id: 'olive', label: 'Olive', hex: '#B97A57' },
  { id: 'deep', label: 'Deep Umber', hex: '#6F422B' },
];

export const HAIR_COLORS = [
  { id: 'obsidian', label: 'Obsidian', hex: '#1B1D24' },
  { id: 'chestnut', label: 'Chestnut', hex: '#5C3824' },
  { id: 'blonde', label: 'Gold Blonde', hex: '#D9AD4B' },
  { id: 'platinum', label: 'Platinum', hex: '#DCE3EC' },
];

export const HAIR_STYLES: {
  id: AvatarConfig['hairStyle'];
  label: string;
  hasPhysics?: boolean;
}[] = [
  { id: 'fade', label: 'Skin Fade' },
  { id: 'crop', label: 'Textured Crop' },
  { id: 'braids', label: 'Braids / Locs', hasPhysics: true },
  { id: 'buzz', label: 'Buzz Cut' },
  { id: 'curl', label: 'Curly Top', hasPhysics: true },
  { id: 'sweep', label: 'Flowing Sweep', hasPhysics: true },
  { id: 'headband', label: 'Headband Flow', hasPhysics: true },
];

export const BOOT_COLORS = [
  { id: 'volt', label: 'Volt Lime', hex: '#A3E635' },
  { id: 'crimson', label: 'Crimson', hex: '#EF4444' },
  { id: 'gold', label: 'Titanic Gold', hex: '#F59E0B' },
  { id: 'cyan', label: 'Electric Cyan', hex: '#06B6D4' },
];

export const DEFAULT_AVATAR: AvatarConfig = {
  skinTone: '#D99B72',
  hairColor: '#1B1D24',
  hairStyle: 'fade',
  bootColor: '#F59E0B',
};

export function getClubById(id: string): ClubConfig {
  return CLUBS.find((c) => c.id === id) ?? CLUBS[0];
}

export function createDefaultProfile(): PlayerProfile {
  const randomTag = Math.floor(10 + Math.random() * 89);
  return {
    id: `plr_${Math.random().toString(36).slice(2, 10)}`,
    playerName: `STRIKER_${randomTag}`,
    clubId: 'barcelona',
    jerseyText: 'TITANIC',
    jerseyNumber: 10,
    avatar: { ...DEFAULT_AVATAR },
    profileConfirmed: false,
  };
}
