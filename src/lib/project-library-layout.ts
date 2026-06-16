export const PROJECT_LIBRARY_CARD_WIDTH = 220;
export const PROJECT_LIBRARY_CARD_PADDING = 8;
export const PROJECT_LIBRARY_MEDIA_WIDTH =
  PROJECT_LIBRARY_CARD_WIDTH - PROJECT_LIBRARY_CARD_PADDING * 2;
export const PROJECT_LIBRARY_THUMBNAIL_HEIGHT = Math.round(
  (PROJECT_LIBRARY_MEDIA_WIDTH * 4) / 3,
);
export const PROJECT_LIBRARY_CARD_HEIGHT = 351;

export const projectLibraryCardClassName =
  "rounded-gl-xl p-2 text-left transition duration-150 hover:-translate-y-0.5";

export const projectLibraryCardStyle = {
  width: PROJECT_LIBRARY_CARD_WIDTH,
  height: PROJECT_LIBRARY_CARD_HEIGHT,
};

export const projectLibraryCardSurfaceStyle = {
  backgroundColor: "#15171a",
  boxShadow:
    "0 0 0 1px rgba(255,255,255,0.16), 0 18px 42px rgba(0,0,0,0.38)",
};

export const projectLibraryThumbnailStyle = {
  width: "100%",
  height: PROJECT_LIBRARY_THUMBNAIL_HEIGHT,
};
