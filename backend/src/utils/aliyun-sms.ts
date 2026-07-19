import Dysmsapi20170525, * as dysmsapi from '@alicloud/dysmsapi20170525';
import OpenApi, * as openapi from '@alicloud/openapi-client';
import Util, * as $Util from '@alicloud/tea-util';

const DEFAULT_SIGN_NAME = '恒创联众';
const DEFAULT_TEMPLATE_CODE = 'SMS_337130257';

let cachedClient: Dysmsapi20170525 | null = null;

function getClient() {
  if (cachedClient) {
    return cachedClient;
  }
  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
  if (!accessKeyId || !accessKeySecret) {
    throw new Error('ALIYUN_ACCESS_KEY_ID 或 ALIYUN_ACCESS_KEY_SECRET 未配置');
  }
  const config = new openapi.Config({
    accessKeyId,
    accessKeySecret
  });
  config.endpoint = process.env.ALIYUN_SMS_ENDPOINT || 'dysmsapi.aliyuncs.com';
  cachedClient = new Dysmsapi20170525(config);
  return cachedClient;
}

export async function sendSmsVerifyCode(params: {
  phoneNumber: string;
  code: string;
  min?: string;
  signName?: string;
  templateCode?: string;
}) {
  const request = new dysmsapi.SendSmsRequest({
    signName: params.signName || process.env.ALIYUN_SMS_SIGN_NAME || DEFAULT_SIGN_NAME,
    templateCode: params.templateCode || process.env.ALIYUN_SMS_VERIFY_TEMPLATE_CODE || DEFAULT_TEMPLATE_CODE,
    phoneNumbers: params.phoneNumber,
    templateParam: JSON.stringify({
      code: params.code,
      min: params.min || '5'
    })
  });
  const runtime = new $Util.RuntimeOptions({});
  const response = await getClient().sendSmsWithOptions(request, runtime);
  const body = response.body;
  if (body?.code && body.code !== 'OK') {
    console.log(request)
    console.log('2222', body.message)
    throw new Error(body.message || body.code);
  }
  return body;
}
