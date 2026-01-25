// 首页展示系统概览。
import React from 'react';
import { Card, Col, Row, Statistic, Typography } from 'antd';

const { Title, Paragraph } = Typography;

export const HomePage: React.FC = () => {
  return (
    <div>
      <Title level={3}>欢迎使用 RBAC 管理后台</Title>
      <Paragraph>从左侧菜单进入系统管理、日志管理与工具功能。</Paragraph>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="在线用户" value={1} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="系统模块" value={3} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="权限规则" value={0} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};
