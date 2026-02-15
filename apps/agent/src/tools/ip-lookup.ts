import { tool } from 'ai';
import { z } from 'zod';
import { createLogger } from '@okon/shared';

const logger = createLogger('tool-ip-lookup');

export const ipLookupTool = tool({
  description: '查询 IP 地址的地理位置、ISP、安全风险等详细信息',
  inputSchema: z.object({
    ip: z.string().describe('要查询的 IP 地址，例如：121.8.215.106')
  }),
  needsApproval: false,
  execute: async ({ ip }) => {
    logger.info('查询 IP 地理位置', { ip });

    try {
      const response = await fetch(`https://api.ipapi.is/?ip=${ip}`);

      if (!response.ok) {
        throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('IP 查询成功', { ip, country: data.location?.country, city: data.location?.city });

      return {
        success: true,
        ip: data.ip,
        // 地理位置信息
        location: {
          country: data.location?.country,
          country_code: data.location?.country_code,
          continent: data.location?.continent,
          state: data.location?.state,
          city: data.location?.city,
          latitude: data.location?.latitude,
          longitude: data.location?.longitude,
          zip: data.location?.zip,
          timezone: data.location?.timezone,
          local_time: data.location?.local_time,
          currency_code: data.location?.currency_code,
          calling_code: data.location?.calling_code,
          is_eu_member: data.location?.is_eu_member
        },
        // ASN 信息（自治系统号）
        asn: {
          asn: data.asn?.asn,
          org: data.asn?.org,
          route: data.asn?.route,
          descr: data.asn?.descr,
          country: data.asn?.country,
          type: data.asn?.type,
          domain: data.asn?.domain,
          abuser_score: data.asn?.abuser_score
        },
        // 公司/ISP 信息
        company: {
          name: data.company?.name,
          domain: data.company?.domain,
          type: data.company?.type,
          network: data.company?.network,
          abuser_score: data.company?.abuser_score
        },
        // 滥用联系信息
        abuse: {
          name: data.abuse?.name,
          email: data.abuse?.email,
          phone: data.abuse?.phone,
          address: data.abuse?.address
        },
        // 安全风险标记
        security: {
          is_bogon: data.is_bogon,
          is_mobile: data.is_mobile,
          is_datacenter: data.is_datacenter,
          is_tor: data.is_tor,
          is_proxy: data.is_proxy,
          is_vpn: data.is_vpn,
          is_abuser: data.is_abuser,
          is_crawler: data.is_crawler,
          is_satellite: data.is_satellite
        },
        // 其他信息
        rir: data.rir,
        elapsed_ms: data.elapsed_ms
      };
    } catch (error) {
      logger.error('IP 查询失败', { ip, error });
      return {
        success: false,
        ip,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
});
