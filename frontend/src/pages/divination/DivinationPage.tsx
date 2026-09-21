// 六爻占卜页：全屏沉浸式三幕场景，流程编排见 useDivinationFlow。
// 路由位于 MainLayout 之外，独占整个视口。
import { Button } from 'antd';
import { Link } from 'react-router-dom';
import { InkBackground } from './components/InkBackground';
import { StartPanel } from './components/StartPanel';
import { CastPanel } from './components/CastPanel';
import { YaoStack } from './components/YaoStack';
import { HexagramPanel } from './components/HexagramPanel';
import { InterpretationPanel } from './components/InterpretationPanel';
import { useDivinationFlow } from './useDivinationFlow';
import './divination.css';

export const DivinationPage: React.FC = () => {
  const flow = useDivinationFlow();
  const { stage } = flow;
  const showResult =
    stage === 'revealing' ||
    stage === 'topic' ||
    stage === 'interpreting' ||
    stage === 'done' ||
    stage === 'failed';
  // 掷币阶段：碗区居中放大；成卦后整体左移，右侧展开解卦。
  const isCenterMode = stage === 'casting';

  return (
    <div className="divination-scene divination-fullscreen">
      <InkBackground />

      <Link to="/" className="divination-back">
        ‹ 返回系统
      </Link>

      {stage === 'idle' && <StartPanel loading={flow.loading} onStart={flow.start} />}

      {/* 起卦失败（无记录）：单独提示，可重试。 */}
      {stage === 'failed' && !flow.record && (
        <div className="wish-panel">
          <p className="wish-tip">⚠ {flow.streamError ?? '起卦失败，请稍后再试'}</p>
          <Button type="primary" className="wish-button" loading={flow.loading} onClick={flow.start}>
            重试起卦
          </Button>
        </div>
      )}

      {stage !== 'idle' && (
        <div className="divination-stage">
          <header className="divination-header">
            <span className="divination-topic">
              {flow.topic ? `「${flow.topic}」` : '六爻起卦'}
            </span>
            {stage === 'casting' && (
              <span className="divination-count">{flow.revealedCount}/6 爻</span>
            )}
            {stage !== 'casting' && (
              <Button size="small" className="divination-ghost" onClick={flow.reset}>
                再占一卦
              </Button>
            )}
          </header>

          <div
            className={`divination-columns ${isCenterMode ? 'is-center-mode' : 'is-result-mode'}`}
          >
            <section className="divination-left">
              {flow.record && (
                <CastPanel
                  record={flow.record}
                  revealedCount={stage === 'casting' ? flow.revealedCount : 6}
                  tossing={flow.tossing}
                  onToss={flow.toss}
                  compact={!isCenterMode}
                />
              )}
              <YaoStack
                lines={flow.record?.lines}
                revealedCount={stage === 'casting' ? flow.revealedCount : 6}
                active={stage === 'casting'}
              />
            </section>

            {showResult && flow.record && (
              <section className="divination-right">
                <HexagramPanel
                  record={flow.record}
                  stage={stage as 'revealing' | 'topic' | 'interpreting' | 'done' | 'failed'}
                />
                {/* revealing 阶段只展示卦名浮现，解卦面板等进入 topic 后再出现。 */}
                {stage !== 'revealing' && (
                  <InterpretationPanel
                    record={flow.record}
                    stage={stage as 'topic' | 'interpreting' | 'done' | 'failed'}
                    streamText={flow.streamText}
                    streamError={flow.streamError}
                    submitting={flow.submitting}
                    onSubmitTopic={flow.submitTopic}
                    onRetry={flow.retry}
                  />
                )}
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
