"""표준 라이브러리만으로 구현한 최소 Redis(RESP2) 클라이언트.

- 스레드마다 연결 하나를 유지한다 (ThreadingHTTPServer 대응).
- 연결이 끊기면 한 번 재연결 후 재시도한다.
- 처음 명령을 보낼 때 연결하므로 Redis가 늦게 떠도 서버가 죽지 않는다.
"""
import socket
import threading


class RedisError(Exception):
    pass


class Redis:
    def __init__(self, host, port=6379, password=None, timeout=5):
        self.host = host
        self.port = int(port)
        self.password = password
        self.timeout = timeout
        self._local = threading.local()

    def _connect(self):
        sock = socket.create_connection((self.host, self.port), timeout=self.timeout)
        conn = (sock, sock.makefile("rb"))
        if self.password:
            self._send(conn, ("AUTH", self.password))
        self._local.conn = conn
        return conn

    def _drop(self):
        conn = getattr(self._local, "conn", None)
        self._local.conn = None
        if conn:
            try:
                conn[1].close()
                conn[0].close()
            except OSError:
                pass

    def execute(self, *args):
        for attempt in (0, 1):
            conn = getattr(self._local, "conn", None)
            try:
                if conn is None:
                    conn = self._connect()
                return self._send(conn, args)
            except (OSError, ConnectionError):
                self._drop()
                if attempt:
                    raise

    def _send(self, conn, args):
        sock, rfile = conn
        out = [b"*%d\r\n" % len(args)]
        for a in args:
            b = a if isinstance(a, bytes) else str(a).encode()
            out.append(b"$%d\r\n%s\r\n" % (len(b), b))
        sock.sendall(b"".join(out))
        return self._read(rfile)

    def _read(self, rfile):
        line = rfile.readline()
        if not line:
            raise ConnectionError("redis connection closed")
        kind, rest = line[:1], line[1:-2]
        if kind == b"+":
            return rest.decode()
        if kind == b"-":
            raise RedisError(rest.decode())
        if kind == b":":
            return int(rest)
        if kind == b"$":
            n = int(rest)
            if n < 0:
                return None
            return rfile.read(n + 2)[:-2].decode()
        if kind == b"*":
            n = int(rest)
            if n < 0:
                return None
            return [self._read(rfile) for _ in range(n)]
        raise RedisError("unknown reply: %r" % line)

    # 자주 쓰는 명령 단축
    def get(self, k): return self.execute("GET", k)
    def set(self, k, v, *opts): return self.execute("SET", k, v, *opts)
    def delete(self, *ks): return self.execute("DEL", *ks)
    def hget(self, k, f): return self.execute("HGET", k, f)
    def hset(self, k, mapping):
        args = []
        for f, v in mapping.items():
            args += [f, v]
        return self.execute("HSET", k, *args)
    def hdel(self, k, *fs): return self.execute("HDEL", k, *fs)
    def hincrby(self, k, f, n): return self.execute("HINCRBY", k, f, n)

    def hgetall(self, k):
        flat = self.execute("HGETALL", k) or []
        return dict(zip(flat[0::2], flat[1::2]))
