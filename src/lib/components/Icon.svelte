<script>
  import { icons } from '../icons.js';
  let { name, size = 22, stroke = 1.9, color = 'currentColor', style = '' } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  {style}
  aria-hidden="true"
>
  <g stroke={color} stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round">
    {@html icons[name] || ''}
  </g>
</svg>
