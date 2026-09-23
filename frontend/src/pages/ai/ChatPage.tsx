// AI 对话页：左侧会话列表 + 右侧聊天区，选智能体或裸模型，两段式 SSE 流式输出。
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Empty, Input, List, Popconfirm, Select, Space, Tooltip, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, SendOutlined, StopOutlined } from '@ant-design/icons';
import {
  AiAgentSummary,
  AiChatMessage,
  AiConversation,
  AiModel,
  listAgents,
  listConversationMessages,
  listConversations,
  listModels,
  removeConversation,
  renameConversation,
  streamChat,
  submitChat
} from '../../api/ai';

interface ChatBubble extends Pick<AiChatMessage, 'role' | 'content' | 'status'> {
  streaming?: boolean;
}

const WELCOME_HINT = '选择一个智能体或直接输入问题开始对话。';

export const ChatPage: React.FC = () => {
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [agents, setAgents] = useState<AiAgentSummary[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [input, setInput] = useState('');
  // 统一选择目标：'agent:3' | 'model:5' | undefined（默认自动路由）。
  const [target, setTarget] = useState<string | undefined>();
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { agentId, modelId } = useMemo(() => {
    const [kind, id] = (target ?? ':').split(':');
    const parsed = Number(id);
    if (kind === 'agent' && Number.isFinite(parsed)) {
      return { agentId: parsed, modelId: undefined };
    }
    if (kind === 'model' && Number.isFinite(parsed)) {
      return { agentId: undefined, modelId: parsed };
    }
    return { agentId: undefined, modelId: undefined };
  }, [target]);

  const selectedAgent = agents.find((item) => item.id === agentId);
  const listBodyRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    setConversations(await listConversations());
  }, []);

  const loadPickers = useCallback(async () => {
    const [agentList, modelList] = await Promise.all([listAgents(), listModels()]);
    setAgents(agentList);
    setModels(modelList.filter((item) => item.status === 1 && item.capabilities.includes('chat')));
  }, []);

  useEffect(() => {
    void loadConversations();
    void loadPickers();
  }, [loadConversations, loadPickers]);

  // 滚动到底部。
  useEffect(() => {
    listBodyRef.current?.scrollTo({ top: listBodyRef.current.scrollHeight });
  }, [bubbles]);

  const openConversation = useCallback(
    async (conversation: AiConversation) => {
      setActiveId(conversation.id);
      setTarget(conversation.agentId ? `agent:${conversation.agentId}` : conversation.modelId ? `model:${conversation.modelId}` : undefined);
      const messages = await listConversationMessages(conversation.id);
      setBubbles(
        messages
          .filter((item) => item.role !== 'system')
          .map((item) => ({ role: item.role as 'user' | 'assistant', content: item.content, status: item.status }))
      );
    },
    []
  );

  const startNewConversation = useCallback(() => {
    setActiveId(null);
    setBubbles([]);
    setInput('');
    setTarget(undefined);
  }, []);

  const runStream = useCallback(
    async (targetConversationId: number, targetMessageId: number) => {
      abortRef.current = false;
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      setGenerating(true);
      setBubbles((prev) => [...prev, { role: 'assistant', content: '', status: 'ok', streaming: true }]);
      try {
        await streamChat(targetMessageId, {
          signal,
          onChunk: (text) => {
            if (abortRef.current) {
              return;
            }
            setBubbles((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === 'assistant') {
                next[next.length - 1] = { ...last, content: last.content + text };
              }
              return next;
            });
          },
          onDone: () => {
            setBubbles((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === 'assistant') {
                next[next.length - 1] = { ...last, streaming: false };
              }
              return next;
            });
          },
          onError: (messageText) => {
            setBubbles((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              const partial = last?.content ?? '';
              next[next.length - 1] = {
                role: 'assistant',
                content: partial ? `${partial}\n\n⚠ ${messageText}` : `⚠ ${messageText}`,
                status: 'failed',
                streaming: false
              };
              return next;
            });
          },
          onFatal: () => {
            if (!abortRef.current) {
              message.error('连接中断');
            }
          }
        });
      } finally {
        setGenerating(false);
        await loadConversations(); // 刷新标题/排序
      }
    },
    [loadConversations]
  );

  const send = useCallback(async () => {
    const content = input.trim();
    if (!content || generating) {
      return;
    }
    setInput('');
    setBubbles((prev) => [...prev, { role: 'user', content, status: 'ok' }]);
    try {
      const result = await submitChat({ conversationId: activeId ?? undefined, agentId, modelId, content });
      if (!activeId) {
        setActiveId(result.conversationId);
      }
      await runStream(result.conversationId, result.messageId);
    } catch {
      message.error('发送失败，请稍后重试');
    }
  }, [activeId, agentId, generating, input, modelId, runStream]);

  const stop = useCallback(() => {
    abortRef.current = true;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setGenerating(false);
    setBubbles((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === 'assistant') {
        next[next.length - 1] = { ...last, streaming: false };
      }
      return next;
    });
  }, []);

  const regenerate = useCallback(() => {
    // 找最后一条用户消息重发（上下文在服务端按会话历史组装）。
    const lastUser = [...bubbles].reverse().find((item) => item.role === 'user');
    if (!lastUser || generating) {
      return;
    }
    // 移除末尾的助手回复后按原内容重发。
    setBubbles((prev) => {
      const next = [...prev];
      while (next.length > 0 && next[next.length - 1].role === 'assistant') {
        next.pop();
      }
      return next;
    });
    void (async () => {
      try {
        const result = await submitChat({
          conversationId: activeId ?? undefined,
          agentId,
          modelId,
          content: lastUser.content
        });
        if (!activeId) {
          setActiveId(result.conversationId);
        }
        await runStream(result.conversationId, result.messageId);
      } catch {
        message.error('重新生成失败');
      }
    })();
  }, [activeId, agentId, bubbles, generating, modelId, runStream]);

  const handleRename = useCallback(
    async (conversation: AiConversation) => {
      const title = window.prompt('修改会话标题', conversation.title);
      if (title && title.trim()) {
        await renameConversation(conversation.id, title.trim());
        await loadConversations();
      }
    },
    [loadConversations]
  );

  const handleRemove = useCallback(
    async (conversation: AiConversation) => {
      await removeConversation(conversation.id);
      if (activeId === conversation.id) {
        startNewConversation();
      }
      await loadConversations();
    },
    [activeId, loadConversations, startNewConversation]
  );

  // 分组下拉：智能体与模型二选一。
  const targetOptions = useMemo(
    () => [
      {
        label: '智能体',
        title: '智能体',
        options: agents.map((item) => ({ value: `agent:${item.id}`, label: `🤖 ${item.name}` }))
      },
      {
        label: '模型',
        title: '模型',
        options: models.map((item) => ({ value: `model:${item.id}`, label: `⚡ ${item.displayName}` }))
      }
    ],
    [agents, models]
  );


  return (
    <div className="flex gap-4 h-[calc(100vh-140px)]">
      {/* 会话列表 */}
      <Card
        title="会话"
        className="w-[280px] shrink-0 flex flex-col"
        styles={{
          header: { padding: '8px 12px', minHeight: 'auto' },
          body: { flex: 1, overflow: 'auto', padding: '8px 4px' }
        }}
        extra={
          <Button size="small" icon={<PlusOutlined />} onClick={startNewConversation}>
            新会话
          </Button>
        }
      >
        {conversations.length === 0 ? (
          <Empty description="暂无会话" imageStyle={{ height: 48 }} />
        ) : (
          <List
            dataSource={conversations}
            renderItem={(item) => (
              <List.Item
                className="cursor-pointer !px-3 !py-2 rounded-lg"
                style={{ background: activeId === item.id ? 'rgba(22,119,255,0.08)' : undefined }}
                onClick={() => void openConversation(item)}
                actions={[
                  <Tooltip key="edit" title="重命名">
                    <Button
                      size="small"
                      type="text"
                      icon={<EditOutlined />}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleRename(item);
                      }}
                    />
                  </Tooltip>,
                  <Popconfirm
                    key="delete"
                    title="删除该会话及全部消息？"
                    onConfirm={(event) => {
                      event?.stopPropagation();
                      void handleRemove(item);
                    }}
                    onCancel={(event) => event?.stopPropagation()}
                  >
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </Popconfirm>
                ]}
              >
                <Typography.Text ellipsis className="max-w-[140px]">
                  {item.title}
                </Typography.Text>
              </List.Item>
            )}
          />
        )}
      </Card>

      {/* 聊天区 */}
      <Card
        className="flex-1 flex flex-col"
        styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '12px 16px' } }}
      >
        <Select
          className="w-[300px]"
          placeholder="默认路由（可选智能体或模型）"
          allowClear
          showSearch
          optionFilterProp="label"
          value={target}
          options={targetOptions}
          onChange={(value) => setTarget(value)}
        />

        <div ref={listBodyRef} className="flex-1 overflow-auto px-2 py-1">
          {bubbles.length === 0 ? (
            <Empty description={selectedAgent?.openingLine ?? WELCOME_HINT} imageStyle={{ height: 60 }} className="mt-20" />
          ) : (
            bubbles.map((bubble, index) => (
              <div
                key={index}
                className={`flex mb-3 ${bubble.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[78%] px-3.5 py-2.5 rounded-xl whitespace-pre-wrap break-words"
                  style={{
                    background: bubble.role === 'user' ? '#e6f4ff' : '#f5f5f5',
                    border: bubble.status === 'failed' ? '1px solid #ffa39e' : undefined
                  }}
                >
                  {bubble.content || (bubble.streaming ? '…' : '')}
                  {bubble.streaming && <span className="blink">▍</span>}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-[#f0f0f0] pt-2">
          <Space.Compact className="w-full">
            <Input
              placeholder="输入消息，Enter 发送"
              value={input}
              maxLength={4000}
              disabled={generating}
              onChange={(event) => setInput(event.target.value)}
              onPressEnter={() => void send()}
            />
            {generating ? (
              <Button danger icon={<StopOutlined />} onClick={stop}>
                停止
              </Button>
            ) : (
              <Button type="primary" icon={<SendOutlined />} disabled={!input.trim()} onClick={() => void send()}>
                发送
              </Button>
            )}
          </Space.Compact>
          {bubbles.length > 1 && !generating && (
            <Button type="link" size="small" className="mt-1" onClick={regenerate}>
              重新生成
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
};
