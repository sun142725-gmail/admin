// 个人中心页面提供资料修改与密码修改。
import React, { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Space, Typography, Upload, message } from 'antd';
import type { UploadProps } from 'antd';
import { getProfile, updateProfile, updatePassword, uploadAvatar } from '../../api/profile';
import { useAppDispatch } from '../../store/hooks';
import { setProfile } from '../../store/authSlice';

const { Title } = Typography;

export const ProfilePage: React.FC = () => {
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const dispatch = useAppDispatch();

  const fetchProfile = async () => {
    const data = await getProfile();
    profileForm.setFieldsValue(data);
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const onUpdateProfile = async () => {
    const values = await profileForm.validateFields();
    setLoading(true);
    try {
      const updated = await updateProfile(values);
      dispatch(setProfile(updated));
      message.success('资料已更新');
    } finally {
      setLoading(false);
    }
  };

  const onUpdatePassword = async () => {
    const values = await passwordForm.validateFields();
    await updatePassword({ oldPassword: values.oldPassword, newPassword: values.newPassword });
    message.success('密码已修改，请重新登录');
  };

  const uploadProps: UploadProps = {
    showUploadList: false,
    customRequest: async ({ file, onSuccess, onError }) => {
      try {
        const res = await uploadAvatar(file as File);
        profileForm.setFieldsValue({ avatarUrl: res.avatarUrl });
        dispatch(setProfile({ ...profileForm.getFieldsValue(), avatarUrl: res.avatarUrl }));
        onSuccess?.(res, new XMLHttpRequest());
      } catch (error) {
        onError?.(error as Error);
      }
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Card style={{ marginBottom: 24 }}>
        <Title level={4}>个人资料</Title>
        <Form layout="vertical" form={profileForm}>
          <Form.Item label="头像" name="avatarUrl">
            <Space>
              <Upload {...uploadProps}>
                <Button>上传头像</Button>
              </Upload>
              <span>{profileForm.getFieldValue('avatarUrl') || '未上传'}</span>
            </Space>
          </Form.Item>
          <Form.Item label="昵称" name="nickname">
            <Input />
          </Form.Item>
          <Form.Item label="邮箱" name="email">
            <Input />
          </Form.Item>
          <Button type="primary" onClick={onUpdateProfile} loading={loading}>
            保存资料
          </Button>
        </Form>
      </Card>

      <Card>
        <Title level={4}>修改密码</Title>
        <Form layout="vertical" form={passwordForm}>
          <Form.Item label="旧密码" name="oldPassword" rules={[{ required: true, message: '请填写旧密码' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[
              { required: true, message: '请填写新密码' },
              { min: 6, message: '新密码至少 6 位' }
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Button type="primary" onClick={onUpdatePassword}>
            修改密码
          </Button>
        </Form>
      </Card>
    </div>
  );
};
