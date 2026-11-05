<script lang="ts">
  // Shared SVG filters, defined once per page and referenced by id
  // (filter: url(#ink-edge)). Kept rendered at zero size: a display:none SVG
  // would disable its filters.
</script>
<svg class="defs" width="0" height="0" aria-hidden="true" focusable="false">
  <defs>
    <!-- An inked rule: the line wobbles a little, and the ink is broken in places. -->
    <filter id="ink-edge" x="-3%" y="-3%" width="106%" height="106%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="warp" />
      <feDisplacementMap in="SourceGraphic" in2="warp" scale="4" xChannelSelector="R" yChannelSelector="G" result="wobbly" />
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="2" result="speck" />
      <feColorMatrix in="speck" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2 1.6" result="mask" />
      <feComposite in="wobbly" in2="mask" operator="in" />
    </filter>
  </defs>
</svg>

<style>
  .defs {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
    pointer-events: none;
  }
</style>
