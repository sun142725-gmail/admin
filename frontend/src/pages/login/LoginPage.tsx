// 登录页面提供账号密码登录表单。
import React from 'react';
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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f0f2f5, #d6e4ff)'
      }}
    >
      <Card title="RBAC 管理后台" style={{ width: 360 }}>
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
  );
};
