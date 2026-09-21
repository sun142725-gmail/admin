// 起卦前导屏：不提前填写所问之事，成卦后再补。
import { Button } from 'antd';

interface StartPanelProps {
  loading: boolean;
  onStart: () => void;
}

export const StartPanel: React.FC<StartPanelProps> = ({ loading, onStart }) => (
  <div className="wish-panel">
    <div className="wish-seal">卜</div>
    <h2 className="wish-title">易占 · 六爻</h2>
    <p className="wish-tip">屏息静心，心中默想所问之事。</p>
    <Button type="primary" className="wish-button" loading={loading} onClick={onStart}>
      起 卦
    </Button>
  </div>
);
