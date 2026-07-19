import { resolve } from 'path'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    resolve(__dirname, 'src/packages/*/index.html'),
    resolve(__dirname, 'src/packages/**/*.{vue,js,ts,jsx,tsx}'),
    resolve(__dirname, 'src/components/**/*.{vue,js,ts,jsx,tsx}'),
    resolve(__dirname, 'src/locales/**/*.{js,ts}')
  ],
  theme: {
    // 1. 全局颜色规范（主色/辅助/中性/状态色，全项目统一）
    colors: {
      primary: {
        50: '#f0f9ff',
        100: '#e0f2fe',
        200: '#bae6fd',
        300: '#7dd3fc',
        400: '#38bdf8',
        500: '#0ea5e9', // 主色基础
        600: '#0284c7',
        700: '#0369a1',
        800: '#075985',
        900: '#0c4a6e',
      },
      success: '#00b42a',
      warning: '#ff7d00',
      danger: '#f53f3f',
      info: '#86909c',
      // 中性灰（文字、分割、背景）
      gray: {
        50: '#f2f3f5',
        100: '#e5e6eb',
        200: '#c9cdd4',
        300: '#a9b1bf',
        400: '#86909c',
        500: '#6b7785',
        600: '#4e5969',
        700: '#272e3b',
        800: '#1d2129',
        900: '#0a0c10',
      },
      white: '#ffffff',
      black: '#000000',
    },

    // 2. 移动端统一字号（px，适配手机阅读）
    fontSize: {
      xs: '10px',
      sm: '12px',
      base: '14px',
      md: '16px',
      lg: '18px',
      xl: '20px',
      '2xl': '24px',
      '3xl': '28px',
    },

    // 3. 间距统一规范（margin/padding gap）
    spacing: {
      0: '0px',
      2: '2px',
      4: '4px',
      6: '6px',
      8: '8px',
      10: '10px',
      12: '12px',
      16: '16px',
      20: '20px',
      24: '24px',
      28: '28px',
      32: '32px',
    },

    // 4. 圆角统一（移动端柔和规范，禁止随意写圆角）
    borderRadius: {
      none: '0px',
      sm: '4px',
      md: '8px',
      lg: '12px',
      xl: '16px',
      full: '9999px',
    },

    // 5. 阴影层级规范（卡片/弹窗/浮层区分）
    boxShadow: {
      card: '0 1px 6px rgba(0,0,0,0.06)',
      popover: '0 2px 12px rgba(0,0,0,0.12)',
      modal: '0 4px 20px rgba(0,0,0,0.16)',
    },

    // 6. 移动端最小触控尺寸（按钮统一高度）
    height: {
      btn_sm: '32px',
      btn_md: '40px',
      btn_lg: '48px',
    },
    minHeight: {
      touch: '44px', // ios标准最小触控区域
    },

    // 7. 自定义移动端安全区、底部tab高度
    extend: {
      padding: {
        // 约束规定：16px 基础留白 + 系统手势条高度
        'safe-bottom': 'calc(1rem + env(safe-area-inset-bottom, 0))',
        'safe-only': 'env(safe-area-inset-bottom, 0)',
        'safe-top': 'calc(1rem + env(safe-area-inset-top, 0))',
        // 兼容旧用法（无 1rem 基础留白）
        safe_bottom: 'env(safe-area-inset-bottom)',
        safe_top: 'env(safe-area-inset-top)',
      },
      height: {
        tab_bar: '50px',
      },
      zIndex: {
        dialog: 999,
        popover: 99,
        header: 10,
      },
    },
  },
  plugins: [
    // 可选：插件统一封装移动端常用工具类
    function({ addUtilities }) {
      addUtilities({
        '.flex-center': {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
        '.flex-between': {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        '.text-ellipsis-1': {
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
        '.text-ellipsis-2': {
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }
      })
    }
  ]
}
