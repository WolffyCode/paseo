/**
 * codePilot 浅色主题 token —— GitHub Primer「github」浅色（themes/github.json 口径，内部命名 codePilot）。
 *
 * 白底 + 冷灰中性 + GitHub 蓝 #0969da 仅作点缀（主 CTA / 链接 / 聚焦环 / 品牌）。onboarding 首跑
 * （连上主机之前、没有主壳）固定用这套浅色呈现、不跟随系统亮暗 —— 故颜色集中此处、勿在屏内散落硬编码；
 * 后续主壳骨架复用同一份 token。深色变体本任务不渲染、不登记。
 *
 * 这些是「有意静态」的字面色值（见 docs/unistyles.md「Static Theme Imports」），不走 Unistyles 主题，
 * 因此不受 `setTheme` / adaptive 切换影响（正是 onboarding 要的「恒浅色」）。
 */
export const codePilotLight = {
  // 画布 / 卡面
  canvas: "#e9edf1", // 窗体磨砂底（macOS vibrancy 近似冷灰）
  surface: "#ffffff", // 居中白卡 / 白底（--bg / --card）

  // 文字
  foreground: "#1f2328", // 主文字·近黑（--fg）
  foregroundMuted: "#59636e", // 次要文字灰（--muted-fg）

  // 蓝点缀
  primary: "#0969da", // GitHub 蓝（--primary）：主按钮 / 链接 / 品牌 / 聚焦
  primaryHover: "#0860ca", // 主按钮 hover 加深
  primaryActive: "#0757ba", // 主按钮 pressed 更深
  onPrimary: "#ffffff", // 蓝底白字（--primary-fg）

  // 中性面
  muted: "#eaeef2", // 次级浅灰底（--secondary / --muted）：品牌行 badge 底 / spinner 轨道 / 描边按钮 hover
  hoverSurface: "#f6f8fa", // 极淡冷灰（--accent）：列表行 hover / 描边按钮静止底 / ghost hover

  // 描边 / 聚焦
  border: "#d1d9e0", // 边框浅灰（--border / --input）
  borderOnPrimary: "rgba(31,35,40,0.15)", // 蓝实心按钮的细描边（btn.df border-color）
  focusRing: "rgba(9,105,218,0.3)", // 键盘聚焦蓝环（--ring）

  // 语义·错误（GitHub flash-error）
  danger: "#cf222e", // 危险红（--destructive）
  dangerSurface: "rgba(207,34,46,0.06)", // flash-error 浅红底
  dangerBorder: "rgba(207,34,46,0.35)", // flash-error 红边
} as const;
