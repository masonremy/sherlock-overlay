// The streamer's own toolkit icons (icons/map.png and friends), fetched once
// per page. ToolIcon shows one where it exists, else its built-in drawing.

export const customIcons = $state<{ map?: string; newspaper?: string; notes?: string }>({});

let loaded = false;

export function loadCustomIcons(): void {
  if (loaded) return;
  loaded = true;
  fetch("/api/icons")
    .then((res) => (res.ok ? res.json() : {}))
    .then((icons) => Object.assign(customIcons, icons))
    .catch(() => {
      // No custom icons: the built-in drawings stay.
    });
}
