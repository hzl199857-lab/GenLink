'use client';

import React from 'react';
import {
  AlignLeft,
  Globe2,
  Image as ImageIcon,
  Clapperboard,
  Grid2x2,
  Upload,
  Video,
  Volume2,
} from 'lucide-react';

export type AddNodeMenuAction =
  | 'text'
  | 'image_generation'
  | 'video_generation'
  | 'panorama-360'
  | 'video'
  | 'audio'
  | 'storyboard_script'
  | 'storyboard_grid'
  | 'upload';

export interface AddNodeMenuProps {
  x: number;
  y: number;
  onSelect?: (action: AddNodeMenuAction) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const ADD_NODE_LABEL = '\u6dfb\u52a0\u8282\u70b9';
const UPLOAD_FILE_LABEL = '\u4e0a\u4f20\u6587\u4ef6';
const UPLOAD_DESCRIPTION = '\u56fe\u7247\u3001\u89c6\u9891\u3001\u97f3\u9891\u6587\u4ef6';

type MenuItem = {
  action: AddNodeMenuAction;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
};

const GENERATION_ITEMS: MenuItem[] = [
  {
    action: 'text',
    title: '\u6587\u672c',
    description: '\u63d0\u793a\u8bcd\u3001\u8bf4\u660e\u3001\u6587\u6848',
    icon: AlignLeft,
  },
  {
    action: 'image_generation',
    title: '\u56fe\u50cf',
    description: '\u751f\u56fe\u3001\u53c2\u8003\u56fe\u3001\u6d77\u62a5',
    icon: ImageIcon,
  },
  {
    action: 'video_generation',
    title: '\u89c6\u9891',
    description: '\u77ed\u7247\u3001\u8f6c\u573a\u3001\u52a8\u6001\u753b\u9762',
    icon: Video,
  },
  {
    action: 'audio',
    title: '\u97f3\u9891',
    description: '\u914d\u4e50\u3001\u97f3\u6548\u3001\u65c1\u767d',
    icon: Volume2,
  },
];

const FUNCTION_ITEMS: MenuItem[] = [
  {
    action: 'panorama-360',
    title: '360\u5168\u666f\u56fe',
    description: '\u5168\u666f\u573a\u666f\u3001\u7a7a\u95f4\u9884\u89c8',
    icon: Globe2,
  },
  {
    action: 'storyboard_script',
    title: '\u5206\u955c\u811a\u672c',
    description: '\u955c\u5934\u3001\u63d0\u793a\u8bcd\u3001\u8282\u594f',
    icon: Clapperboard,
  },
  {
    action: 'storyboard_grid',
    title: '\u5206\u955c\u683c\u5b50',
    description: '\u62fc\u7248\u3001\u5bab\u683c\u3001\u5408\u6210\u56fe\u50cf',
    icon: Grid2x2,
  },
];

const RESOURCE_ITEMS: MenuItem[] = [
  {
    action: 'upload',
    title: UPLOAD_FILE_LABEL,
    description: UPLOAD_DESCRIPTION,
    icon: Upload,
  },
];

const MENU_SECTIONS: Array<{
  title: string;
  items: MenuItem[];
}> = [
  {
    title: '\u751f\u6210\u8282\u70b9',
    items: GENERATION_ITEMS,
  },
  {
    title: '\u529f\u80fd\u8282\u70b9',
    items: FUNCTION_ITEMS,
  },
  {
    title: '\u4e0a\u4f20\u8d44\u6e90',
    items: RESOURCE_ITEMS,
  },
];

function MenuSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1 pb-1.5 pt-1 text-[11px] font-semibold text-gl-text-muted">
      <span>{children}</span>
      <span className="h-px flex-1 bg-white/[0.06]" />
    </div>
  );
}

function AddNodeMenuItem({
  item,
  onSelect,
}: {
  item: MenuItem;
  onSelect?: (action: AddNodeMenuAction) => void;
}) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(item.action)}
      className="group flex min-h-[28px] w-full items-start gap-2 overflow-hidden rounded-[8px] px-2 py-1.5 text-left transition-[background-color,min-height] duration-200 ease-out hover:min-h-[46px] hover:bg-white/[0.07] focus-visible:min-h-[46px] focus-visible:bg-white/[0.07] focus-visible:outline-none"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-white/[0.06] text-gl-text-secondary transition-colors duration-200 group-hover:bg-white/[0.09] group-hover:text-gl-text-primary group-focus-visible:bg-white/[0.09] group-focus-visible:text-gl-text-primary">
        <Icon size={14} strokeWidth={1.9} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[13px] font-medium leading-6 text-gl-text-primary">{item.title}</span>
        <span className="max-h-0 -translate-y-1 truncate text-[10px] font-medium leading-[14px] text-gl-text-muted opacity-0 transition-[max-height,opacity,transform] duration-200 ease-out group-hover:max-h-[14px] group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:max-h-[14px] group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
          {item.description}
        </span>
      </span>
    </button>
  );
}

export function AddNodeMenu({ x, y, onSelect, onMouseEnter, onMouseLeave }: AddNodeMenuProps) {
  return (
    <div
      className="fixed z-[65] w-[196px] rounded-[12px] border border-white/10 bg-[#191A1C]/95 p-2 shadow-[0_18px_42px_rgba(0,0,0,0.48)] backdrop-blur-xl"
      style={{ left: x, top: y }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <span className="sr-only">{ADD_NODE_LABEL}</span>
      {MENU_SECTIONS.map((section, sectionIndex) => (
        <div key={section.title} className={sectionIndex === 0 ? undefined : 'mt-1'}>
          <MenuSectionTitle>{section.title}</MenuSectionTitle>
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <AddNodeMenuItem
                key={item.action}
                item={item}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
