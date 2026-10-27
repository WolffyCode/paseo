/**
 * The task manager's glyphs, from Chrome 155's vector icons (the "old" set its Mac build draws)
 * and its plugin favicon.
 */

export interface TaskManagerGlyph {
  viewBox: string;
  d: string;
  isEvenOdd?: boolean;
}

/** new_tab_refresh_old.icon: the 标签页和扩展程序 category. */
export const TABS_AND_EXTENSIONS_GLYPH: TaskManagerGlyph = {
  viewBox: "0 0 16 16",
  d: "M2.85 11.55h10.3V7.2H8.8V4.45H2.85Zm0 1.38c-0.38 0 -0.71 -0.13 -0.98 -0.4a1.34 1.34 0 0 1 -0.4 -0.98V4.44c0 -0.38 0.13 -0.71 0.4 -0.98c0.27 -0.27 0.6 -0.4 0.98 -0.4h10.31c0.38 0 0.71 0.13 0.98 0.4c0.27 0.27 0.4 0.6 0.4 0.98v7.11c0 0.38 -0.13 0.71 -0.4 0.98c-0.27 0.27 -0.6 0.4 -0.98 0.4Zm0 -1.38V4.45Z",
};

/** view_list_old.icon: the 所有任务 category. */
export const ALL_TASKS_GLYPH: TaskManagerGlyph = {
  viewBox: "0 0 24 24",
  d: "M9 18h11v-2.68H9ZM4 8.68h3V6H4Zm0 4.68h3v-2.68H4ZM4 18h3v-2.68H4Zm5 -4.65h11v-2.68H9Zm0 -4.68h11V6H9ZM4 20c-0.55 0 -1.02 -0.19 -1.41 -0.59A1.94 1.94 0 0 1 2 18V6c0 -0.55 0.2 -1.02 0.59 -1.41C2.98 4.2 3.45 4 4 4h16c0.55 0 1.02 0.2 1.41 0.59c0.39 0.39 0.59 0.86 0.59 1.41v12c0 0.55 -0.19 1.02 -0.59 1.41c-0.39 0.39 -0.86 0.59 -1.41 0.59Z",
};

/** search_chrome_refresh_old.icon: the search field's 20 dip glyph. */
export const SEARCH_GLYPH: TaskManagerGlyph = {
  viewBox: "0 0 20 20",
  d: "m15.94 17l-4.98 -4.98a4.99 4.99 0 0 1 -1.37 0.72A4.71 4.71 0 0 1 8 13c-1.39 0 -2.57 -0.48 -3.54 -1.46C3.48 10.57 3 9.39 3 8c0 -1.39 0.48 -2.57 1.46 -3.54C5.43 3.48 6.61 3 8 3c1.39 0 2.57 0.48 3.54 1.46C12.52 5.43 13 6.61 13 8c0 0.56 -0.09 1.09 -0.26 1.59c-0.17 0.5 -0.41 0.96 -0.72 1.37l4.98 4.98ZM8 11.5c0.97 0 1.8 -0.34 2.48 -1.02c0.68 -0.68 1.02 -1.51 1.02 -2.48c0 -0.97 -0.34 -1.8 -1.02 -2.48C9.8 4.84 8.97 4.5 8 4.5c-0.97 0 -1.8 0.34 -2.48 1.02C4.84 6.2 4.5 7.03 4.5 8c0 0.97 0.34 1.8 1.02 2.48c0.68 0.68 1.51 1.02 2.48 1.02Z",
};

/** close_chrome_refresh_old.icon: the search field's clear button. */
export const CLEAR_GLYPH: TaskManagerGlyph = {
  viewBox: "0 0 20 20",
  d: "M6.06 15L5 13.94L8.94 10L5 6.06L6.06 5L10 8.94L13.94 5L15 6.06L11.06 10L15 13.94L13.94 15L10 11.06Z",
};

/** IDR_PLUGINS_FAVICON at 2x: the GPU, utility and renderer rows' blue puzzle piece. */
export const PLUGIN_FAVICON_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABdklEQVR42mIYUmAUyJS9MZMCsFvWWBEEQRjO8BPMuiW4xEQcgMN0L27RhrhEeM4JcPecG3QN7s4wPy5rzauHBxWt1PdmfilJs4agQ4dQS66wWfppy43abZe9eN8QynocG+LEGTZDnwLgECSw9N1IavycJyBUezQAh1R97MuC7VZqTpOZ9XIcYeqJDkDDb7/rbbLSPiayKjMIcRmCbqIs0xqHoHWX3MnVe89STeoviw+hKTR1xgmA0XodhqArbgBo4ucA/AN45J7PXUV+R4Uqc0ga4gBATiCskJjasW3/MMJrS3WiVWCwkA1xzgyxpFtCG6y6kHSQ9PKSJivDBrhgBpjV0IDZwusK2sdRE7uMJOVjXFKV26QjHEsfWrQd9wSOmkSdb31yDugDQBMQJtzx6QDQBIT5wqKRTwOAJqILlYbYAOJZDsKM9hvEdhzV3+C804nesVh/BndE+w26gy31fGLXA4hoT0ILQNLl7YD4ELjyGexgFAAApk90bdy62h8AAAAASUVORK5CYII=";
