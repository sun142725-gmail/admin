// 应用入口负责初始化 NestJS、全局中间件与 Swagger。
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import * as express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

// 兜底未被捕获的 Promise 拒绝：Node 默认策略是抛出并终止进程，
// 任何一处漏接的异步异常（定时任务/事件回调）都会打崩服务；这里改为记录保活
process.on('unhandledRejection', (reason) => {
  new Logger('UnhandledRejection').error(
    reason instanceof Error ? reason.stack : String(reason)
  );
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  app.setGlobalPrefix('api');
  // 经 nginx 反代时信任第一层代理，req.ip 取 X-Forwarded-For 里的真实客户端 IP：
  // 否则全站限流/登录限流按代理 IP 共享一个桶（单用户可 429 全站），审计日志也全是代理 IP
  const httpAdapter = app.getHttpAdapter().getInstance();
  httpAdapter.set('trust proxy', 1);
  // 安全响应头兜底；CSP 关闭因 Swagger UI 与 /uploads 图片外链需要，页面安全头由前端站点负责
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  const uploadDir = join(process.cwd(), 'uploads');
  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadDir));
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? '*',
    credentials: true
  });
  // 全局异常过滤器在 LogCenterModule 以 APP_FILTER 注册（需注入 ErrorLog 仓库实现 5xx 落库）
  app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  // 生产环境不暴露接口文档，避免泄露 API 结构
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('RBAC API')
      .setDescription('企业级 RBAC 权限管理系统接口文档')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

bootstrap();
