// Thin line icons (stroke 1.75) in the identity-board style: materials, data, matching, industry, mine, truck.
const PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  layers: 'M12 3l9 5-9 5-9-5 9-5zm-9 9l9 5 9-5M3 16l9 5 9-5',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm10 17l-5-5',
  handshake: 'M3 12l4-4 4 2 3-3 7 7-4 4M7 8l-4 4 6 6 2-2m3 0l-2 2m5-5l-2 2',
  truck: 'M2 6h11v10H2zM13 10h4l4 4v2h-8zM6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  mine: 'M3 20l6-10 4 6 3-4 5 8zM8 6l2-3 2 3',
  factory: 'M3 21V10l5 3V10l5 3V5h4v16zM7 17h2m4 0h2',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
  shield: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  plus: 'M12 5v14M5 12h14',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  alert: 'M12 3l10 18H2zM12 10v4m0 3v.5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-10v6m0-9v.5',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12M18 6L6 18',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  doc: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6',
  pen: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  gauge: 'M4 16a8 8 0 1 1 16 0M12 16l4-5',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm-2.5-12a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14m0 3v.5',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3',
  refresh: 'M20 11a8 8 0 0 0-14-5l-2 2m0-4v4h4M4 13a8 8 0 0 0 14 5l2-2m0 4v-4h-4',
  map: 'M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2zM9 4v14m6-12v14',
  pin: 'M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1m-2 8a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7-3l2-1-2-4-2 1-2-1V5h-4v2l-2 1-2-1-2 4 2 1v2l-2 1 2 4 2-1 2 1v2h4v-2l2-1 2 1 2-4-2-1z',
  arrow: 'M19 12H5m6-6l-6 6 6 6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  tag: 'M3 12V4h8l10 10-8 8zM7 8h.01',
  upload: 'M12 16V4m-5 5l5-5 5 5M4 20h16',
  download: 'M12 4v12m-5-5l5 5 5-5M4 20h16',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
} as const;

export type IconName = keyof typeof PATHS;

/** Directional icons (arrow) mirror in RTL; non-directional ones (truck, mine) do not (UI_UX §1.2). */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className ?? 'size-5'} ${name === 'arrow' ? 'rtl:-scale-x-100' : ''}`}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
