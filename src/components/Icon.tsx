import type { SVGProps } from 'react';

export type IconName =
  | 'home' | 'library' | 'papers' | 'exam' | 'chat' | 'vocab' | 'settings'
  | 'plus' | 'upload' | 'download' | 'check' | 'x' | 'refresh' | 'sparkles'
  | 'trash' | 'edit' | 'play' | 'pause' | 'mic' | 'stop' | 'volume' | 'volume-off'
  | 'arrow-right' | 'arrow-left' | 'arrow-up-right' | 'chevron-down' | 'chevron-left' | 'chevron-right'
  | 'clock' | 'target' | 'chart' | 'flame' | 'search' | 'copy' | 'external'
  | 'book' | 'layers' | 'wand' | 'alert' | 'info' | 'headphones' | 'shuffle'
  | 'list' | 'grid' | 'calendar' | 'more' | 'eye' | 'eye-off' | 'key' | 'globe' | 'file';

const PATHS: Record<IconName, string> = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5',
  library: 'M4 5h6v14H4zM14 5h3v14h-3zM19.5 5.5 22 19',
  papers: 'M7 3h7l4 4v14H7zM14 3v4h4M9.5 12h6M9.5 16h6',
  exam: 'M5 4h14v16H5zM8.5 9l1.8 1.8L14 7M8.5 15l1.8 1.8L14 13',
  chat: 'M4 5h16v11H9l-5 4z',
  vocab: 'M4 5h7v14H4zM13 5h7v14h-7zM7.5 9h0M7.5 13h0',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z',
  plus: 'M12 5v14M5 12h14',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  check: 'M4 12.5 9 17.5 20 6.5',
  x: 'M6 6l12 12M18 6 6 18',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  play: 'M8 5l11 7-11 7z',
  pause: 'M8 5v14M16 5v14',
  mic: 'M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6',
  stop: 'M7 7h10v10H7z',
  volume: 'M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  'volume-off': 'M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6',
  'arrow-right': 'M4 12h16M14 6l6 6-6 6',
  'arrow-left': 'M20 12H4M10 6l-6 6 6 6',
  'arrow-up-right': 'M7 17 17 7M8 7h9v9',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-left': 'M15 5l-7 7 7 7',
  'chevron-right': 'M9 5l7 7-7 7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  flame: 'M12 3s5 4.5 5 9a5 5 0 0 1-10 0c0-1.6.7-3.2 1.7-4.5C9.5 9 12 8 12 3z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.5-4.5',
  copy: 'M9 9h10v12H9zM5 15V3h10',
  external: 'M14 4h6v6M20 4l-8 8M18 14v6H4V6h6',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5zM8 3v18',
  layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5M3 18l9 5 9-5',
  wand: 'M4 20 16 8M14 6l2-2M18 10l2-2M15 3l1 3M21 9l-3 1',
  alert: 'M12 3 2 21h20zM12 9v6M12 18h0',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h0',
  headphones: 'M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1zM20 14h-3v6h2a1 1 0 0 0 1-1z',
  shuffle: 'M3 7h4l10 10h4M17 3l4 4-4 4M3 17h4l3-3M17 13l4 4-4 4',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h0M3.5 12h0M3.5 18h0',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  calendar: 'M4 6h16v15H4zM8 3v5M16 3v5M4 11h16',
  more: 'M6 12h0M12 12h0M18 12h0',
  eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'eye-off': 'M4 4l16 16M9.5 6.5A10.7 10.7 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.7 8.2A16.5 16.5 0 0 0 2 12s3.5 6 10 6c1.3 0 2.5-.2 3.5-.6',
  key: 'M14.5 4a5.5 5.5 0 1 1-4 9.3L4 20l-1-3 2-2-1-2 2-2 3.2 3.2A5.5 5.5 0 0 1 14.5 4z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3z',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
