// 登录页面提供账号密码登录表单。
import React from 'react';
import { AppstoreOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { login as loginApi, profile as profileApi } from '../../api/auth';
import { useAppDispatch } from '../../store/hooks';
import { setProfile, setTokens } from '../../store/authSlice';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const onFinish = async (values: { username: string; password: string }) => {
    try {
      const data = await loginApi(values);
      dispatch(setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken }));
      const profile = await profileApi();
      dispatch(setProfile(profile));
      message.success('登录成功');
      navigate('/');
    } catch (error) {
      message.error('登录失败');
    }
  };

  return (
    <div className="login-shell">
      <div className="login-hero">
        <div className="login-hero-badge">
          <SafetyCertificateOutlined />
          企业级权限控制与运营后台
        </div>
        <div className="login-hero-title">统一权限、日志、通知与配置管理</div>
        <div className="login-hero-desc">
          面向多角色协作场景的管理后台骨架，涵盖 RBAC、审计链路、站内信与系统配置，适合作为业务中台的基础工作台。
        </div>
        <div className="login-hero-metrics">
          <div className="login-metric">
            <strong>RBAC</strong>
            角色权限控制
          </div>
          <div className="login-metric">
            <strong>Trace</strong>
            审计与前端日志
          </div>
          <div className="login-metric">
            <strong>Notify</strong>
            模板化消息发送
          </div>
        </div>
      </div>

      <div className="login-panel">
        <Card
          className="login-card"
          title={
            <div>
              <div className="login-card-title">
                <AppstoreOutlined style={{ marginRight: 8, color: '#1677ff' }} />
                RBAC 管理后台
              </div>
              <div className="login-card-subtitle">请输入账号密码进入控制台</div>
            </div>
          }
        >
          <Form layout="vertical" onFinish={onFinish}>
            <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请填写用户名' }]}>
              <Input placeholder="请输入用户名" />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true, message: '请填写密码' }]}>
              <Input.Password placeholder="请输入密码" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block>
              登录
            </Button>
          </Form>
        </Card>
      </div>
    </div>
  );
};
