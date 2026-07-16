/**
 * LLM 请求工具
 * 
 * 所有 LLM 请求直接从浏览器发送到目标 API。
 * 大多数国产 LLM（阿里通义千问、百度文心等）的 API 都支持 CORS。
 * 如遇跨域问题，提示用户检查 API 是否支持浏览器直连。
 */

export async function proxyFetch(
  targetUrl: string,
  init: RequestInit
): Promise<Response> {
  return fetch(targetUrl, init);
}
