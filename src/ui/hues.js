// Categorical colour per skill.
//
// Assigned by position in the skill list rather than by hashing the id, so the
// first six skills are guaranteed to be visually distinct — a hash would happily
// give two of three skills the same hue and defeat the point.

export const HUE_COUNT = 6;

export function skillHue(store, skillId) {
  const index = store.skills.findIndex((s) => s.id === skillId);
  return index < 0 ? 1 : (index % HUE_COUNT) + 1;
}

/** Attributes that colour an element with its skill's hue. */
export function hueAttrs(store, skillId) {
  return { dataset: { hue: String(skillHue(store, skillId)) } };
}
