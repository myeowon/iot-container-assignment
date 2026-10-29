// 서버 API 호출 래퍼: JSON 송수신, 실패 응답은 서버 메시지를 담은 Error로 변환

async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    keepalive: method !== 'GET',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `요청에 실패했어요 (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const get = (path) => request('GET', path);
export const post = (path, body = {}) => request('POST', path, body);
export const put = (path, body) => request('PUT', path, body);
export const patch = (path, body) => request('PATCH', path, body);
export const del = (path) => request('DELETE', path);
