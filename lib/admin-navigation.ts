export const adminSections=['overview','users','properties','reviews','operator','moderation','policy','revenue','health'] as const;
export type AdminSection=typeof adminSections[number];
export function adminSection(value:unknown):AdminSection{return adminSections.includes(value as AdminSection)?value as AdminSection:'overview';}
export function adminSectionPath(value:unknown){const section=adminSection(value);return section==='overview'?'/admin':'/admin?section='+section;}
