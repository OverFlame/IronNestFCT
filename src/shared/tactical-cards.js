(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IronNestTacticalCards = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TARGET_TYPES = Object.freeze({
    custom: Object.freeze({ label: '自定义标记', icon: 'map-reference-point', tone: 'marker' }),
    reference: Object.freeze({ label: '参考点', icon: 'map-reference-point', tone: 'green' }),
    friendly: Object.freeze({ label: '友军', icon: 'unit-friendly', tone: 'blue' }),
    'friendly-infantry': Object.freeze({ label: '友军步兵', icon: 'unit-friendly-infantry', tone: 'blue' }),
    'friendly-recon': Object.freeze({ label: '友军侦察', icon: 'unit-friendly-recon', tone: 'blue' }),
    'friendly-artillery': Object.freeze({ label: '友军火炮', icon: 'unit-friendly-artillery', tone: 'blue' }),
    'friendly-mechanized': Object.freeze({ label: '友军机械化', icon: 'unit-friendly-mechanized', tone: 'blue' }),
    enemy: Object.freeze({ label: '敌军', icon: 'unit-enemy', tone: 'red' }),
    'enemy-infantry': Object.freeze({ label: '敌军步兵', icon: 'unit-enemy-infantry', tone: 'red' }),
    'enemy-recon': Object.freeze({ label: '敌军侦察', icon: 'unit-enemy-recon', tone: 'red' }),
    'enemy-artillery': Object.freeze({ label: '敌军火炮', icon: 'unit-enemy-artillery', tone: 'red' }),
    'enemy-mechanized': Object.freeze({ label: '敌军机械化', icon: 'unit-enemy-mechanized', tone: 'red' }),
    'enemy-fdc': Object.freeze({ label: '敌军 FDC', icon: 'unit-enemy-fdc', tone: 'red' }),
    'enemy-supply': Object.freeze({ label: '敌军补给仓库', icon: 'unit-enemy-supply', tone: 'red' })
  });

  const MODIFIERS = Object.freeze({
    underground: Object.freeze({ label: '地下', icon: 'modifier-underground' }),
    highPriority: Object.freeze({ label: '高价值', icon: 'modifier-high-priority' }),
    building: Object.freeze({ label: '建筑', icon: 'modifier-building' })
  });

  const DISPLAY_NAME_BASES = Object.freeze({
    reference: '参考点',
    friendly: '友军',
    'friendly-infantry': '步兵',
    'friendly-recon': '侦察',
    'friendly-artillery': '火炮',
    'friendly-mechanized': '机械化部队',
    enemy: '敌军',
    'enemy-infantry': '步兵',
    'enemy-recon': '侦察',
    'enemy-artillery': '火炮',
    'enemy-mechanized': '机械化部队',
    'enemy-fdc': 'FDC',
    'enemy-supply': '补给仓库'
  });
  const NATO_NAMES = Object.freeze({ A: 'ALPHA', B: 'BRAVO', C: 'CHARLIE', D: 'DELTA', E: 'ECHO' });
  const MARKER_TYPE_TARGET_TYPES = Object.freeze({
    red: Object.freeze(['custom', 'enemy', 'enemy-infantry', 'enemy-recon', 'enemy-artillery', 'enemy-mechanized', 'enemy-fdc', 'enemy-supply']),
    green: Object.freeze(['custom', 'reference']),
    blue: Object.freeze(['custom', 'friendly', 'friendly-infantry', 'friendly-recon', 'friendly-artillery', 'friendly-mechanized'])
  });

  function defaultTargetType() {
    return 'custom';
  }

  function legacyMarkerDefaultType(markerType) {
    if (markerType === 'red') return 'enemy';
    if (markerType === 'blue') return 'friendly';
    if (markerType === 'green') return 'reference';
    return 'custom';
  }

  function normalizeTargetProfile(target) {
    const requestedType = TARGET_TYPES[target.targetType] ? target.targetType : defaultTargetType();
    const typeSelected = requestedType !== 'custom' && (target.typeSelected === true || (target.typeSelected == null && requestedType !== legacyMarkerDefaultType(target.markerType)));
    const targetType = typeSelected ? requestedType : 'custom';
    const modifiers = Object.fromEntries(Object.keys(MODIFIERS).map(key => [key, Boolean(target.modifiers?.[key])]));
    const note = typeof target.note === 'string' ? target.note.trim().slice(0, 240) : '';
    return { ...target, targetType, typeSelected, modifiers, note, focused: Boolean(target.focused) };
  }

  function targetTypesForMarker(markerType) {
    return MARKER_TYPE_TARGET_TYPES[markerType] || MARKER_TYPE_TARGET_TYPES.red;
  }

  function targetTone(target) {
    const profile = normalizeTargetProfile(target);
    const definition = TARGET_TYPES[profile.targetType];
    if (definition.tone !== 'marker') return definition.tone;
    return profile.markerType === 'blue' ? 'blue' : profile.markerType === 'green' ? 'green' : 'red';
  }

  function iconIdForTarget(target) {
    const profile = normalizeTargetProfile(target);
    if (profile.targetType !== 'custom') return TARGET_TYPES[profile.targetType].icon;
    return `marker-${profile.markerType}-${String(profile.markerCode).toLowerCase()}`;
  }

  function assignDisplayNames(targets) {
    const counts = new Map();
    return targets.map(target => {
      const profile = normalizeTargetProfile(target);
      const baseName = profile.targetType === 'reference'
        ? NATO_NAMES[String(profile.markerCode || '').toUpperCase()] || 'REFERENCE'
        : DISPLAY_NAME_BASES[profile.targetType];
      if (!baseName) return profile;
      const occurrence = (counts.get(baseName) || 0) + 1;
      counts.set(baseName, occurrence);
      return { ...profile, name: profile.targetType === 'reference' ? `${baseName}${occurrence > 1 ? `-${occurrence}` : ''}` : `${baseName}#${occurrence}` };
    });
  }

  return Object.freeze({ TARGET_TYPES, MODIFIERS, DISPLAY_NAME_BASES, NATO_NAMES, MARKER_TYPE_TARGET_TYPES, defaultTargetType, normalizeTargetProfile, targetTypesForMarker, targetTone, iconIdForTarget, assignDisplayNames });
});
