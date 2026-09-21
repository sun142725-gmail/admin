// 水墨背景：宣纸纹理 + 远山横幅，纯装饰层。
export const InkBackground: React.FC = () => (
  <div className="ink-bg" aria-hidden>
    <div className="ink-bg-paper" />
    <img className="ink-bg-mountains" src="/divination/ink-mountains.jpg" alt="" />
    <div className="ink-bg-vignette" />
  </div>
);
